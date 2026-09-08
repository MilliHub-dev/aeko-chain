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

export type BlockRecord = {
  slot: number
  blockhash: string
  parentSlot: number
  transactionCount: number
  blockTime?: number
  leader?: string
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
  account: (address: string) =>
    get<{
      profile: { address: string; balance: number }
      recentTransactions: TransactionRecord[]
      recentPosts: SocialPostRecord[]
      socialStakes: SocialStakeRecord[]
      creatorRewards: CreatorRewardRecord[]
    }>(`/accounts/${address}`),
  search: (q: string) =>
    get<{ matches: { kind: string; id: string; label: string }[] }>(`/search`, { q, limit: 10 }),
}
