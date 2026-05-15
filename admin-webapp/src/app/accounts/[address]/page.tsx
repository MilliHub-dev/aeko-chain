'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

function shortAddr(a: string) { return a.slice(0, 10) + '…' + a.slice(-6) }
function fmtAeko(lamports: number) { return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' AEKO' }

type AccountData = {
  profile: { address: string; balance: number }
  recentTransactions: { signature: string; slot: number; success: boolean; fee: number }[]
  recentPosts: { postId: string; contentUri: string; postKind: string; createdAtUnix: number }[]
  socialStakes: { staker: string; creator: string; stakedAmount: number; state: string }[]
  creatorRewards: { epoch: number; rewardAmount: number; claimableAmount: number }[]
}

export default function AccountPage() {
  const { address } = useParams<{ address: string }>()
  const router = useRouter()
  const [data, setData] = useState<AccountData | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'txs' | 'posts' | 'stakes' | 'rewards'>('txs')

  const refresh = useCallback(async () => {
    try {
      const [explorerRes, rpcRes] = await Promise.all([
        fetch(`/api/explorer/accounts/${address}`).then(r => r.json()),
        fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
        }).then(r => r.json()),
      ])
      if (explorerRes.error && explorerRes.error.code === 'not_found') {
        setError('Account not found in explorer. It may not have any on-chain activity yet.')
      } else {
        setData(explorerRes.data ?? null)
      }
      setBalance(rpcRes.result?.value ?? null)
    } catch {
      setError('Failed to load account data')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <div className="p-6 text-gray-600">Loading account…</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-bold text-white mono">{shortAddr(address)}</h1>
          <div className="text-gray-600 text-xs mono mt-0.5">{address}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Balance" value={balance !== null ? fmtAeko(balance) : '—'} accent />
        <StatCard label="Transactions" value={data?.recentTransactions.length ?? '—'} />
        <StatCard label="Posts" value={data?.recentPosts.length ?? '—'} />
      </div>

      {error && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">{error}</div>
      )}

      {data && (
        <>
          <div className="flex gap-1 border-b border-[#1e2135]">
            {(['txs', 'posts', 'stakes', 'rewards'] as const).map(t => (
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
              columns={['Signature', 'Slot', 'Status', 'Fee']}
              rows={data.recentTransactions.map(tx => [
                tx.signature.slice(0, 14) + '…',
                tx.slot.toLocaleString(),
                <span key={tx.signature} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>
                  {tx.success ? '✓ OK' : '✗ Fail'}
                </span>,
                fmtAeko(tx.fee),
              ])}
              empty="No transactions"
            />
          )}
          {tab === 'posts' && (
            <DataTable
              columns={['Post ID', 'Kind', 'Date']}
              rows={data.recentPosts.map(p => [
                p.postId.slice(0, 12) + '…',
                p.postKind,
                new Date(p.createdAtUnix * 1000).toLocaleDateString(),
              ])}
              empty="No posts"
            />
          )}
          {tab === 'stakes' && (
            <DataTable
              columns={['Creator', 'Staked', 'State']}
              rows={data.socialStakes.map(s => [
                shortAddr(s.creator),
                fmtAeko(s.stakedAmount),
                <span key={s.creator} className={s.state === 'active' ? 'text-emerald-400' : 'text-gray-500'}>{s.state}</span>,
              ])}
              empty="No stake positions"
            />
          )}
          {tab === 'rewards' && (
            <DataTable
              columns={['Epoch', 'Earned', 'Claimable']}
              rows={data.creatorRewards.map(r => [
                r.epoch,
                fmtAeko(r.rewardAmount),
                <span key={r.epoch} className="text-emerald-400">{fmtAeko(r.claimableAmount)}</span>,
              ])}
              empty="No rewards"
            />
          )}
        </>
      )}
    </div>
  )
}
