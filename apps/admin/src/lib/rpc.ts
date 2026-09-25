import { resolveFundingRpcUrl } from './network'

// Funding chain client — testnet-pinned, NEVER mainnet.
//
// This module is imported only by lib/funding-store.ts (grant approvals,
// manual grants, Test Console airdrops, confirmation polling). All of those
// move test AEKO on the test network, so this client resolves via
// resolveFundingRpcUrl(): explicit AEKO_TESTNET_RPC_URL > AEKO_RPC_URL
// (testnet validator in every Compose file) > AEKO_LOCALNET_RPC_URL >
// hardcoded localhost. AEKO_MAINNET_RPC_URL is deliberately ignored here;
// admin/operator reads use resolveAdminRpcUrl() instead.
function rpcUrl(): string {
  return resolveFundingRpcUrl()
}

let requestId = 1

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result as T
}

export async function requestAirdrop(address: string, lamports: number) {
  const fundingAuthorization = process.env.FUNDING_GATEWAY_KEY?.trim()
  const config = fundingAuthorization ? { fundingAuthorization } : {}
  return call<string>('requestAirdrop', [address, lamports, config])
}

export async function getSignatureStatuses(signatures: string[]) {
  return call<{
    value: Array<{ confirmationStatus?: 'processed' | 'confirmed' | 'finalized'; err: unknown } | null>
  }>('getSignatureStatuses', [signatures])
}
