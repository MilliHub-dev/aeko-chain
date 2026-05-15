'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Block = { slot: number; blockhash: string; parentSlot: number; transactionCount: number; blockTime?: number; leader?: string }

function shortHash(h: string) { return h.slice(0, 8) + '…' + h.slice(-6) }
function fmtTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/explorer/blocks?limit=50')
      if (!res.ok) return
      const json = await res.json()
      setBlocks(json.data ?? [])
      setLastUpdate(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  const totalTxs = blocks.reduce((s, b) => s + b.transactionCount, 0)
  const avgTxsPerBlock = blocks.length ? Math.round(totalTxs / blocks.length) : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Blocks</h1>
          <p className="text-gray-500 text-sm mt-0.5">{lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}</p>
        </div>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Latest Slot" value={blocks[0]?.slot.toLocaleString() ?? '—'} accent />
        <StatCard label="Total Txs (shown)" value={totalTxs.toLocaleString()} />
        <StatCard label="Avg Txs / Block" value={avgTxsPerBlock} />
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-12 text-center">Loading blocks…</div>
      ) : (
        <DataTable
          columns={['Slot', 'Blockhash', 'Parent', 'Txs', 'Leader', 'Time']}
          rows={blocks.map(b => [
            <span key={b.slot} className="text-emerald-400 font-semibold">{b.slot.toLocaleString()}</span>,
            shortHash(b.blockhash),
            b.parentSlot.toLocaleString(),
            b.transactionCount,
            b.leader ? shortHash(b.leader) : '—',
            fmtTime(b.blockTime),
          ])}
          empty="No blocks indexed yet"
        />
      )}
    </div>
  )
}
