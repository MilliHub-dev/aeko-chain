const RPC = process.env.AEKO_RPC_URL ?? 'http://localhost:8899'

let requestId = 1

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
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
