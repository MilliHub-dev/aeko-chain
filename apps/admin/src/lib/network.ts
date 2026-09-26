// Admin network resolution. Single source of truth for which upstream the
// Admin (Operations Web) service talks to.
//
// Policy:
// - Admin always uses mainnet whenever mainnet is available. Set
//   AEKO_MAINNET_RPC_URL / AEKO_MAINNET_EXPLORER_API_URL and they win.
// - Localnet means "running locally". Explicit AEKO_LOCALNET_* env values
//   always override the hardcoded loopback defaults below; env variables are
//   prioritized above hardcoded network config.
// - Otherwise the explicit AEKO_TESTNET_* endpoints apply.
// - Hardcoded localhost is a last resort only.

const HARDCODED_LOCAL_RPC = 'http://localhost:8899'
const HARDCODED_LOCAL_EXPLORER = 'http://localhost:8088'

function clean(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function isMainnetConfigured(): boolean {
  return Boolean(clean('AEKO_MAINNET_RPC_URL') || clean('AEKO_MAINNET_EXPLORER_API_URL'))
}

// Admin RPC: mainnet > explicit localnet env > base env > hardcoded loopback.
// Used for operator reads (read-only RPC relay, admin explorer proxy,
// settings). Never used for funding.
export function resolveAdminRpcUrl(): string {
  return (
    clean('AEKO_MAINNET_RPC_URL') ||
    clean('AEKO_LOCALNET_RPC_URL') ||
    clean('AEKO_TESTNET_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

// Funding chain RPC: testnet-pinned, NEVER mainnet.
//
// Funding grants test AEKO on the test network (approval queue, manual
// grants, Test Console airdrops). Submitting requestAirdrop — or polling
// getSignatureStatuses — against mainnet would mint test funds on production
// and poll the wrong chain for testnet signatures.
// Priority: AEKO_TESTNET_RPC_URL > AEKO_LOCALNET_RPC_URL for local runs >
// hardcoded loopback. Env values always beat hardcoded defaults.
export function resolveFundingRpcUrl(): string {
  return (
    clean('AEKO_TESTNET_RPC_URL') ||
    clean('AEKO_LOCALNET_RPC_URL') ||
    HARDCODED_LOCAL_RPC
  )
}

// Admin Explorer upstream: mainnet > explicit localnet env > base env >
// hardcoded loopback.
export function resolveAdminExplorerUrl(): string {
  return (
    clean('AEKO_MAINNET_EXPLORER_API_URL') ||
    clean('AEKO_LOCALNET_EXPLORER_API_URL') ||
    clean('AEKO_TESTNET_EXPLORER_API_URL') ||
    HARDCODED_LOCAL_EXPLORER
  )
}

export function describeAdminNetwork(): 'mainnet' | 'localnet' | 'testnet' {
  if (clean('AEKO_MAINNET_RPC_URL') || clean('AEKO_MAINNET_EXPLORER_API_URL')) {
    return 'mainnet'
  }
  const rpc = resolveAdminRpcUrl()
  if (/localhost|127\.0\.0\.1/.test(rpc)) return 'localnet'
  return 'testnet'
}
