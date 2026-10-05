import { resolve } from 'node:path'

function positiveInteger(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return value
}

function endpoint(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim()
  if (!value) return ''
  const parsed = new URL(value)
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`${name} must be an HTTP(S) or WS(S) URL.`)
  }
  return value.replace(/\/+$/, '')
}

export function loadConfig() {
  const production = process.env.NODE_ENV === 'production'
  const allowInsecureLocal = process.env.AEKO_EDITOR_ALLOW_INSECURE_LOCAL === '1'
  const accessToken = String(process.env.AEKO_EDITOR_ACCESS_TOKEN || '')
  const publicOrigin = String(
    process.env.AEKO_EDITOR_PUBLIC_ORIGIN
      || (production ? '' : 'http://localhost:4100'),
  ).replace(/\/+$/, '')

  if (production && !publicOrigin) {
    throw new Error('AEKO_EDITOR_PUBLIC_ORIGIN is required in production.')
  }
  if (!accessToken && !(allowInsecureLocal && !production)) {
    throw new Error('AEKO_EDITOR_ACCESS_TOKEN is required unless explicit insecure local mode is enabled.')
  }

  const logLevel = String(process.env.AEKO_LOG_LEVEL || 'info').trim().toLowerCase()
  const logFormat = String(process.env.AEKO_LOG_FORMAT || 'json').trim().toLowerCase()
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error('AEKO_LOG_LEVEL must be debug, info, warn, or error.')
  }
  if (!['json', 'text'].includes(logFormat)) {
    throw new Error('AEKO_LOG_FORMAT must be json or text.')
  }

  return Object.freeze({
    production,
    logLevel,
    logFormat,
    port: positiveInteger('PORT', 4100, { max: 65535 }),
    publicOrigin,
    accessToken,
    network: String(process.env.AEKO_NETWORK || 'testnet').trim().toLowerCase(),
    rpcUrl: endpoint('AEKO_RPC_URL', production ? '' : 'http://127.0.0.1:8899'),
    explorerUrl: endpoint('AEKO_EXPLORER_URL', production ? '' : 'http://127.0.0.1:4000'),
    workspaceRoot: resolve(process.env.AEKO_EDITOR_WORKSPACE_ROOT || '/workspaces'),
    sandboxUidStart: positiveInteger('AEKO_EDITOR_SANDBOX_UID_START', 20000, { min: 10000, max: 50000 }),
    maxSessions: positiveInteger('AEKO_EDITOR_MAX_SESSIONS', 128, { max: 1000 }),
    sessionTtlMs: positiveInteger('AEKO_EDITOR_SESSION_TTL_SECONDS', 43200, { max: 604800 }) * 1000,
    workspaceTtlMs: positiveInteger('AEKO_EDITOR_WORKSPACE_TTL_SECONDS', 43200, { max: 604800 }) * 1000,
    maxWorkspacesPerSession: positiveInteger('AEKO_EDITOR_MAX_WORKSPACES', 8, { max: 32 }),
    maxFilesPerWorkspace: positiveInteger('AEKO_EDITOR_MAX_FILES', 2000, { max: 10000 }),
    maxFileBytes: positiveInteger('AEKO_EDITOR_MAX_FILE_BYTES', 2 * 1024 * 1024, { max: 16 * 1024 * 1024 }),
    maxWorkspaceBytes: positiveInteger('AEKO_EDITOR_MAX_WORKSPACE_BYTES', 64 * 1024 * 1024, { max: 1024 * 1024 * 1024 }),
    terminalHistoryBytes: positiveInteger('AEKO_EDITOR_TERMINAL_HISTORY_BYTES', 256 * 1024, { max: 2 * 1024 * 1024 }),
    allowInsecureLocal,
  })
}
