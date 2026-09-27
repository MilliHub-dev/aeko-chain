import { NextRequest, NextResponse } from 'next/server'
import { adminPassword, createSessionToken, passwordMatches, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { logger, requestIdFromHeaders } from '@/lib/logger'

const attempts = new Map<string, { count: number; until: number }>()

function respond(requestId: string, body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } })
}

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  if (!adminPassword()) {
    logger.error('admin_login_unavailable', { request_id: requestId, reason: 'password_not_configured' })
    return respond(requestId, { error: { message: 'ADMIN_PASSWORD is not configured on this deployment' } }, 503)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const gate = attempts.get(ip)
  if (gate && gate.until > Date.now()) {
    logger.warn('admin_login_rate_limited', { request_id: requestId })
    return respond(requestId, { error: { message: 'Too many attempts. Try again in a few minutes.' } }, 429)
  }

  let password = ''
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? '')
  } catch {
    logger.warn('admin_login_invalid_body', { request_id: requestId })
  }

  if (!(await passwordMatches(password))) {
    const next = { count: (gate?.count ?? 0) + 1, until: 0 }
    if (next.count >= 5) {
      next.until = Date.now() + 5 * 60 * 1000
      next.count = 0
    }
    attempts.set(ip, next)
    logger.warn('admin_login_failed', { request_id: requestId, lockout_started: next.until > Date.now() })
    return respond(requestId, { error: { message: 'Wrong password' } }, 401)
  }

  attempts.delete(ip)
  const res = respond(requestId, { ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions)
  logger.info('admin_login_succeeded', { request_id: requestId })
  return res
}
