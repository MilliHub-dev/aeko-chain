'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AccountLink, TransactionLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, ClientApiError, explorerQuery, rpcQuery } from '@/lib/client-query'

function shortAddr(value: string | null | undefined) {
  if (!value) return '—'
  return value.slice(0, 10) + '…' + value.slice(-6)
}
function fmtAeko(lamports: number) { return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' AEKO' }

type Account = {
  account: { address: string; lamports: number; owner: string; executable: boolean; dataLen: number }
  profile: { nativeBalance: number; tokenCount: number; nftCount: number; reputationScore: number | null }
  nftHoldings: {
    tokenId: string
    collectionId: string | null
    owner: string
    creator: string
    metadataUri: string | null
    frozen: boolean
    lastSeenSlot: number
  }[]
  recentTransactions: { signature: string; slot: number; success: boolean; fee: number; primaryProgram?: string }[]
}
type Post = { postId: string; contentUri: string; postKind: string; createdAtUnix: number }
type Stake = { positionId: string; staker: string; creator: string; stakedAmount: number; state: string }
type Reward = { epoch: number; rewardAmount: number; claimableAmount: number }
type BalanceResponse = { value: number }

async function readIndexedAccount(address: string) {
  try {
    return await explorerQuery<Account>(`/accounts/${encodeURIComponent(address)}`)
  } catch (error) {
    if (error instanceof ClientApiError && error.status === 404) return null
    throw error
  }
}

export default function AccountPage() {
  const { address } = useParams<{ address: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<'txs' | 'nfts' | 'posts' | 'stakes' | 'rewards'>('txs')

  const accountQuery = useQuery({
    queryKey: adminQueryKeys.account(address),
    enabled: Boolean(address),
    queryFn: async () => {
      const [data, posts, stakes, rewards, balance] = await Promise.all([
        readIndexedAccount(address),
        explorerQuery<Post[]>(`/posts?creator=${encodeURIComponent(address)}&limit=50`),
        explorerQuery<Stake[]>(`/stakes?wallet=${encodeURIComponent(address)}&limit=50`),
        explorerQuery<Reward[]>(`/creators/${encodeURIComponent(address)}/rewards?limit=50`),
        rpcQuery<BalanceResponse>('getBalance', [address]),
      ])
      return {
        data,
        posts: posts ?? [],
        stakes: stakes ?? [],
        rewards: rewards ?? [],
        balance: balance?.value ?? null,
      }
    },
  })

  if (accountQuery.isLoading) {
    return <div className="p-6 text-gray-600">Loading account…</div>
  }

  const data = accountQuery.data?.data ?? null
  const posts = accountQuery.data?.posts ?? []
  const stakes = accountQuery.data?.stakes ?? []
  const rewards = accountQuery.data?.rewards ?? []
  const balance = accountQuery.data?.balance ?? null
  const notice = !data && !accountQuery.error
    ? balance
      ? 'The Explorer has not indexed this account yet.'
      : 'This address has no on-chain activity yet. An address exists on chain only once it has received AEKO — send it a faucet grant and it will appear.'
    : ''
  const tabs = ['txs', 'nfts', 'posts', 'stakes', 'rewards'] as const

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="min-h-11 shrink-0 rounded-xl border border-[#252a3e] px-3 text-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-white">← Back</button>
          <div>
            <h1 className="text-xl font-bold text-white mono">{shortAddr(address)}</h1>
            <div className="mt-1 break-all text-xs text-gray-600 mono">{address}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void accountQuery.refetch()}
          disabled={accountQuery.isFetching}
          className="min-h-11 rounded-lg border border-[#1e2135] px-3 text-xs font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-40"
        >
          {accountQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {accountQuery.error ? (
        <FeedbackAlert tone="error" title="Account data could not be loaded">
          {accountQuery.error instanceof Error ? accountQuery.error.message : 'Account data is unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Balance" value={balance !== null ? fmtAeko(balance) : '—'} accent />
        <StatCard label="Owner" value={data ? (data.account.owner === '11111111111111111111111111111111' ? 'System' : shortAddr(data.account.owner)) : '—'} sub={data?.account.executable ? 'executable program' : undefined} />
        <StatCard label="NFTs" value={data?.profile.nftCount ?? '—'} />
        <StatCard label="Posts" value={posts.length} />
      </div>

      {notice ? (
        <FeedbackAlert tone="warning" title="Account is not indexed yet">
          {notice}
        </FeedbackAlert>
      ) : null}

      <div className="flex snap-x gap-1 overflow-x-auto overscroll-x-contain border-b border-[#1e2135]" role="tablist" aria-label="Account activity sections">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px min-h-11 shrink-0 snap-start border-b-2 px-4 text-sm capitalize transition-colors ${tab === value ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === 'txs' ? (
        <DataTable
          paginationLabel="transactions"
          columns={['Signature', 'Slot', 'Status', 'Fee', 'Program']}
          rows={(data?.recentTransactions ?? []).map((tx) => [
            <TransactionLink key={tx.signature} signature={tx.signature} />,
            tx.slot.toLocaleString(),
            <span key={tx.signature + '-status'} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>{tx.success ? '✓ OK' : '✗ Fail'}</span>,
            fmtAeko(tx.fee),
            tx.primaryProgram ? <AccountLink key={tx.signature + '-program'} address={tx.primaryProgram} /> : '—',
          ])}
          empty="No transactions"
        />
      ) : null}
      {tab === 'nfts' ? (
        <DataTable
          paginationLabel="NFTs"
          columns={['Token', 'Collection', 'Status', 'Last Seen Slot']}
          rows={(data?.nftHoldings ?? []).map((nft) => [
            shortAddr(nft.tokenId),
            shortAddr(nft.collectionId),
            nft.frozen ? 'Frozen' : 'Active',
            nft.lastSeenSlot.toLocaleString(),
          ])}
          empty="No NFTs"
        />
      ) : null}
      {tab === 'posts' ? (
        <DataTable
          paginationLabel="posts"
          columns={['Post ID', 'Kind', 'Date']}
          rows={posts.map((post) => [post.postId.slice(0, 12) + '…', post.postKind, new Date(post.createdAtUnix * 1000).toLocaleDateString()])}
          empty="No posts"
        />
      ) : null}
      {tab === 'stakes' ? (
        <DataTable
          paginationLabel="stake positions"
          columns={['Creator', 'Staked', 'State']}
          rows={stakes.map((stake) => [
            <AccountLink key={stake.positionId + '-creator'} address={stake.creator} label={shortAddr(stake.creator)} />,
            fmtAeko(stake.stakedAmount),
            <span key={stake.positionId} className={stake.state === 'active' ? 'text-emerald-400' : 'text-gray-500'}>{stake.state}</span>,
          ])}
          empty="No stake positions"
        />
      ) : null}
      {tab === 'rewards' ? (
        <DataTable
          paginationLabel="reward epochs"
          columns={['Epoch', 'Earned', 'Claimable']}
          rows={rewards.map((reward) => [reward.epoch, fmtAeko(reward.rewardAmount), <span key={reward.epoch} className="text-emerald-400">{fmtAeko(reward.claimableAmount)}</span>])}
          empty="No rewards"
        />
      ) : null}
    </div>
  )
}
