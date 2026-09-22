const EXPLORER = process.env.AEKO_EXPLORER_URL ?? 'http://localhost:8088'

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${EXPLORER}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }
  const res = await fetch(url.toString(), { cache: 'no-store' })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.data as T
}

// Field names follow the Explorer API as deployed (see apps/explorer/backend),
// not the upstream Solana explorer: blocks carry `producer`/`unixTimestamp`.
export type BlockRecord = {
  slot: number
  blockhash: string
  parentSlot: number
  transactionCount: number
  unixTimestamp?: number
  producer?: string
}

export type TransactionRecord = {
  signature: string
  slot: number
  blockTime?: number
  success: boolean
  fee: number
  signer?: string
  primaryProgram?: string
}

export type TokenTransferRecord = {
  signature: string
  slot: number
  mint: string
  source: string
  destination: string
  amount: string
}

export type NftRecord = {
  tokenId: string
  collection: string
  owner: string
  creator: string
  royaltyBps: number
  name: string
  uri: string
}

export type SocialPostRecord = {
  postId: string
  creator: string
  contentUri: string
  postKind: string
  visibility: string
  createdAtUnix: number
}

export type SocialStakeRecord = {
  positionId: string
  staker: string
  creator: string
  stakedAmount: number
  accumulatedYield: number
  claimedYield: number
  state: string
}

export type CreatorRewardRecord = {
  creator: string
  epoch: number
  rewardAmount: number
  claimableAmount: number
}

export type EngagementRecord = {
  actor: string
  actionKind: string
  targetPostId?: string
  slot: number
}

export type AccountRecord = {
  account: { address: string; lamports: number; owner: string; executable: boolean; dataLen: number }
  profile: {
    address: string
    reputationScore: number | null
    nativeBalance: number
    tokenCount: number
    nftCount: number
  }
  tokenHoldings: unknown[]
  nftHoldings: NftRecord[]
  recentTransactions: TransactionRecord[]
}

export const explorerApi = {
  blocks: (limit = 25) => get<BlockRecord[]>('/blocks', { limit }),
  transactions: (limit = 25) => get<TransactionRecord[]>('/transactions', { limit }),
  tokenTransfers: (limit = 25, mint?: string) =>
    get<TokenTransferRecord[]>('/tokens/transfers', mint ? { limit, mint } : { limit }),
  nfts: (limit = 25, owner?: string) =>
    get<NftRecord[]>('/nfts', owner ? { limit, owner } : { limit }),
  posts: (limit = 25, creator?: string) =>
    get<SocialPostRecord[]>('/posts', creator ? { limit, creator } : { limit }),
  stakes: (limit = 25, wallet?: string) =>
    get<SocialStakeRecord[]>('/stakes', wallet ? { limit, wallet } : { limit }),
  rewards: (creator: string, limit = 25) =>
    get<CreatorRewardRecord[]>(`/creators/${creator}/rewards`, { limit }),
  engagement: (limit = 25) => get<EngagementRecord[]>('/engagement', { limit }),
  account: (address: string) => get<AccountRecord>(`/accounts/${address}`),
}
