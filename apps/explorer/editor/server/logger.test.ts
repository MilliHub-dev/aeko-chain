import assert from 'node:assert/strict'
import test from 'node:test'
import { createStudioLogger, errorFields } from './logger.js'

class Sink {
  value = ''
  isTTY = false
  write(chunk: string) {
    this.value += chunk
  }
}

const fixedNow = () => new Date('2026-10-06T20:45:17.391Z')

test('text logger renders compact API success lines instead of JSON dumps', () => {
  const stdout = new Sink()
  const stderr = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'text', network: 'testnet' },
    { stdout, stderr, color: false, now: fixedNow },
  )

  logger.requestCompleted({
    request_id: '7e2d14dc-2171-4201-8dbb-aa80f60526e1',
    method: 'GET',
    path: '/api/config',
    status: 200,
    latency_ms: 12,
  })

  assert.match(stdout.value, /20:45:17\.391\s+SUCCESS\s+HTTP/)
  assert.match(stdout.value, /GET\s+\/api\/config\s+200\s+12ms/)
  assert.match(stdout.value, /req=7e2d14dc/)
  assert.doesNotMatch(stdout.value, /^\{/)
  assert.equal(stderr.value, '')
})

test('successful Vite and static asset requests are debug-only in text mode', () => {
  const normal = new Sink()
  const normalLogger = createStudioLogger(
    { logLevel: 'info', logFormat: 'text', network: 'testnet' },
    { stdout: normal, stderr: new Sink(), color: false, now: fixedNow },
  )
  normalLogger.requestCompleted({
    request_id: 'static123',
    method: 'GET',
    path: '/src/main.tsx',
    status: 200,
    latency_ms: 12,
  })
  assert.equal(normal.value, '')

  const debug = new Sink()
  const debugLogger = createStudioLogger(
    { logLevel: 'debug', logFormat: 'text', network: 'testnet' },
    { stdout: debug, stderr: new Sink(), color: false, now: fixedNow },
  )
  debugLogger.requestCompleted({
    request_id: 'static123',
    method: 'GET',
    path: '/node_modules/.vite/deps/react.js',
    status: 200,
    latency_ms: 4,
  })
  assert.match(debug.value, /DEBUG\s+HTTP/)
  assert.match(debug.value, /\/node_modules\/\.vite\/deps\/react\.js\s+200\s+4ms/)
})

test('structured JSON keeps successful static requests at info level', () => {
  const stdout = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'json', network: 'testnet' },
    { stdout, stderr: new Sink(), color: false, now: fixedNow },
  )
  logger.requestCompleted({
    request_id: 'static-json',
    method: 'GET',
    path: '/src/main.tsx',
    status: 200,
    latency_ms: 3,
  })

  const record = JSON.parse(stdout.value)
  assert.equal(record.level, 'info')
  assert.equal(record.event, 'http_request_completed')
  assert.equal(record.path, '/src/main.tsx')
})

test('warnings and errors are routed to stderr with readable stack lines', () => {
  const stdout = new Sink()
  const stderr = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'text', network: 'testnet' },
    { stdout, stderr, color: false, now: fixedNow },
  )

  const error = new Error('worker failed')
  logger.error('process_unhandled_rejection', errorFields(error))

  assert.equal(stdout.value, '')
  assert.match(stderr.value, /ERROR\s+PROCESS\s+process_unhandled_rejection/)
  assert.match(stderr.value, /Error: worker failed/)
  assert.match(stderr.value, /\n\s+│/)
})

test('json logger keeps structured production records and redacts sensitive fields', () => {
  const stdout = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'json', network: 'testnet' },
    { stdout, stderr: new Sink(), color: false, now: fixedNow },
  )

  logger.info('service_started', { access_token: 'secret-value', bind: '0.0.0.0:4100' })
  const record = JSON.parse(stdout.value)

  assert.equal(record.timestamp, '2026-10-06T20:45:17.391Z')
  assert.equal(record.level, 'info')
  assert.equal(record.service, 'aeko-contract-studio')
  assert.equal(record.network, 'testnet')
  assert.equal(record.event, 'service_started')
  assert.equal(record.access_token, '[REDACTED]')
  assert.equal(record.bind, '0.0.0.0:4100')
})

test('debug request logs stay silent unless debug logging is enabled', () => {
  const normal = new Sink()
  const normalLogger = createStudioLogger(
    { logLevel: 'info', logFormat: 'text', network: 'testnet' },
    { stdout: normal, stderr: new Sink(), color: false, now: fixedNow },
  )
  normalLogger.requestStarted({ request_id: 'abc12345', method: 'GET', path: '/api/config' })
  assert.equal(normal.value, '')

  const debug = new Sink()
  const debugLogger = createStudioLogger(
    { logLevel: 'debug', logFormat: 'text', network: 'testnet' },
    { stdout: debug, stderr: new Sink(), color: false, now: fixedNow },
  )
  debugLogger.requestStarted({ request_id: 'abc12345', method: 'GET', path: '/api/config' })
  assert.match(debug.value, /DEBUG\s+HTTP\s+GET\s+\/api\/config/)
})

test('text logger emits ANSI level colors when color is enabled', () => {
  const stdout = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'text', network: 'testnet' },
    { stdout, stderr: new Sink(), color: true, now: fixedNow },
  )

  logger.success('service_started', {
    public_origin: 'http://localhost:4100',
    log_format: 'text',
    log_level: 'info',
  })

  assert.equal(stdout.value.includes('\u001b['), true)
  assert.match(stdout.value, /AEKO Contract Studio ready/)
})


test('success presentation remains info in structured JSON', () => {
  const stdout = new Sink()
  const logger = createStudioLogger(
    { logLevel: 'info', logFormat: 'json', network: 'testnet' },
    { stdout, stderr: new Sink(), color: false, now: fixedNow },
  )

  logger.success('service_started', { bind: '0.0.0.0:4100' })
  const record = JSON.parse(stdout.value)
  assert.equal(record.level, 'info')
  assert.equal(record.event, 'service_started')
})
