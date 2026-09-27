'use client'

const TELEMETRY_ENDPOINT = '/api/telemetry/client'
const WINDOW_MS = 60_000
const MAX_EVENTS_PER_WINDOW = 20
let windowStartedAt = Date.now()
let sentInWindow = 0

function truncate(value: unknown, max: number): string {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function allowEvent(): boolean {
  const now = Date.now()
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now
    sentInWindow = 0
  }
  if (sentInWindow >= MAX_EVENTS_PER_WINDOW) return false
  sentInWindow += 1
  return true
}

export function reportClientError(error: unknown, source = 'browser', componentStack = '') {
  if (!allowEvent()) return
  const actual = error instanceof Error ? error : new Error(String(error ?? 'Unknown client error'))
  const payload = JSON.stringify({
    event: 'browser_error',
    level: 'error',
    path: typeof location === 'undefined' ? '' : truncate(location.pathname, 512),
    error: {
      name: truncate(actual.name, 120),
      message: truncate(actual.message, 1200),
      stack: truncate(actual.stack ?? '', 6000),
    },
    context: {
      source: truncate(source, 120),
      componentStack: truncate(componentStack, 6000),
    },
  })

  try {
    if (typeof navigator?.sendBeacon === 'function') {
      const body = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon(TELEMETRY_ENDPOINT, body)) return
    }
  } catch {
    // Best-effort telemetry must not become an application error itself.
  }

  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin',
    })
  } catch {
    // Ignore telemetry transport failure to avoid recursive logging.
  }
}
