// Operations Web belongs to the same single chain environment as the
// services it administers. Cross-network endpoint matrices belong to Aeko
// Scan, not to Admin.

const HARDCODED_LOCAL_RPC = 'http://localhost:8899'
const HARDCODED_LOCAL_EXPLORER = 'http://localhost:8088'

function clean(name: string): string {
  return (process.env[name] ?? '').trim()
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
  return clean('AEKO_RPC_URL') || HARDCODED_LOCAL_RPC
}

// Funding actions, when enabled for the active environment, use that same
// environment's RPC. Admin must never reach into another network implicitly.
export function resolveFundingRpcUrl(): string {
  return clean('AEKO_RPC_URL') || HARDCODED_LOCAL_RPC
}

export function resolveAdminExplorerUrl(): string {
  return clean('AEKO_EXPLORER_API_URL') || HARDCODED_LOCAL_EXPLORER
}
