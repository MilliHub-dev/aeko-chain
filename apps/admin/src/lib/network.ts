// Operations Web network resolution.
//
// Canonical deployment variables are network-specific:
//   AEKO_TESTNET_*
//   AEKO_MAINNET_*
//   AEKO_LOCALNET_*
//
// The old generic/internal names are accepted only as compatibility aliases
// for the legacy all-in-one Compose contracts while those remain a rollback
// path.

const HARDCODED_LOCAL_RPC = 'http://localhost:8899'
const HARDCODED_LOCAL_EXPLORER = 'http://localhost:8088'

function clean(name: string): string {
  return (process.env[name] ?? '').trim()
}

function first(...names: string[]): string {
  for (const name of names) {
    const value = clean(name)
    if (value) return value
  }
  return ''
}

function mainnetExplorerUrl(): string {
  return first('AEKO_MAINNET_EXPLORER_API_URL', 'AEKO_INTERNAL_MAINNET_EXPLORER_API_URL')
}

function localnetExplorerUrl(): string {
  return first('AEKO_LOCALNET_EXPLORER_API_URL', 'AEKO_INTERNAL_LOCALNET_EXPLORER_API_URL')
}

function testnetExplorerUrl(): string {
  return first('AEKO_TESTNET_EXPLORER_API_URL', 'AEKO_INTERNAL_EXPLORER_API_URL')
}

export function isMainnetConfigured(): boolean {
  return Boolean(first('AEKO_MAINNET_RPC_URL') || mainnetExplorerUrl())
}

// Operator reads prefer mainnet when it is explicitly configured, then an
// explicit localnet, then testnet. The generic AEKO_RPC_URL remains a legacy
// testnet alias only.
export function resolveAdminRpcUrl(): string {
  return (
    first('AEKO_MAINNET_RPC_URL') ||
    first('AEKO_LOCALNET_RPC_URL') ||
    first('AEKO_TESTNET_RPC_URL', 'AEKO_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

// Funding is testnet-pinned and must never inherit a configured mainnet RPC.
export function resolveFundingRpcUrl(): string {
  return (
    first('AEKO_TESTNET_RPC_URL', 'AEKO_RPC_URL') ||
    first('AEKO_LOCALNET_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

export function resolveAdminExplorerUrl(): string {
  return (
    mainnetExplorerUrl() ||
    localnetExplorerUrl() ||
    testnetExplorerUrl() ||
    HARDCODED_LOCAL_EXPLORER
  )
}

export function describeAdminNetwork(): 'mainnet' | 'localnet' | 'testnet' {
  if (first('AEKO_MAINNET_RPC_URL') || mainnetExplorerUrl()) return 'mainnet'
  if (first('AEKO_LOCALNET_RPC_URL') || localnetExplorerUrl()) return 'localnet'

  const rpc = resolveAdminRpcUrl()
  if (/localhost|127\.0\.0\.1/.test(rpc)) return 'localnet'
  return 'testnet'
}
