import { NextRequest, NextResponse } from 'next/server'
import { logger, requestIdFromHeaders } from '@/lib/logger'

const MAX_BODY_BYTES = 16 * 1024
const WINDOW_MS = 60_000
const MAX_EVENTS_PER_WINDOW = 300
let windowStartedAt = Date.now()
let acceptedInWindow = 0

function telemetryAllowed(): boolean {
  const now = Date.now()
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now
    acceptedInWindow = 0
  }
  if (acceptedInWindow >= MAX_EVENTS_PER_WINDOW) return false
  acceptedInWindow += 1
  return true
}

function truncate(value: unknown, max: number): string {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  if (!telemetryAllowed()) {
    logger.warn('browser_telemetry_rate_limited', { request_id: requestId })
    return NextResponse.json(
      { error: { code: 'TELEMETRY_RATE_LIMITED', message: 'Telemetry rate limit exceeded' } },
      { status: 429, headers: { 'x-request-id': requestId } },
    )
  }
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) {
    return NextResponse.json(
      { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Telemetry requires application/json' } },
      { status: 415, headers: { 'x-request-id': requestId } },
    )
  }

  const raw = await req.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: 'BODY_TOO_LARGE', message: 'Telemetry payload is too large' } },
      { status: 413, headers: { 'x-request-id': requestId } },
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_TELEMETRY', message: 'Telemetry payload must be valid JSON' } },
      { status: 400, headers: { 'x-request-id': requestId } },
    )
  }

  const error = payload.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : {}
  const context = payload.context && typeof payload.context === 'object'
    ? payload.context as Record<string, unknown>
    : {}

  logger.error('browser_error', {
    request_id: requestId,
    path: truncate(payload.path, 512),
    source: truncate(context.source, 120),
    error_name: truncate(error.name || 'Error', 120),
    error_message: truncate(error.message || 'Unknown client error', 1200),
    error_stack: truncate(error.stack, 6000),
    component_stack: truncate(context.componentStack, 6000),
  })

  return NextResponse.json({ ok: true }, { status: 202, headers: { 'x-request-id': requestId } })
}
