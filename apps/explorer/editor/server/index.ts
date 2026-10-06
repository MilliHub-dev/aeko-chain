import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { Server as SocketServer } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/contracts/socket.js'
import { errorCode, errorMessage, errorStatus } from '../shared/errors/editor-errors.js'
import { SessionStore, socketSession } from './auth.js'
import { loadConfig } from './config.js'
import { TerminalManager } from './terminal.js'
import { editorRequestId, requireEditorSession, setEditorRequestId } from './types.js'
import { WorkspaceManager } from './workspaces.js'

const config = loadConfig()
const sessions = new SessionStore(config)
const workspaces = await new WorkspaceManager(config).init()
const app = express()
const server = createServer(app)
const io = new SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  path: '/socket.io',
  cors: {
    origin: config.publicOrigin || true,
    credentials: true,
  },
  allowRequest: (request, callback) => {
    const origin = String(request.headers.origin || '')
    callback(null, !config.production || origin === config.publicOrigin)
  },
  maxHttpBufferSize: 128 * 1024,
})
const terminals = new TerminalManager(config, io, workspaces)
const auth = sessions.middleware()
const dist = resolve(process.cwd(), 'dist')
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const

type LogLevel = keyof typeof LOG_LEVELS

function truncate(value: unknown, max = 1200): string {
  const text = String(value ?? '')
  return text.length > max ? text.slice(0, max) + '…' : text
}

function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[config.logLevel]) return
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

function errorFields(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error_message: truncate(error || 'unknown error') }
  return {
    error_name: truncate(error.name, 120),
    error_message: truncate(error.message),
    error_stack: truncate(error.stack || '', 6000),
  }
}

function requestId(request: Request): string {
  const incoming = String(request.headers['x-request-id'] || '').trim()
  return incoming && incoming.length <= 128 ? incoming : randomUUID()
}

function data<T>(response: Response, value: T, status = 200): void {
  response.status(status).json({ data: value })
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next)
  }
}

function bodyValue(request: Request, key: string): unknown {
  if (!request.body || typeof request.body !== 'object') return undefined
  return (request.body as Record<string, unknown>)[key]
}

function routeParam(request: Request, key: string): string {
  const value = request.params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

app.disable('x-powered-by')
app.use((request, response, next) => {
  const id = requestId(request)
  const startedAt = performance.now()
  setEditorRequestId(request, id)
  response.setHeader('x-request-id', id)
  response.once('finish', () => {
    const level: LogLevel = response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info'
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
app.use((_request, response, next) => {
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
  const session = sessions.authenticate(bodyValue(request, 'accessToken'))
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
  const session = requireEditorSession(request)
  data(response, { workspaces: await workspaces.list(session) })
}))

app.post('/api/workspaces', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  const workspace = await workspaces.create(session, request.body)
  data(response, workspace, 201)
}))

app.delete('/api/workspaces/:workspaceId', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  const key = terminals.key(session.id, routeParam(request, 'workspaceId'))
  const terminal = terminals.terminals.get(key)
  if (terminal) {
    try { terminal.terminal.kill() } catch { /* Best-effort terminal cleanup. */ }
    terminals.terminals.delete(key)
  }
  await workspaces.removeWorkspace(session, routeParam(request, 'workspaceId'))
  data(response, { deleted: true as const })
}))

app.get('/api/workspaces/:workspaceId/tree', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, { files: await workspaces.tree(session, routeParam(request, 'workspaceId')) })
}))

app.get('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.read(session, routeParam(request, 'workspaceId'), request.query.path))
}))

app.put('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.write(
    session,
    routeParam(request, 'workspaceId'),
    bodyValue(request, 'path'),
    bodyValue(request, 'content'),
  ))
}))

app.post('/api/workspaces/:workspaceId/file', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.write(
    session,
    routeParam(request, 'workspaceId'),
    bodyValue(request, 'path'),
    bodyValue(request, 'content'),
    { createOnly: true },
  ), 201)
}))

app.post('/api/workspaces/:workspaceId/directory', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.createDirectory(
    session,
    routeParam(request, 'workspaceId'),
    bodyValue(request, 'path'),
  ), 201)
}))

app.post('/api/workspaces/:workspaceId/rename', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.renamePath(
    session,
    routeParam(request, 'workspaceId'),
    bodyValue(request, 'from'),
    bodyValue(request, 'to'),
  ))
}))

app.delete('/api/workspaces/:workspaceId/path', auth, asyncRoute(async (request, response) => {
  const session = requireEditorSession(request)
  data(response, await workspaces.removePath(
    session,
    routeParam(request, 'workspaceId'),
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

  socket.on('terminal:start', async (payload) => {
    try {
      const workspaceId = String(payload.workspaceId || '')
      const record = await terminals.start(session, workspaceId, payload)
      await socket.join(record.room)
      socket.emit('terminal:ready', { history: record.history })
    } catch (error) {
      socket.emit('terminal:error', errorMessage(error, 'Terminal failed to start.'))
    }
  })

  socket.on('terminal:input', (payload) => {
    try {
      terminals.input(session, String(payload.workspaceId || ''), payload.data)
    } catch (error) {
      socket.emit('terminal:error', errorMessage(error, 'Terminal input failed.'))
    }
  })

  socket.on('terminal:resize', (payload) => {
    try {
      terminals.resize(session, String(payload.workspaceId || ''), payload.cols, payload.rows)
    } catch (error) {
      socket.emit('terminal:error', errorMessage(error, 'Terminal resize failed.'))
    }
  })
})

app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
  void _next
  const explicitStatus = errorStatus(error)
  const status = explicitStatus ?? (errorCode(error) === 'ENOENT' ? 404 : 400)
  const safeStatus = status >= 400 && status < 600 ? status : 500
  if (safeStatus >= 500) {
    log('error', 'studio_request_failed', {
      request_id: editorRequestId(request),
      ...errorFields(error),
    })
  }
  response.status(safeStatus).json({
    error: {
      code: safeStatus === 404 ? 'NOT_FOUND' : safeStatus === 413 ? 'LIMIT_EXCEEDED' : 'EDITOR_REQUEST_FAILED',
      message: safeStatus >= 500 ? 'AEKO Contract Studio failed internally.' : errorMessage(error),
    },
  })
})

if (config.production) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get('/{*splat}', (_request, response) => response.sendFile(resolve(dist, 'index.html')))
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
}

const interval = setInterval(async () => {
  sessions.sweep()
  terminals.sweep(config.workspaceTtlMs)
  const active = new Set([...sessions.sessions.values()].map((session) => session.id))
  await workspaces.sweep(active).catch((error: unknown) => log('error', 'workspace_sweep_failed', errorFields(error)))
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
