import type { EditorServerConfig } from './types.js'

const SERVICE = 'aeko-contract-studio'
const LEVELS = { debug: 10, info: 20, success: 20, warn: 30, error: 40 } as const
const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  bold: '\u001b[1m',
} as const
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|key)$/i

export type StudioLogLevel = keyof typeof LEVELS

interface LogSink {
  write(chunk: string): unknown
  isTTY?: boolean
}

interface LoggerConfig {
  logLevel: EditorServerConfig['logLevel']
  logFormat: EditorServerConfig['logFormat']
  network: string
}

export interface LoggerOptions {
  stdout?: LogSink
  stderr?: LogSink
  color?: boolean
  now?: () => Date
}

export interface HttpLogFields {
  request_id: string
  method: string
  path: string
  status: number
  latency_ms: number
}

function truncate(value: unknown, max = 1200): string {
  const text = String(value ?? '')
  return text.length > max ? text.slice(0, max) + '…' : text
}

function redact(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    )
  }
  return value
}

function paint(enabled: boolean, color: keyof typeof ANSI, value: string): string {
  return enabled ? ANSI[color] + value + ANSI.reset : value
}

function displayTime(timestamp: string): string {
  return timestamp.slice(11, 23)
}

function scopeFor(event: string): string {
  if (event.startsWith('http_')) return 'HTTP'
  if (event.startsWith('service_')) return 'SERVER'
  if (event.startsWith('process_')) return 'PROCESS'
  if (event.startsWith('workspace_')) return 'WORKSPACE'
  if (event.startsWith('studio_')) return 'STUDIO'
  return 'APP'
}

function levelBadge(level: StudioLogLevel, color: boolean): string {
  const label = level.toUpperCase().padEnd(7)
  const tone: keyof typeof ANSI = level === 'debug'
    ? 'dim'
    : level === 'info'
      ? 'blue'
      : level === 'success'
        ? 'green'
        : level === 'warn'
          ? 'yellow'
          : 'red'
  return paint(color, tone, label)
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

function requestId(value: unknown): string {
  const text = String(value || '')
  return text.length > 8 ? text.slice(0, 8) : text
}

function isApplicationRequest(fields: Pick<HttpLogFields, 'method' | 'path'>): boolean {
  if (!['GET', 'HEAD'].includes(fields.method.toUpperCase())) return true
  return fields.path.startsWith('/api/')
}

function formatGenericFields(fields: Record<string, unknown>): string {
  const ignored = new Set(['error_name', 'error_message', 'error_stack'])
  return Object.entries(fields)
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${scalar(value)}`)
    .join('  ')
}

function formatText(
  level: StudioLogLevel,
  event: string,
  timestamp: string,
  fields: Record<string, unknown>,
  color: boolean,
): string {
  const prefix = [
    paint(color, 'dim', displayTime(timestamp)),
    levelBadge(level, color),
    paint(color, 'cyan', scopeFor(event).padEnd(9)),
  ].join('  ')

  if (event === 'http_request_completed') {
    const status = Number(fields.status || 0)
    const statusTone: keyof typeof ANSI = status >= 500 ? 'red' : status >= 400 ? 'yellow' : 'green'
    const statusText = paint(color, statusTone, String(status))
    return `${prefix}${String(fields.method || '').padEnd(7)} ${String(fields.path || '')}  ${statusText}  ${fields.latency_ms ?? '?'}ms  ${paint(color, 'dim', 'req=' + requestId(fields.request_id))}`
  }

  if (event === 'http_request_started') {
    return `${prefix}${String(fields.method || '').padEnd(7)} ${String(fields.path || '')}  ${paint(color, 'dim', 'req=' + requestId(fields.request_id))}`
  }

  if (event === 'service_started') {
    const endpoint = String(fields.public_origin || fields.bind || '')
    const details = [
      endpoint,
      fields.network ? `network=${fields.network}` : '',
      fields.log_format && fields.log_level ? `logs=${fields.log_format}/${fields.log_level}` : '',
    ].filter(Boolean).join('  ')
    return `${prefix}${paint(color, 'bold', 'AEKO Contract Studio ready')}  ${details}`
  }

  const message = fields.error_message
    ? `${event}  ${paint(color, level === 'error' ? 'red' : 'yellow', String(fields.error_name || 'Error') + ': ' + String(fields.error_message))}`
    : event
  const extras = formatGenericFields(fields)
  const lines = [`${prefix}${message}${extras ? '  ' + extras : ''}`]

  if (fields.error_stack) {
    const stack = String(fields.error_stack).split('\n')
    const first = stack[0] || ''
    const messageText = String(fields.error_message || '')
    const rest = messageText && first.includes(messageText) ? stack.slice(1) : stack
    for (const line of rest) {
      if (line.trim()) lines.push(`${paint(color, 'dim', '             │')} ${line}`)
    }
  }

  return lines.join('\n')
}

export function errorFields(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error_message: truncate(error || 'unknown error') }
  return {
    error_name: truncate(error.name, 120),
    error_message: truncate(error.message),
    error_stack: truncate(error.stack || '', 6000),
  }
}

export function createStudioLogger(config: LoggerConfig, options: LoggerOptions = {}) {
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const now = options.now ?? (() => new Date())
  const color = options.color ?? (
    config.logFormat === 'text'
    && Boolean(stdout.isTTY)
    && process.env.NO_COLOR === undefined
    && process.env.TERM !== 'dumb'
  )

  function log(level: StudioLogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (LEVELS[level] < LEVELS[config.logLevel]) return

    const safeFields = redact(fields) as Record<string, unknown>
    const record = {
      timestamp: now().toISOString(),
      level: level === 'success' ? 'info' : level,
      service: SERVICE,
      network: config.network,
      event,
      ...safeFields,
    }

    const line = config.logFormat === 'json'
      ? JSON.stringify(record)
      : formatText(level, event, record.timestamp, { network: config.network, ...safeFields }, color)
    const target = level === 'warn' || level === 'error' ? stderr : stdout
    target.write(line + '\n')
  }

  return {
    debug: (event: string, fields?: Record<string, unknown>) => log('debug', event, fields),
    info: (event: string, fields?: Record<string, unknown>) => log('info', event, fields),
    success: (event: string, fields?: Record<string, unknown>) => log('success', event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => log('warn', event, fields),
    error: (event: string, fields?: Record<string, unknown>) => log('error', event, fields),
    requestStarted(fields: Omit<HttpLogFields, 'status' | 'latency_ms'>) {
      log('debug', 'http_request_started', fields)
    },
    requestCompleted(fields: HttpLogFields) {
      if (fields.status >= 500) log('error', 'http_request_completed', fields)
      else if (fields.status >= 400) log('warn', 'http_request_completed', fields)
      else if (config.logFormat === 'json' || isApplicationRequest(fields)) {
        log('success', 'http_request_completed', fields)
      } else {
        log('debug', 'http_request_completed', fields)
      }
    },
  }
}
