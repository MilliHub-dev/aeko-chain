import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * One deployment, two hostnames:
 *   FAUCET_PUBLIC_HOST (chain.aeko.online)  → only the public faucet; "/" is the faucet.
 *   ADMIN_PUBLIC_HOST  (admin.aeko.online)  → operator console behind sign-in.
 * With neither configured (local dev) both live on the same host.
 *
 * Everything is operator-only except the public faucet (page + API) and the
 * login flow. The RPC and Explorer proxies are behind the session too: they
 * were open before, which made this app an unauthenticated relay to the node.
 */
const PUBLIC_PREFIXES = ['/faucet', '/api/faucet/', '/login', '/api/login', '/api/logout']
const FAUCET_ONLY_PREFIXES = ['/faucet', '/api/faucet/']

const hostOf = (req: NextRequest) => (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0].toLowerCase()
const isPublic = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(p))

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const faucetHost = (process.env.FAUCET_PUBLIC_HOST ?? '').toLowerCase()
  const adminHost = (process.env.ADMIN_PUBLIC_HOST ?? '').toLowerCase()
  const host = hostOf(req)

  if (faucetHost && host === faucetHost && host !== adminHost) {
    // The faucet host serves nothing operator-facing, not even the login page.
    if (pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/faucet'
      return NextResponse.rewrite(url)
    }
    if (isPublic(pathname, FAUCET_ONLY_PREFIXES)) return NextResponse.next()
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: { message: 'Not available on this host' } }, { status: 404 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/faucet'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (isPublic(pathname, PUBLIC_PREFIXES)) return NextResponse.next()

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
