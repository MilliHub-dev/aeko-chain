import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'

const PORT = Number(process.env.PORT || 4000)
const ROOT = resolve('/app/dist')
const UPSTREAM_TIMEOUT_MS = Number(process.env.AEKO_EXPLORER_PROXY_TIMEOUT_MS || 20_000)

function clean(name) {
  return String(process.env[name] || '').trim().replace(/\/+$/, '')
}

function normalizeNetwork(value) {
  const network = String(value || '').trim().toLowerCase()
  return ['mainnet', 'testnet'].includes(network) ? network : ''
}

const ACTIVE_NETWORK = normalizeNetwork(process.env.AEKO_NETWORK)
if (!ACTIVE_NETWORK) {
  throw new Error('AEKO_NETWORK for public Scan must be mainnet or testnet')
}

const ACTIVE_UPSTREAM = clean('AEKO_EXPLORER_PROXY_UPSTREAM_URL') || clean('AEKO_EXPLORER_API_URL')
if (!ACTIVE_UPSTREAM) {
  throw new Error('AEKO_EXPLORER_API_URL is required for the active Scan network')
}

const UPSTREAMS = {
  mainnet:
    clean('AEKO_MAINNET_EXPLORER_PROXY_UPSTREAM_URL')
    || clean('AEKO_MAINNET_EXPLORER_API_URL'),
  testnet:
    clean('AEKO_TESTNET_EXPLORER_PROXY_UPSTREAM_URL')
    || clean('AEKO_TESTNET_EXPLORER_API_URL'),
}
UPSTREAMS[ACTIVE_NETWORK] = ACTIVE_UPSTREAM

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

function upstreamFor(pathname) {
  for (const network of ['mainnet', 'testnet']) {
    const prefix = `/api/explorer/${network}`
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { prefix, upstream: UPSTREAMS[network], network }
    }
  }
  return null
}

const FUNDING_WRITE_PATHS = new Set(['/funding/request', '/funding/airdrop'])
const MAX_PROXY_BODY_BYTES = 64 * 1024
const MAX_TELEMETRY_BODY_BYTES = 16 * 1024
const CLIENT_TELEMETRY_PATH = '/api/telemetry/client'
const RUNTIME_CONFIG_PATH = '/runtime-config.js'
const LOG_LEVEL = String(process.env.AEKO_LOG_LEVEL || 'info').trim().toLowerCase()
const LOG_FORMAT = String(process.env.AEKO_LOG_FORMAT || 'json').trim().toLowerCase()
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
let telemetryWindowStartedAt = Date.now()
let telemetryAcceptedInWindow = 0

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
    network: ACTIVE_NETWORK || 'unknown',
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

function explorerSuffix(target, pathname) {
  return pathname.slice(target.prefix.length) || '/'
}

function isFundingApiPath(target, pathname) {
  if (target.network !== 'testnet' && target.network !== 'mainnet') return false
  const suffix = explorerSuffix(target, pathname)
  return suffix === '/funding/policy'
    || suffix === '/funding/request'
    || suffix.startsWith('/funding/request/')
    || suffix === '/funding/airdrop'
}

function explorerProxyMethodAllowed(method, target, pathname) {
  if (method === 'GET' || method === 'HEAD') return true
  if (method !== 'POST') return false
  if (target.network !== 'testnet' && target.network !== 'mainnet') return false
  return FUNDING_WRITE_PATHS.has(explorerSuffix(target, pathname))
}

function readProxyBody(req, maxBytes = MAX_PROXY_BODY_BYTES) {
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

async function proxyExplorer(req, res, url, target, id) {
  const method = req.method || 'GET'
  const startedAt = performance.now()
  if (!explorerProxyMethodAllowed(method, target, url.pathname)) {
    json(res, 405, {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Scan only proxies Explorer reads and the explicit funding request/airdrop writes',
      },
    })
    return
  }
  if (!target.upstream) {
    json(res, 503, {
      error: {
        code: 'EXPLORER_UPSTREAM_UNAVAILABLE',
        message: `${target.network} Explorer backend is not configured`,
      },
    })
    return
  }

  const suffix = url.pathname.slice(target.prefix.length) || '/'
  const upstreamUrl = new URL(target.upstream)
  const upstreamBasePath = upstreamUrl.pathname.replace(/\/+$/, '')
  upstreamUrl.pathname = upstreamBasePath + (suffix.startsWith('/') ? suffix : '/' + suffix)
  upstreamUrl.search = url.search
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    let body
    const headers = new Headers({
      Accept: req.headers.accept || 'application/json',
      'X-Request-Id': id,
    })

    if (method === 'POST') {
      const contentType = String(req.headers['content-type'] || '').toLowerCase()
      if (!contentType.startsWith('application/json')) {
        json(res, 415, {
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Funding writes require application/json',
          },
        })
        return
      }
      headers.set('Content-Type', 'application/json')
      for (const name of ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']) {
        const value = req.headers[name]
        if (typeof value === 'string' && value.trim()) headers.set(name, value)
      }
      try {
        body = await readProxyBody(req)
      } catch (error) {
        if (error?.code === 'BODY_TOO_LARGE') {
          json(res, 413, {
            error: {
              code: 'BODY_TOO_LARGE',
              message: 'Funding request body exceeds the Scan proxy limit',
            },
          })
          return
        }
        throw error
      }
    }

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      json(res, 502, {
        error: {
          code: 'EXPLORER_UPSTREAM_REDIRECT',
          message: 'Explorer backend returned an unexpected redirect',
        },
      })
      return
    }

    const upstreamContentType = String(upstream.headers.get('content-type') || '')
    if (
      isFundingApiPath(target, url.pathname)
      && !upstreamContentType.toLowerCase().includes('application/json')
    ) {
      log('error', 'funding_upstream_contract_violation', {
        request_id: id,
        method,
        path: url.pathname,
        target_network: target.network,
        upstream_origin: upstreamUrl.origin,
        upstream_status: upstream.status,
        upstream_content_type: truncate(upstreamContentType || 'missing', 160),
        latency_ms: Math.round(performance.now() - startedAt),
      })
      json(res, 502, {
        error: {
          code: 'EXPLORER_UPSTREAM_INVALID_RESPONSE',
          message: 'Explorer funding upstream returned a non-JSON response. Check the Scan-to-Explorer origin route and edge/WAF configuration.',
          upstreamStatus: upstream.status,
          upstreamContentType: String(upstreamContentType || 'missing').slice(0, 160),
        },
      })
      return
    }

    const responseHeaders = new Headers(upstream.headers)
    for (const name of [
      'connection',
      'content-encoding',
      'content-length',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ]) {
      responseHeaders.delete(name)
    }
    responseHeaders.set('Cache-Control', 'no-store')
    responseHeaders.set('X-AEKO-Explorer-Proxy', 'same-origin')
    responseHeaders.set('X-Request-Id', id)

    res.writeHead(upstream.status, Object.fromEntries(responseHeaders.entries()))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const responseBody = Buffer.from(await upstream.arrayBuffer())
    res.end(responseBody)
    log(upstream.status >= 500 ? 'error' : 'info', 'proxy_request_completed', {
      request_id: id,
      method,
      path: url.pathname,
      target_network: target.network,
      upstream_origin: upstreamUrl.origin,
      status: upstream.status,
      latency_ms: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    log('error', timeout ? 'proxy_request_timeout' : 'proxy_request_failed', {
      request_id: id,
      method,
      path: url.pathname,
      target_network: target.network,
      upstream_origin: upstreamUrl.origin,
      latency_ms: Math.round(performance.now() - startedAt),
      ...errorFields(error),
    })
    json(res, timeout ? 504 : 502, {
      error: {
        code: timeout ? 'EXPLORER_UPSTREAM_TIMEOUT' : 'EXPLORER_UPSTREAM_UNAVAILABLE',
        message: timeout ? 'Explorer backend timed out' : 'Explorer backend is unavailable',
      },
    })
  } finally {
    clearTimeout(timer)
  }
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
    raw = await readProxyBody(req, MAX_TELEMETRY_BODY_BYTES)
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

  const target = upstreamFor(url.pathname)
  if (target) {
    await proxyExplorer(req, res, url, target, id)
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
