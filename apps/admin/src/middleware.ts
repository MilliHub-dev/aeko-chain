import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

const ADMIN_PUBLIC_PREFIXES = ['/login', '/api/login', '/api/logout']

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) =>
    pathname === prefix
    || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'),
  )

function notFound() {
  return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 })
}

async function adminRole(req: NextRequest) {
  const { pathname } = req.nextUrl

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
  return adminRole(req)
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|map)$).*)'],
}
