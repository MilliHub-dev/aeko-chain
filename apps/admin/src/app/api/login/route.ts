import { NextRequest, NextResponse } from 'next/server'
import { adminPassword, createSessionToken, passwordMatches, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

const attempts = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  if (!adminPassword()) {
    return NextResponse.json({ error: { message: 'ADMIN_PASSWORD is not configured on this deployment' } }, { status: 503 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const gate = attempts.get(ip)
  if (gate && gate.until > Date.now()) {
    return NextResponse.json({ error: { message: 'Too many attempts. Try again in a few minutes.' } }, { status: 429 })
  }

  let password = ''
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? '')
  } catch {
    // fall through to the failed check
  }

  if (!(await passwordMatches(password))) {
    const next = { count: (gate?.count ?? 0) + 1, until: 0 }
    if (next.count >= 5) {
      next.until = Date.now() + 5 * 60 * 1000
      next.count = 0
    }
    attempts.set(ip, next)
    return NextResponse.json({ error: { message: 'Wrong password' } }, { status: 401 })
  }

  attempts.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions)
  return res
}
