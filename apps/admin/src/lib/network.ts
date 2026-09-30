// Operations Web belongs to the same single chain environment as the
// services it administers. Cross-network endpoint matrices belong to Aeko
// Scan, not to Admin.

const HARDCODED_LOCAL_RPC = 'http://localhost:8899'
const HARDCODED_LOCAL_EXPLORER = 'http://localhost:8088'

function clean(name: string): string {
  return (process.env[name] ?? '').trim()
}

function serverUrl(name: string, localFallback: string): string {
  const value = clean(name)
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${name} is required in production`)
    }
    return localFallback
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid http(s) URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`)
  }
  if (/[<>]/.test(value) || /\bset\s/i.test(value)) {
    throw new Error(`${name} contains placeholder or guidance text`)
  }
  return value.replace(/\/+$/, '')
}

export type AekoNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet'

export function describeAdminNetwork(): AekoNetwork {
  const value = clean('AEKO_NETWORK').toLowerCase()
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value
  }
  return 'localnet'
}

export function isMainnetConfigured(): boolean {
  return describeAdminNetwork() === 'mainnet'
}

export function resolveAdminRpcUrl(): string {
  return serverUrl('AEKO_RPC_URL', HARDCODED_LOCAL_RPC)
}

export function resolveAdminExplorerUrl(): string {
  return serverUrl('AEKO_EXPLORER_API_URL', HARDCODED_LOCAL_EXPLORER)
}

export function resolveAdminExplorerTimeoutMs(): number {
  const configured = Number(clean('AEKO_ADMIN_EXPLORER_TIMEOUT_MS'))
  return Number.isFinite(configured) && configured >= 1_000 ? configured : 45_000
}
