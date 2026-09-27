import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { logger, requestIdFromHeaders } from '@/lib/logger'

const ADMIN_PUBLIC_PREFIXES = ['/login', '/api/login', '/api/logout', '/api/telemetry/client']

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) =>
    pathname === prefix
    || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'),
  )

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId)
  return response
}

function nextWithRequestId(req: NextRequest, requestId: string) {
  const headers = new Headers(req.headers)
  headers.set('x-request-id', requestId)
  return withRequestId(NextResponse.next({ request: { headers } }), requestId)
}

async function adminRole(req: NextRequest, requestId: string) {
  const { pathname } = req.nextUrl

  if (matchesPrefix(pathname, ADMIN_PUBLIC_PREFIXES)) {
    logger.info('http_request_accepted', {
      request_id: requestId,
      method: req.method,
      path: pathname,
      auth: 'public',
    })
    return nextWithRequestId(req, requestId)
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) {
    logger.info('http_request_accepted', {
      request_id: requestId,
      method: req.method,
      path: pathname,
      auth: 'admin_session',
    })
    return nextWithRequestId(req, requestId)
  }

  logger.warn('http_request_rejected', {
    request_id: requestId,
    method: req.method,
    path: pathname,
    reason: 'admin_sign_in_required',
  })

  if (pathname.startsWith('/api/')) {
    return withRequestId(
      NextResponse.json({ error: { message: 'Admin sign-in required' } }, { status: 401 }),
      requestId,
    )
  }

  const login = req.nextUrl.clone()
  login.pathname = '/login'
  login.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
  return withRequestId(NextResponse.redirect(login), requestId)
}

export async function middleware(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  return adminRole(req, requestId)
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|map)$).*)'],
}
