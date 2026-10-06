import { resolve } from 'node:path'
import type { EditorServerConfig } from './types.js'

const appRoot = process.cwd()

function positiveInteger(
  name: string,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return value
}

function endpoint(name: string, fallback = ''): string {
  const value = String(process.env[name] || fallback).trim()
  if (!value) return ''
  const parsed = new URL(value)
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`${name} must be an HTTP(S) or WS(S) URL.`)
  }
  return value.replace(/\/+$/, '')
}

function logLevel(value: string): EditorServerConfig['logLevel'] {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value
  throw new Error('AEKO_LOG_LEVEL must be debug, info, warn, or error.')
}

function logFormat(value: string): EditorServerConfig['logFormat'] {
  if (value === 'json' || value === 'text') return value
  throw new Error('AEKO_LOG_FORMAT must be json or text.')
}

export interface LoadConfigOptions {
  localDevelopment?: boolean
}

export function loadConfig(
  { localDevelopment = false }: LoadConfigOptions = {},
): Readonly<EditorServerConfig> {
  const production = process.env.NODE_ENV === 'production'
  const allowInsecureLocal = !production && (
    localDevelopment || process.env.AEKO_EDITOR_ALLOW_INSECURE_LOCAL === '1'
  )
  const accessToken = String(process.env.AEKO_EDITOR_ACCESS_TOKEN || '')
  const publicOrigin = String(
    process.env.AEKO_EDITOR_PUBLIC_ORIGIN
      || (production ? '' : 'http://localhost:4100'),
  ).replace(/\/+$/, '')

  if (production && !publicOrigin) {
    throw new Error('AEKO_EDITOR_PUBLIC_ORIGIN is required in production.')
  }
  if (!accessToken && !allowInsecureLocal) {
    throw new Error('AEKO_EDITOR_ACCESS_TOKEN is required unless explicit insecure local mode is enabled.')
  }
  if (production && accessToken.length < 32) {
    throw new Error('AEKO_EDITOR_ACCESS_TOKEN must contain at least 32 characters in production.')
  }

  return Object.freeze({
    production,
    logLevel: logLevel(String(process.env.AEKO_LOG_LEVEL || 'info').trim().toLowerCase()),
    logFormat: logFormat(String(
      process.env.AEKO_LOG_FORMAT || (production ? 'json' : 'text'),
    ).trim().toLowerCase()),
    port: positiveInteger('PORT', 4100, { max: 65535 }),
    publicOrigin,
    accessToken,
    network: String(process.env.AEKO_NETWORK || 'testnet').trim().toLowerCase(),
    rpcUrl: endpoint('AEKO_RPC_URL', production ? '' : 'http://127.0.0.1:8899'),
    explorerUrl: endpoint('AEKO_EXPLORER_URL', production ? '' : 'http://127.0.0.1:4000'),
    workspaceRoot: resolve(
      process.env.AEKO_EDITOR_WORKSPACE_ROOT
        || (production ? '/workspaces' : resolve(appRoot, '.aeko-workspaces')),
    ),
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
