type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SERVICE = 'aeko-operations-web'
const configuredLevel = ((process.env.AEKO_LOG_LEVEL ?? 'info').trim().toLowerCase() || 'info') as LogLevel
const configuredFormat = (process.env.AEKO_LOG_FORMAT ?? 'json').trim().toLowerCase()
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|key)$/i

function truncate(value: string, max = 6000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function sanitize(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (depth > 4) return '[MAX_DEPTH]'
  if (value instanceof Error) {
    return {
      name: truncate(value.name, 120),
      message: truncate(value.message, 1200),
      stack: truncate(value.stack ?? ''),
    }
  }
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return truncate(value, 2000)
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, depth + 1)]),
    )
  }
  return truncate(String(value), 2000)
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  const threshold = LEVELS[configuredLevel] ?? LEVELS.info
  if (LEVELS[level] < threshold) return

  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    environment: process.env.NODE_ENV ?? 'unknown',
    network: process.env.AEKO_NETWORK ?? 'unknown',
    event,
    ...(sanitize(fields) as Record<string, unknown>),
  }
  const message = configuredFormat === 'json'
    ? JSON.stringify(record)
    : `${record.timestamp} ${level.toUpperCase()} ${SERVICE} ${event} ${JSON.stringify(sanitize(fields))}`

  if (level === 'error') console.error(message)
  else if (level === 'warn') console.warn(message)
  else if (level === 'debug') console.debug(message)
  else console.info(message)
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
}

export function requestIdFromHeaders(headers: Headers): string {
  const incoming = (headers.get('x-request-id') ?? '').trim()
  return incoming && incoming.length <= 128 ? incoming : crypto.randomUUID()
}
