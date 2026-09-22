import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * One deployment, two public web roles:
 *   FUNDING_PUBLIC_HOST (fund.aeko.online) -> public Testnet Funding Portal only.
 *   ADMIN_PUBLIC_HOST   (admin.aeko.online) -> operator console behind sign-in.
 *
 * The Rust Faucet Daemon is different: it is a private TCP service on the
 * deployment network and never receives a public hostname.
 *
 * Legacy /faucet and /api/faucet/* paths remain as compatibility shims only.
 */
const PUBLIC_PREFIXES = [
  '/funding',
  '/api/funding/',
  '/faucet',
  '/api/faucet/',
  '/login',
  '/api/login',
  '/api/logout',
]
const FUNDING_ONLY_PREFIXES = ['/funding', '/api/funding/', '/faucet', '/api/faucet/']

const hostOf = (req: NextRequest) =>
  (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(':')[0]
    .toLowerCase()

const isPublic = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p))

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const fundingHost = (
    process.env.FUNDING_PUBLIC_HOST ??
    process.env.FAUCET_PUBLIC_HOST ??
    ''
  ).toLowerCase()
  const adminHost = (process.env.ADMIN_PUBLIC_HOST ?? '').toLowerCase()
  const host = hostOf(req)

  if (pathname === '/faucet') {
    const url = req.nextUrl.clone()
    url.pathname = '/funding'
    return NextResponse.redirect(url, 308)
  }

  if (fundingHost && host === fundingHost && host !== adminHost) {
    if (pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/funding'
      return NextResponse.rewrite(url)
    }
    if (isPublic(pathname, FUNDING_ONLY_PREFIXES)) return NextResponse.next()
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: { message: 'Not available on this host' } }, { status: 404 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/funding'
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
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|map)$).*)'],
}
