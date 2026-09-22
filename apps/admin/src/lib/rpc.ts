const RPC = process.env.AEKO_RPC_URL ?? 'http://localhost:8899'

let _id = 1
function nextId() { return _id++ }

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId(), method, params }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result as T
}

export async function getSlot() {
  return call<number>('getSlot')
}

export async function getEpochInfo() {
  return call<{
    epoch: number
    slotIndex: number
    slotsInEpoch: number
    absoluteSlot: number
    blockHeight: number
    transactionCount: number
  }>('getEpochInfo')
}

export async function getSupply() {
  const result = await call<{
    value: { total: number; circulating: number; nonCirculating: number }
  }>('getSupply')
  return result.value
}

export async function getTransactionCount() {
  return call<number>('getTransactionCount')
}

/** The node reports its version under `aeko-core`, not the upstream `solana-core` key. */
export async function getVersion() {
  return call<{ 'aeko-core': string; 'feature-set': number }>('getVersion')
}

export async function getVoteAccounts() {
  return call<{
    current: { votePubkey: string; nodePubkey: string; activatedStake: number; commission: number; lastVote: number }[]
    delinquent: { votePubkey: string; nodePubkey: string }[]
  }>('getVoteAccounts')
}

export async function getBalance(address: string) {
  const result = await call<{ value: number }>('getBalance', [address])
  return result.value
}

export async function getAccountInfo(address: string) {
  const result = await call<{ value: { owner: string; executable: boolean; lamports: number } | null }>(
    'getAccountInfo',
    [address, { encoding: 'base64' }],
  )
  return result.value
}

export async function requestAirdrop(address: string, lamports: number) {
  return call<string>('requestAirdrop', [address, lamports])
}

export async function getSignatureStatuses(signatures: string[]) {
  return call<{
    value: Array<{ confirmationStatus?: 'processed' | 'confirmed' | 'finalized'; err: unknown } | null>
  }>('getSignatureStatuses', [signatures])
}

export function lamportsToAeko(lamports: number) {
  return lamports / 1_000_000_000
}

export function fmtAeko(lamports: number) {
  return lamportsToAeko(lamports).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' AEKO'
}
