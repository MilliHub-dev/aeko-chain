import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 4000)
const ROOT = resolve('/app/dist')
const TESTNET_UPSTREAM = String(
  process.env.AEKO_INTERNAL_EXPLORER_API_URL || 'http://explorer-api:8088',
).replace(/\/+$/, '')
const MAINNET_UPSTREAM = String(
  process.env.AEKO_INTERNAL_MAINNET_EXPLORER_API_URL || '',
).replace(/\/+$/, '')
const UPSTREAM_TIMEOUT_MS = Number(process.env.AEKO_EXPLORER_PROXY_TIMEOUT_MS || 20_000)

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
  const prefixes = [
    ['/api/explorer/testnet', TESTNET_UPSTREAM],
    ['/api/explorer/mainnet', MAINNET_UPSTREAM],
  ]
  for (const [prefix, upstream] of prefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { prefix, upstream }
    }
  }
  return null
}

async function proxyExplorer(req, res, url, target) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Explorer UI proxy is read-only' } })
    return
  }
  if (!target.upstream) {
    json(res, 503, { error: { code: 'EXPLORER_UPSTREAM_UNAVAILABLE', message: 'Selected Explorer backend is not configured' } })
    return
  }

  const suffix = url.pathname.slice(target.prefix.length) || '/'
  const upstreamUrl = new URL(suffix + url.search, target.upstream + '/')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: { Accept: req.headers.accept || 'application/json' },
      signal: controller.signal,
      redirect: 'manual',
    })

    const headers = new Headers(upstream.headers)
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
      headers.delete(name)
    }
    headers.set('Cache-Control', 'no-store')
    headers.set('X-AEKO-Explorer-Proxy', 'same-origin')

    res.writeHead(upstream.status, Object.fromEntries(headers.entries()))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const body = Buffer.from(await upstream.arrayBuffer())
    res.end(body)
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    json(res, timeout ? 504 : 502, {
      error: {
        code: timeout ? 'EXPLORER_UPSTREAM_TIMEOUT' : 'EXPLORER_UPSTREAM_UNAVAILABLE',
        message: timeout
          ? 'Explorer backend timed out'
          : 'Explorer backend is unavailable',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname)
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
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).pipe(res)
}

createServer(async (req, res) => {
  const method = req.method || 'GET'
  if (!['GET', 'HEAD'].includes(method)) {
    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
    return
  }

  const url = new URL(req.url || '/', 'http://explorer-ui.local')
  const target = upstreamFor(url.pathname)
  if (target) {
    await proxyExplorer(req, res, url, target)
    return
  }

  serveStatic(req, res, url.pathname)
}).listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`AEKO Explorer UI listening on 0.0.0.0:${PORT}\n`)
})
