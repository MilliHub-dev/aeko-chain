import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

const ADMIN_PUBLIC_PREFIXES = ['/login', '/api/login', '/api/logout']
const FUNDING_PUBLIC_PREFIXES = ['/funding', '/api/funding/']
const FUNDING_INTERNAL_PREFIX = '/api/internal/funding/'

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

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))

function notFound() {
  return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 })
}

function fundingRole(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = requestHost(req)
  const publicFundingHost = configuredHost(process.env.AEKO_PUBLIC_FUNDING_URL)

  // Private operator routes are reachable only through the Docker-network
  // service address. Even with the shared binary, the public funding origin
  // never routes these paths.
  if (pathname.startsWith(FUNDING_INTERNAL_PREFIX)) {
    if (publicFundingHost && host === publicFundingHost) return notFound()
    return NextResponse.next()
  }

  if (pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/funding'
    return NextResponse.rewrite(url)
  }

  if (matchesPrefix(pathname, FUNDING_PUBLIC_PREFIXES)) return NextResponse.next()

  if (pathname.startsWith('/api/')) return notFound()

  const url = req.nextUrl.clone()
  url.pathname = '/funding'
  url.search = ''
  return NextResponse.redirect(url)
}

async function adminRole(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Funding has its own service instance. Do not make public funding routes
  // available from the Admin origin, even to authenticated operators.
  if (matchesPrefix(pathname, FUNDING_PUBLIC_PREFIXES) || pathname.startsWith(FUNDING_INTERNAL_PREFIX)) {
    return notFound()
  }

  if (matchesPrefix(pathname, ADMIN_PUBLIC_PREFIXES)) return NextResponse.next()

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

export async function middleware(req: NextRequest) {
  const role = (process.env.AEKO_OPERATIONS_ROLE ?? 'admin').trim().toLowerCase()
  return role === 'funding' ? fundingRole(req) : adminRole(req)
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|map)$).*)'],
}
