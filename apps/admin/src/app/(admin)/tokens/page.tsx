'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Supply = { total: number; circulating: number; nonCirculating: number }
type Transfer = { signature: string; slot: number; mint: string; source: string; destination: string; amount: string }

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-4) }
function fmtAeko(lamports: number) {
  return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' AEKO'
}

export default function TokensPage() {
  const [supply, setSupply] = useState<Supply | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [supplyRes, transfersRes] = await Promise.all([
        fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSupply', params: [] }),
        }).then(r => r.ok ? r.json() : null),
        fetch('/api/explorer/tokens/transfers?limit=50').then(r => r.ok ? r.json() : { data: [] }),
      ])
      setSupply(supplyRes?.result?.value ?? null)
      setTransfers(transfersRes.data ?? [])
      setLastUpdate(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const circulatingPct = supply ? Math.round((supply.circulating / supply.total) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tokens</h1>
          <p className="text-gray-500 text-sm mt-0.5">{lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}</p>
        </div>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors">
          Refresh
        </button>
      </div>

      {/* Supply breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Supply" value={supply ? fmtAeko(supply.total) : '—'} accent />
        <StatCard label="Circulating" value={supply ? fmtAeko(supply.circulating) : '—'} sub={`${circulatingPct}% of total`} />
        <StatCard label="Non-Circulating" value={supply ? fmtAeko(supply.nonCirculating) : '—'} />
      </div>

      {/* Circulating bar */}
      {supply && (
        <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-5">
          <div className="flex justify-between text-xs text-gray-500 mb-3">
            <span>Circulating Supply</span>
            <span className="text-emerald-400">{circulatingPct}%</span>
          </div>
          <div className="w-full bg-[#1e2135] rounded-full h-3">
            <div
              className="bg-emerald-500 h-3 rounded-full transition-all"
              style={{ width: `${circulatingPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>{fmtAeko(supply.circulating)} circulating</span>
            <span>{fmtAeko(supply.nonCirculating)} locked</span>
          </div>
        </div>
      )}

      {/* Recent transfers */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Token Transfers</h2>
        {loading ? (
          <div className="text-gray-600 text-sm py-8 text-center">Loading transfers…</div>
        ) : (
          <DataTable
            columns={['Signature', 'Mint', 'From', 'To', 'Amount', 'Slot']}
            rows={transfers.map(t => [
              t.signature.slice(0, 12) + '…',
              shortAddr(t.mint),
              shortAddr(t.source),
              shortAddr(t.destination),
              t.amount,
              t.slot.toLocaleString(),
            ])}
            empty="No token transfers indexed yet"
          />
        )}
      </div>
    </div>
  )
}
