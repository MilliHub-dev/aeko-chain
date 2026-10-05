import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { Server as SocketServer } from 'socket.io'
import { loadConfig } from './config.mjs'
import { SessionStore, socketSession } from './auth.mjs'
import { TerminalManager } from './terminal.mjs'
import { WorkspaceManager } from './workspaces.mjs'

const config = loadConfig()
const sessions = new SessionStore(config)
const workspaces = await new WorkspaceManager(config).init()
const app = express()
const server = createServer(app)
const io = new SocketServer(server, {
  path: '/socket.io',
  cors: {
    origin: config.publicOrigin || true,
    credentials: true,
  },
  maxHttpBufferSize: 128 * 1024,
})
const terminals = new TerminalManager(config, io, workspaces)
const auth = sessions.middleware()
const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, '../dist')
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

function truncate(value, max = 1200) {
  const text = String(value ?? '')
  return text.length > max ? text.slice(0, max) + '…' : text
}

function log(level, event, fields = {}) {
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) < (LOG_LEVELS[config.logLevel] ?? LOG_LEVELS.info)) return
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'aeko-contract-studio',
    network: config.network,
    event,
    ...fields,
  }
  const line = config.logFormat === 'json'
    ? JSON.stringify(record)
    : `${record.timestamp} ${level.toUpperCase()} aeko-contract-studio ${event} ${JSON.stringify(fields)}`
  const target = level === 'warn' || level === 'error' ? process.stderr : process.stdout
  target.write(line + '\n')
}

function errorFields(error) {
  if (!(error instanceof Error)) return { error_message: truncate(error || 'unknown error') }
  return {
    error_name: truncate(error.name, 120),
    error_message: truncate(error.message),
    error_stack: truncate(error.stack || '', 6000),
  }
}

function requestId(request) {
  const incoming = String(request.headers['x-request-id'] || '').trim()
  return incoming && incoming.length <= 128 ? incoming : randomUUID()
}

app.disable('x-powered-by')
app.use((request, response, next) => {
  const id = requestId(request)
  const startedAt = performance.now()
  request.editorRequestId = id
  response.setHeader('x-request-id', id)
  response.once('finish', () => {
    const level = response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info'
    log(level, 'http_request_completed', {
      request_id: id,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      latency_ms: Math.round(performance.now() - startedAt),
    })
  })
  next()
})
app.use((request, response, next) => {
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'same-origin')
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('cross-origin-opener-policy', 'same-origin')
  next()
})
app.use((request, response, next) => {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  if (
    config.production
    && mutating
    && request.path.startsWith('/api/')
    && request.headers.origin !== config.publicOrigin
  ) {
    response.status(403).json({
      error: { code: 'ORIGIN_REJECTED', message: 'Cross-origin Studio mutations are not allowed.' },
    })
    return
  }
  next()
})
app.use(express.json({ limit: config.maxFileBytes + 64 * 1024 }))

function data(response, value, status = 200) {
  response.status(status).json({ data: value })
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response)).catch(next)
  }
}

app.get('/healthz', (_request, response) => {
  response.type('text/plain').set('cache-control', 'no-store').send('ok\n')
})

app.get('/api/config', (_request, response) => {
  data(response, {
    network: config.network,
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
    authRequired: Boolean(config.accessToken),
  })
})

app.get('/api/session', (request, response) => {
  data(response, { authenticated: Boolean(sessions.fromRequest(request)) })
})

app.post('/api/session', (request, response) => {
  const session = sessions.authenticate(request.body?.accessToken)
  if (!session) {
    response.status(401).json({
      error: { code: 'INVALID_ACCESS_TOKEN', message: 'The Contract Studio access token is invalid.' },
    })
    return
  }
  response.setHeader('set-cookie', sessions.cookie(session))
  data(response, { authenticated: true })
})

app.delete('/api/session', (request, response) => {
  const session = sessions.fromRequest(request)
  if (session) terminals.closeSession(session.id)
  sessions.destroy(request)
  response.setHeader('set-cookie', sessions.clearCookie())
  data(response, { authenticated: false })
})

app.get('/api/workspaces', auth, asyncRoute(async (request, response) => {
  data(response, { workspaces: await workspaces.list(request.editorSession) })
}))

app.post('/api/workspaces', auth, asyncRoute(async (request, response) => {
  const workspace = await workspaces.create(request.editorSession, request.body)
  data(response, workspace, 201)
}))

app.delete('/api/workspaces/:workspaceId', auth, asyncRoute(async (request, response) => {
  const key = terminals.key(request.editorSession.id, request.params.workspaceId)
  const terminal = terminals.terminals.get(key)
  if (terminal) {
    try { terminal.terminal.kill() } catch {}
    terminals.terminals.delete(key)
  }
  await workspaces.removeWorkspace(request.editorSession, request.params.workspaceId)
  data(response, { deleted: true })
}))

app.get('/api/workspaces/:workspaceId/tree', auth, asyncRoute(async (request, response) => {
  data(response, { files: await workspaces.tree(request.editorSession, request.params.workspaceId) })
}))

app.get('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.read(request.editorSession, request.params.workspaceId, request.query.path))
}))

app.put('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.write(
    request.editorSession,
    request.params.workspaceId,
    request.body?.path,
    request.body?.content,
  ))
}))

app.post('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.write(
    request.editorSession,
    request.params.workspaceId,
    request.body?.path,
    request.body?.content,
    { createOnly: true },
  ), 201)
}))

app.post('/api/workspaces/:workspaceId/directory', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.createDirectory(
    request.editorSession,
    request.params.workspaceId,
    request.body?.path,
  ), 201)
}))

app.post('/api/workspaces/:workspaceId/rename', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.renamePath(
    request.editorSession,
    request.params.workspaceId,
    request.body?.from,
    request.body?.to,
  ))
}))

app.delete('/api/workspaces/:workspaceId/path', auth, asyncRoute(async (request, response) => {
  data(response, await workspaces.removePath(
    request.editorSession,
    request.params.workspaceId,
    request.query.path,
  ))
}))

io.use((socket, next) => {
  const session = socketSession(sessions, socket)
  if (!session) {
    next(new Error('AUTH_REQUIRED'))
    return
  }
  socket.data.editorSession = session
  next()
})

io.on('connection', (socket) => {
  const session = socket.data.editorSession

  socket.on('terminal:start', async (payload = {}) => {
    try {
      const workspaceId = String(payload.workspaceId || '')
      const record = await terminals.start(session, workspaceId, payload)
      await socket.join(record.room)
      socket.emit('terminal:ready', { history: record.history })
    } catch (error) {
      socket.emit('terminal:error', error.message)
    }
  })

  socket.on('terminal:input', (payload = {}) => {
    try {
      terminals.input(session, String(payload.workspaceId || ''), payload.data)
    } catch (error) {
      socket.emit('terminal:error', error.message)
    }
  })

  socket.on('terminal:resize', (payload = {}) => {
    try {
      terminals.resize(session, String(payload.workspaceId || ''), payload.cols, payload.rows)
    } catch (error) {
      socket.emit('terminal:error', error.message)
    }
  })
})

app.use((error, _request, response, _next) => {
  const status = Number(error?.status) || (error?.code === 'ENOENT' ? 404 : 400)
  const safeStatus = status >= 400 && status < 600 ? status : 500
  if (safeStatus >= 500) {
    log('error', 'studio_request_failed', {
      request_id: _request.editorRequestId,
      ...errorFields(error),
    })
  }
  response.status(safeStatus).json({
    error: {
      code: safeStatus === 404 ? 'NOT_FOUND' : safeStatus === 413 ? 'LIMIT_EXCEEDED' : 'EDITOR_REQUEST_FAILED',
      message: safeStatus >= 500 ? 'AEKO Contract Studio failed internally.' : error.message,
    },
  })
})

if (config.production) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get('/{*splat}', (_request, response) => response.sendFile(resolve(dist, 'index.html')))
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    root: resolve(here, '..'),
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
}

const interval = setInterval(async () => {
  sessions.sweep()
  terminals.sweep(config.workspaceTtlMs)
  const active = new Set([...sessions.sessions.values()].map((session) => session.id))
  await workspaces.sweep(active).catch((error) => log('error', 'workspace_sweep_failed', errorFields(error)))
}, 60_000)
interval.unref()

process.on('uncaughtExceptionMonitor', (error) => {
  log('error', 'process_uncaught_exception', errorFields(error))
})
process.on('unhandledRejection', (reason) => {
  log('error', 'process_unhandled_rejection', errorFields(reason))
})

server.listen(config.port, '0.0.0.0', () => {
  log('info', 'service_started', {
    bind: `0.0.0.0:${config.port}`,
    public_origin: config.publicOrigin,
    log_format: config.logFormat,
    log_level: config.logLevel,
  })
})
