import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from './config.js'

type EnvPatch = Record<string, string | undefined>

function withEnvironment<T>(patch: EnvPatch, run: () => T): T {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return run()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('explicit local development starts without a shared access token', () => {
  withEnvironment({
    NODE_ENV: 'development',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
  }, () => {
    const config = loadConfig({ localDevelopment: true })
    assert.equal(config.production, false)
    assert.equal(config.allowInsecureLocal, true)
    assert.equal(config.accessToken, '')
  })
})

test('non-production startup still fails closed when local development was not requested', () => {
  withEnvironment({
    NODE_ENV: 'development',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
  }, () => {
    assert.throws(
      () => loadConfig(),
      /AEKO_EDITOR_ACCESS_TOKEN is required unless explicit insecure local mode is enabled/,
    )
  })
})

test('production ignores the local development flag and still requires an access token', () => {
  withEnvironment({
    NODE_ENV: 'production',
    AEKO_EDITOR_PUBLIC_ORIGIN: 'https://editor.aeko.online',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
  }, () => {
    assert.throws(
      () => loadConfig({ localDevelopment: true }),
      /AEKO_EDITOR_ACCESS_TOKEN is required unless explicit insecure local mode is enabled/,
    )
  })
})


test('local development defaults to readable text logs', () => {
  withEnvironment({
    NODE_ENV: 'development',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
    AEKO_LOG_FORMAT: undefined,
  }, () => {
    const config = loadConfig({ localDevelopment: true })
    assert.equal(config.logFormat, 'text')
  })
})

test('production defaults to structured JSON logs', () => {
  withEnvironment({
    NODE_ENV: 'production',
    AEKO_EDITOR_PUBLIC_ORIGIN: 'https://editor.aeko.online',
    AEKO_EDITOR_ACCESS_TOKEN: '0123456789abcdef0123456789abcdef',
    AEKO_LOG_FORMAT: undefined,
  }, () => {
    const config = loadConfig()
    assert.equal(config.logFormat, 'json')
  })
})

test('explicit log format overrides the environment default', () => {
  withEnvironment({
    NODE_ENV: 'development',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
    AEKO_LOG_FORMAT: 'json',
  }, () => {
    const config = loadConfig({ localDevelopment: true })
    assert.equal(config.logFormat, 'json')
  })
})


test('Studio exposes one direct WebSocket endpoint alongside the active RPC endpoint', () => {
  withEnvironment({
    NODE_ENV: 'development',
    AEKO_EDITOR_ACCESS_TOKEN: undefined,
    AEKO_EDITOR_ALLOW_INSECURE_LOCAL: undefined,
    AEKO_RPC_URL: 'https://rpc.example.test',
    AEKO_WS_URL: 'wss://ws.example.test',
  }, () => {
    const config = loadConfig({ localDevelopment: true })
    assert.equal(config.rpcUrl, 'https://rpc.example.test')
    assert.equal(config.websocketUrl, 'wss://ws.example.test')
  })
})
