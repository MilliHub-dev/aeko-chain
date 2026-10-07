const DEFAULT_TIMEOUT_MS = 15_000
export const LAMPORTS_PER_AEKO = 1_000_000_000

interface RpcEnvelope<T> {
  result?: T
  error?: { message?: string; code?: number; data?: unknown }
}

async function rpc<T>(url: string, method: string, params: unknown[] = [], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const endpoint = String(url || '').trim()
  if (!endpoint) throw new Error('The selected AEKO network does not have an RPC endpoint configured.')
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`RPC ${method} failed with HTTP ${response.status}: ${text.slice(0, 160)}`)
    let payload: RpcEnvelope<T>
    try {
      payload = JSON.parse(text) as RpcEnvelope<T>
    } catch {
      throw new Error(`RPC ${method} returned invalid JSON.`)
    }
    if (payload.error) throw new Error(`RPC ${method} error: ${payload.error.message || JSON.stringify(payload.error)}`)
    if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`)
    return payload.result
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error(`RPC ${method} timed out.`)
    throw cause
  } finally {
    window.clearTimeout(timer)
  }
}

export interface RpcAccountInfo {
  lamports?: number
  owner?: string
  executable?: boolean
  rentEpoch?: number
  data?: unknown
}

export async function getHealth(rpcUrl: string): Promise<unknown> { return rpc(rpcUrl, 'getHealth') }
export async function getSlot(rpcUrl: string): Promise<unknown> { return rpc(rpcUrl, 'getSlot') }
export async function getEpochInfo(rpcUrl: string): Promise<Record<string, unknown>> {
  return rpc(rpcUrl, 'getEpochInfo', [{ commitment: 'confirmed' }])
}
export async function getGenesisHash(rpcUrl: string): Promise<unknown> { return rpc(rpcUrl, 'getGenesisHash') }
export async function getVersion(rpcUrl: string): Promise<Record<string, unknown>> { return rpc(rpcUrl, 'getVersion') }
export async function getSupply(rpcUrl: string): Promise<Record<string, unknown>> {
  return rpc(rpcUrl, 'getSupply', [{ commitment: 'confirmed' }])
}
export async function getVoteAccounts(rpcUrl: string): Promise<Record<string, unknown>> {
  return rpc(rpcUrl, 'getVoteAccounts', [{ commitment: 'confirmed' }])
}
export async function getLatestBlockhash(rpcUrl: string): Promise<string> {
  const result = await rpc<{ value?: { blockhash?: string }; blockhash?: string }>(
    rpcUrl,
    'getLatestBlockhash',
    [{ commitment: 'confirmed' }],
  )
  return result.value?.blockhash || result.blockhash || ''
}
export async function getBalance(rpcUrl: string, address: string): Promise<number> {
  const result = await rpc<number | { value?: number }>(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }])
  return typeof result === 'number' ? result : result.value ?? 0
}
export async function getAccountInfo(rpcUrl: string, address: string): Promise<RpcAccountInfo | null> {
  const result = await rpc<{ value?: RpcAccountInfo | null }>(rpcUrl, 'getAccountInfo', [
    address,
    { commitment: 'confirmed', encoding: 'base64' },
  ])
  return result.value ?? null
}

export interface RpcProgramAccount {
  pubkey: string
  account: RpcAccountInfo
}

export async function getProgramAccounts(rpcUrl: string, programId: string): Promise<RpcProgramAccount[]> {
  return rpc<RpcProgramAccount[]>(rpcUrl, 'getProgramAccounts', [
    programId,
    { commitment: 'confirmed', encoding: 'base64' },
  ])
}
export async function getFeeForMessage(rpcUrl: string, messageBase64: string): Promise<number> {
  const result = await rpc<number | { value?: number }>(rpcUrl, 'getFeeForMessage', [
    messageBase64,
    { commitment: 'confirmed' },
  ])
  const value = typeof result === 'number' ? result : result.value
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('RPC did not return a valid transaction fee estimate.')
  }
  return value
}
export async function sendTransaction(rpcUrl: string, transactionBase64: string): Promise<string> {
  return rpc<string>(rpcUrl, 'sendTransaction', [
    transactionBase64,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ])
}

interface SignatureStatus {
  err?: unknown
  confirmationStatus?: string
  slot?: number
}

export async function confirmSignature(
  rpcUrl: string,
  signature: string,
  { attempts = 40, intervalMs = 750 }: { attempts?: number; intervalMs?: number } = {},
): Promise<SignatureStatus> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await rpc<{ value?: Array<SignatureStatus | null> }>(
      rpcUrl,
      'getSignatureStatuses',
      [[signature], { searchTransactionHistory: false }],
    )
    const status = result.value?.[0]
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return status
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
  }
  throw new Error('Transaction was submitted but was not confirmed within the editor timeout window.')
}

export function formatAeko(lamports: number): string {
  const value = Number(lamports) / LAMPORTS_PER_AEKO
  if (!Number.isFinite(value)) return '—'
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 9 })} AEKO`
}
