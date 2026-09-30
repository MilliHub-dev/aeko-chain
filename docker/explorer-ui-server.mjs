import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'

const PORT = Number(process.env.PORT || 4000)
const ROOT = resolve('/app/dist')
const MAX_TELEMETRY_BODY_BYTES = 16 * 1024
const CLIENT_TELEMETRY_PATH = '/api/telemetry/client'
const LEGACY_EXPLORER_PROXY_PREFIX = '/api/explorer'
const RUNTIME_CONFIG_PATH = '/runtime-config.js'
const LOG_LEVEL = String(process.env.AEKO_LOG_LEVEL || 'info').trim().toLowerCase()
const LOG_FORMAT = String(process.env.AEKO_LOG_FORMAT || 'json').trim().toLowerCase()
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
let telemetryWindowStartedAt = Date.now()
let telemetryAcceptedInWindow = 0

function normalizeNetwork(value) {
  const network = String(value || '').trim().toLowerCase()
  return ['mainnet', 'testnet'].includes(network) ? network : ''
}

const ACTIVE_NETWORK = normalizeNetwork(process.env.AEKO_NETWORK)
if (!ACTIVE_NETWORK) {
  throw new Error('AEKO_NETWORK for public Scan must be mainnet or testnet')
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function json(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

function truncate(value, max = 1200) {
  const text = String(value ?? '')
  return text.length > max ? text.slice(0, max) + '…' : text
}

function errorFields(error) {
  if (!(error instanceof Error)) return { error_message: truncate(error || 'unknown error') }
  return {
    error_name: truncate(error.name, 120),
    error_message: truncate(error.message),
    error_stack: truncate(error.stack || '', 6000),
  }
}

function log(level, event, fields = {}) {
  if ((LEVELS[level] ?? LEVELS.info) < (LEVELS[LOG_LEVEL] ?? LEVELS.info)) return
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'aeko-scan',
    network: ACTIVE_NETWORK,
    event,
    ...fields,
  }
  const line = LOG_FORMAT === 'json'
    ? JSON.stringify(record)
    : record.timestamp + ' ' + level.toUpperCase() + ' aeko-scan ' + event + ' ' + JSON.stringify(fields)
  const target = level === 'error' || level === 'warn' ? process.stderr : process.stdout
  target.write(line + '\n')
}

function requestId(req) {
  const incoming = String(req.headers['x-request-id'] || '').trim()
  return incoming && incoming.length <= 128 ? incoming : randomUUID()
}

function telemetryAllowed() {
  const now = Date.now()
  if (now - telemetryWindowStartedAt >= 60_000) {
    telemetryWindowStartedAt = now
    telemetryAcceptedInWindow = 0
  }
  if (telemetryAcceptedInWindow >= 300) return false
  telemetryAcceptedInWindow += 1
  return true
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    let rejected = false

    req.on('data', (chunk) => {
      if (rejected) return
      size += chunk.length
      if (size > maxBytes) {
        rejected = true
        rejectBody(Object.assign(new Error('request body too large'), { code: 'BODY_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!rejected) resolveBody(Buffer.concat(chunks))
    })
    req.on('error', rejectBody)
  })
}

async function collectClientTelemetry(req, res, id) {
  if (req.method !== 'POST') {
    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
    return
  }
  if (!telemetryAllowed()) {
    json(res, 429, { error: { code: 'TELEMETRY_RATE_LIMITED', message: 'Telemetry rate limit exceeded' } })
    return
  }
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('application/json')) {
    json(res, 415, { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Telemetry requires application/json' } })
    return
  }

  let raw
  try {
    raw = await readRequestBody(req, MAX_TELEMETRY_BODY_BYTES)
  } catch (error) {
    json(res, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, {
      error: { code: 'INVALID_TELEMETRY', message: 'Invalid telemetry payload' },
    })
    return
  }

  let payload
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    json(res, 400, { error: { code: 'INVALID_TELEMETRY', message: 'Invalid telemetry payload' } })
    return
  }

  const clientError = payload?.error && typeof payload.error === 'object' ? payload.error : {}
  const context = payload?.context && typeof payload.context === 'object' ? payload.context : {}
  log('error', 'browser_error', {
    request_id: id,
    path: truncate(payload?.path || '', 512),
    source: truncate(context.source || 'browser', 120),
    error_name: truncate(clientError.name || 'Error', 120),
    error_message: truncate(clientError.message || 'Unknown client error'),
    error_stack: truncate(clientError.stack || '', 6000),
    component_stack: truncate(context.componentStack || '', 6000),
  })
  json(res, 202, { ok: true })
}

function safeStaticPath(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const candidate = resolve(ROOT, '.' + decoded)
  return candidate === ROOT || candidate.startsWith(ROOT + '/') ? candidate : null
}

function serveStatic(req, res, pathname) {
  let file = safeStaticPath(pathname)
  if (!file) {
    json(res, 400, { error: { code: 'INVALID_PATH', message: 'Invalid path' } })
    return
  }

  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html')
  if (!existsSync(file) || !statSync(file).isFile()) file = resolve(ROOT, 'index.html')

  const ext = extname(file).toLowerCase()
  const cacheControl = pathname === RUNTIME_CONFIG_PATH
    ? 'no-store, max-age=0'
    : ext === '.html'
      ? 'no-cache'
      : 'public, max-age=3600'

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

const server = createServer(async (req, res) => {
  const id = requestId(req)
  const startedAt = performance.now()
  const method = req.method || 'GET'
  const url = new URL(req.url || '/', 'http://explorer-ui.local')
  res.setHeader('X-Request-Id', id)
  res.once('finish', () => {
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request_completed', {
      request_id: id,
      method,
      path: url.pathname,
      status: res.statusCode,
      latency_ms: Math.round(performance.now() - startedAt),
    })
  })

  if (url.pathname === '/healthz' && ['GET', 'HEAD'].includes(method)) {
    const body = 'ok\n'
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    })
    res.end(method === 'HEAD' ? undefined : body)
    return
  }

  if (url.pathname === CLIENT_TELEMETRY_PATH) {
    await collectClientTelemetry(req, res, id)
    return
  }

  if (
    url.pathname === LEGACY_EXPLORER_PROXY_PREFIX
    || url.pathname.startsWith(LEGACY_EXPLORER_PROXY_PREFIX + '/')
  ) {
    json(res, 410, {
      error: {
        code: 'SCAN_EXPLORER_PROXY_REMOVED',
        message: 'Aeko Scan no longer proxies Explorer API traffic. Use the network explorerApiUrl from runtime-config.js directly.',
      },
    })
    return
  }

  if (!['GET', 'HEAD'].includes(method)) {
    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
    return
  }

  serveStatic(req, res, url.pathname)
})

process.on('uncaughtExceptionMonitor', (error) => {
  log('error', 'process_uncaught_exception', errorFields(error))
})
process.on('unhandledRejection', (reason) => {
  log('error', 'process_unhandled_rejection', errorFields(reason))
})

server.listen(PORT, '0.0.0.0', () => {
  log('info', 'service_started', {
    bind: `0.0.0.0:${PORT}`,
    log_format: LOG_FORMAT,
    log_level: LOG_LEVEL,
  })
})
