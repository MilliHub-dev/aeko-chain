// Operations Web resolves upstreams by blockchain network, not by deployment
// topology. A URL may be same-host, cross-instance, or behind HTTPS; the
// variable name only identifies the network and service.
//
// Policy:
// - Admin/operator reads prefer mainnet when a complete mainnet endpoint is set.
// - Otherwise they use testnet, then an explicit localnet endpoint.
// - Funding is testnet-only, with localnet as the development fallback.
// - Hardcoded loopback is the final local-development fallback.

const HARDCODED_LOCAL_RPC = 'http://localhost:8899'
const HARDCODED_LOCAL_EXPLORER = 'http://localhost:8088'

function clean(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function isMainnetConfigured(): boolean {
  return Boolean(
    clean('AEKO_MAINNET_RPC_URL') || clean('AEKO_MAINNET_EXPLORER_API_URL'),
  )
}

export function resolveAdminRpcUrl(): string {
  return (
    clean('AEKO_MAINNET_RPC_URL') ||
    clean('AEKO_TESTNET_RPC_URL') ||
    clean('AEKO_LOCALNET_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

export function resolveFundingRpcUrl(): string {
  return (
    clean('AEKO_TESTNET_RPC_URL') ||
    clean('AEKO_LOCALNET_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

export function resolveAdminExplorerUrl(): string {
  return (
    clean('AEKO_MAINNET_EXPLORER_API_URL') ||
    clean('AEKO_TESTNET_EXPLORER_API_URL') ||
    clean('AEKO_LOCALNET_EXPLORER_API_URL') ||
    HARDCODED_LOCAL_EXPLORER
  )
}

export function describeAdminNetwork(): 'mainnet' | 'localnet' | 'testnet' {
  if (
    clean('AEKO_MAINNET_RPC_URL') ||
    clean('AEKO_MAINNET_EXPLORER_API_URL')
  ) {
    return 'mainnet'
  }
  if (
    clean('AEKO_TESTNET_RPC_URL') ||
    clean('AEKO_TESTNET_EXPLORER_API_URL')
  ) {
    return 'testnet'
  }
  return 'localnet'
}
