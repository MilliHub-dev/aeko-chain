import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * Everything is operator-only except the public faucet (page + API) and the
 * login flow. The RPC and Explorer proxies are behind the session too: they
 * were open before, which made this app an unauthenticated relay to the node.
 */
const PUBLIC_PREFIXES = ['/faucet', '/api/faucet/', '/login', '/api/login', '/api/logout']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { message: 'Admin sign-in required' } }, { status: 401 })
  }
  const login = req.nextUrl.clone()
  login.pathname = '/login'
  login.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(login)
}

export const config = {
  // Skip Next internals and static files.
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|map)$).*)'],
}
