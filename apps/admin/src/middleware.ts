import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * One Operations Web deployment, two public roles:
 *   AEKO_PUBLIC_FUNDING_URL -> public Testnet Funding Portal.
 *   AEKO_PUBLIC_ADMIN_URL   -> operator Admin Console.
 *
 * The Rust Faucet Daemon is a separate private TCP service and has no public
 * route in this application.
 */
const PUBLIC_PREFIXES = [
  '/funding',
  '/api/funding/',
  '/login',
  '/api/login',
  '/api/logout',
]
const FUNDING_ONLY_PREFIXES = ['/funding', '/api/funding/']

const requestHost = (req: NextRequest) =>
  (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(':')[0]
    .toLowerCase()

function configuredHost(value: string | undefined): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const isPublic = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p))

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const fundingHost = configuredHost(process.env.AEKO_PUBLIC_FUNDING_URL)
  const adminHost = configuredHost(process.env.AEKO_PUBLIC_ADMIN_URL)
  const host = requestHost(req)

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
