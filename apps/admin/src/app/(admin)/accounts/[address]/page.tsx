'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

function shortAddr(a: string) { return a.slice(0, 10) + '…' + a.slice(-6) }
function fmtAeko(lamports: number) { return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' AEKO' }

// Shapes as the Explorer API returns them; the account view carries holdings
// and recent transactions, while posts, stakes and rewards come from their own
// endpoints filtered by address.
type Account = {
  account: { address: string; lamports: number; owner: string; executable: boolean; dataLen: number }
  profile: { nativeBalance: number; tokenCount: number; nftCount: number; reputationScore: number | null }
  nftHoldings: { tokenId: string; name: string; collection: string }[]
  recentTransactions: { signature: string; slot: number; success: boolean; fee: number; primaryProgram?: string }[]
}
type Post = { postId: string; contentUri: string; postKind: string; createdAtUnix: number }
type Stake = { positionId: string; staker: string; creator: string; stakedAmount: number; state: string }
type Reward = { epoch: number; rewardAmount: number; claimableAmount: number }

async function explorer<T>(path: string): Promise<T | null> {
  const res = await fetch('/api/explorer' + path)
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) return null
  return json.data as T
}

export default function AccountPage() {
  const { address } = useParams<{ address: string }>()
  const router = useRouter()
  const [data, setData] = useState<Account | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [stakes, setStakes] = useState<Stake[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'txs' | 'nfts' | 'posts' | 'stakes' | 'rewards'>('txs')

  const refresh = useCallback(async () => {
    try {
      const [account, p, s, r, rpcRes] = await Promise.all([
        explorer<Account>(`/accounts/${address}`),
        explorer<Post[]>(`/posts?creator=${address}&limit=50`),
        explorer<Stake[]>(`/stakes?wallet=${address}&limit=50`),
        explorer<Reward[]>(`/creators/${address}/rewards?limit=50`),
        fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
        }).then((r) => r.json()),
      ])
      setData(account)
      setPosts(p ?? [])
      setStakes(s ?? [])
      setRewards(r ?? [])
      setBalance(rpcRes.result?.value ?? null)
      if (!account) {
        setNotice(
          rpcRes.result?.value
            ? 'The Explorer has not indexed this account yet.'
            : 'This address has no on-chain activity yet. An address exists on chain only once it has received AEKO — send it a faucet grant and it will appear.',
        )
      }
    } catch {
      setNotice('Failed to load account data')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <div className="p-6 text-gray-600">Loading account…</div>

  const tabs = ['txs', 'nfts', 'posts', 'stakes', 'rewards'] as const

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-bold text-white mono">{shortAddr(address)}</h1>
          <div className="text-gray-600 text-xs mono mt-0.5">{address}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Balance" value={balance !== null ? fmtAeko(balance) : '—'} accent />
        <StatCard label="Owner" value={data ? (data.account.owner === '11111111111111111111111111111111' ? 'System' : shortAddr(data.account.owner)) : '—'} sub={data?.account.executable ? 'executable program' : undefined} />
        <StatCard label="NFTs" value={data?.profile.nftCount ?? '—'} />
        <StatCard label="Posts" value={posts.length} />
      </div>

      {notice && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">{notice}</div>
      )}

      <div className="flex gap-1 border-b border-[#1e2135]">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'txs' && (
        <DataTable
          columns={['Signature', 'Slot', 'Status', 'Fee', 'Program']}
          rows={(data?.recentTransactions ?? []).map((tx) => [
            tx.signature.slice(0, 14) + '…',
            tx.slot.toLocaleString(),
            <span key={tx.signature} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>{tx.success ? '✓ OK' : '✗ Fail'}</span>,
            fmtAeko(tx.fee),
            tx.primaryProgram ? shortAddr(tx.primaryProgram) : '—',
          ])}
          empty="No transactions"
        />
      )}
      {tab === 'nfts' && (
        <DataTable
          columns={['Token', 'Name', 'Collection']}
          rows={(data?.nftHoldings ?? []).map((n) => [n.tokenId.slice(0, 12) + '…', n.name, shortAddr(n.collection)])}
          empty="No NFTs"
        />
      )}
      {tab === 'posts' && (
        <DataTable
          columns={['Post ID', 'Kind', 'Date']}
          rows={posts.map((p) => [p.postId.slice(0, 12) + '…', p.postKind, new Date(p.createdAtUnix * 1000).toLocaleDateString()])}
          empty="No posts"
        />
      )}
      {tab === 'stakes' && (
        <DataTable
          columns={['Creator', 'Staked', 'State']}
          rows={stakes.map((s) => [
            shortAddr(s.creator),
            fmtAeko(s.stakedAmount),
            <span key={s.positionId} className={s.state === 'active' ? 'text-emerald-400' : 'text-gray-500'}>{s.state}</span>,
          ])}
          empty="No stake positions"
        />
      )}
      {tab === 'rewards' && (
        <DataTable
          columns={['Epoch', 'Earned', 'Claimable']}
          rows={rewards.map((r) => [r.epoch, fmtAeko(r.rewardAmount), <span key={r.epoch} className="text-emerald-400">{fmtAeko(r.claimableAmount)}</span>])}
          empty="No rewards"
        />
      )}
    </div>
  )
}
