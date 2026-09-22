'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Tx = { signature: string; slot: number; blockTime?: number; success: boolean; fee: number; signer?: string; primaryProgram?: string }

function shortSig(sig: string) { return sig.slice(0, 14) + '…' + sig.slice(-6) }
function fmtTime(ts?: number) { return ts ? new Date(ts * 1000).toLocaleString() : '—' }
function fmtFee(lamports: number) { return (lamports / 1e9).toFixed(6) + ' AEKO' }

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Tx[]>([])
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/explorer/transactions?limit=100')
      if (!res.ok) return
      const json = await res.json()
      setTxs(json.data ?? [])
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

  const filtered = txs.filter(tx => {
    if (filter === 'success') return tx.success
    if (filter === 'failed') return !tx.success
    return true
  })

  const successCount = txs.filter(t => t.success).length
  const successRate = txs.length ? Math.round((successCount / txs.length) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-500 text-sm mt-0.5">{lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}</p>
        </div>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Shown" value={txs.length} />
        <StatCard label="Success" value={successCount} accent />
        <StatCard label="Success Rate" value={`${successRate}%`} />
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        {(['all', 'success', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              filter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-12 text-center">Loading transactions…</div>
      ) : (
        <DataTable
          columns={['Signature', 'Slot', 'Status', 'Fee', 'Program', 'Time']}
          rows={filtered.map(tx => [
            shortSig(tx.signature),
            tx.slot.toLocaleString(),
            <span key={tx.signature} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>
              {tx.success ? '✓ OK' : '✗ Fail'}
            </span>,
            fmtFee(tx.fee),
            tx.primaryProgram ?? '—',
            fmtTime(tx.blockTime),
          ])}
          empty="No transactions found"
        />
      )}
    </div>
  )
}
