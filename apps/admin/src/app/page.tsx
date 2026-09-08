'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Stats = {
  slot: number
  epoch: number
  epochProgress: number
  supply: number
  circulating: number
  txCount: number
  version: string
  validators: number
  delinquent: number
}

type Block = { slot: number; transactionCount: number; blockTime?: number }
type Tx = { signature: string; slot: number; success: boolean; primaryProgram?: string }

function shortSig(sig: string) { return sig.slice(0, 12) + '…' + sig.slice(-6) }
function fmtTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleTimeString()
}
function fmtAeko(lamports: number) {
  return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' AEKO'
}

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await res.json()
  return j.result
}

async function explorer(path: string, query?: Record<string, string>) {
  const url = new URL('/api/explorer' + path, location.origin)
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) return null
  const j = await res.json()
  return j.data ?? null
}

export default function Dashboard() {
  const [stats, setStats] = useState<Partial<Stats>>({})
  const [blocks, setBlocks] = useState<Block[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [online, setOnline] = useState<boolean | null>(null)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [epochInfo, supply, txCount, version, voteAccounts, recentBlocks, recentTxs] =
        await Promise.all([
          rpc('getEpochInfo'),
          rpc('getSupply'),
          rpc('getTransactionCount'),
          rpc('getVersion'),
          rpc('getVoteAccounts'),
          explorer('/blocks', { limit: '8' }),
          explorer('/transactions', { limit: '8' }),
        ])

      setStats({
        slot: epochInfo?.absoluteSlot,
        epoch: epochInfo?.epoch,
        epochProgress: epochInfo ? Math.round((epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100) : 0,
        supply: supply?.value?.total,
        circulating: supply?.value?.circulating,
        txCount,
        version: version?.['solana-core'] ?? '—',
        validators: voteAccounts?.current?.length ?? 0,
        delinquent: voteAccounts?.delinquent?.length ?? 0,
      })
      setBlocks(recentBlocks ?? [])
      setTxs(recentTxs ?? [])
      setOnline(true)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online === null ? 'bg-gray-500' : online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-400">{online === null ? 'Connecting' : online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Slot" value={stats.slot?.toLocaleString() ?? '—'} accent />
        <StatCard label="Total Supply" value={stats.supply ? fmtAeko(stats.supply) : '—'} sub={stats.circulating ? `Circulating: ${fmtAeko(stats.circulating)}` : undefined} />
        <StatCard label="Transactions" value={stats.txCount?.toLocaleString() ?? '—'} />
        <StatCard label="Validators" value={stats.validators ?? '—'} sub={stats.delinquent ? `${stats.delinquent} delinquent` : undefined} />
        <StatCard label="Epoch" value={stats.epoch ?? '—'} sub={stats.epochProgress !== undefined ? `${stats.epochProgress}% complete` : undefined} />
        <StatCard label="Node Version" value={stats.version ?? '—'} />
        <div className="col-span-2 bg-[#12141f] border border-[#1e2135] rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Epoch Progress</div>
          <div className="w-full bg-[#1e2135] rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${stats.epochProgress ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1.5">
            <span>Epoch {stats.epoch}</span>
            <span>{stats.epochProgress ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* Recent blocks + txs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Blocks</h2>
          <DataTable
            columns={['Slot', 'Txs', 'Time']}
            rows={blocks.map(b => [
              <span key={b.slot} className="text-emerald-400">{b.slot.toLocaleString()}</span>,
              b.transactionCount,
              fmtTime(b.blockTime),
            ])}
            empty="No blocks indexed yet"
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Transactions</h2>
          <DataTable
            columns={['Signature', 'Slot', 'Status']}
            rows={txs.map(tx => [
              shortSig(tx.signature),
              tx.slot.toLocaleString(),
              <span key={tx.signature} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>
                {tx.success ? 'OK' : 'Fail'}
              </span>,
            ])}
            empty="No transactions indexed yet"
          />
        </div>
      </div>
    </div>
  )
}
