'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Nft = { tokenId: string; collection: string; owner: string; creator: string; royaltyBps: number; name: string; uri: string }

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-4) }

export default function NftsPage() {
  const [nfts, setNfts] = useState<Nft[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/explorer/nfts?limit=100')
      if (!res.ok) return
      const json = await res.json()
      setNfts(json.data ?? [])
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

  const uniqueCollections = new Set(nfts.map(n => n.collection)).size
  const uniqueCreators = new Set(nfts.map(n => n.creator)).size
  const avgRoyalty = nfts.length
    ? (nfts.reduce((s, n) => s + n.royaltyBps, 0) / nfts.length / 100).toFixed(2) + '%'
    : '—'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">NFTs</h1>
          <p className="text-gray-500 text-sm mt-0.5">{lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}</p>
        </div>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total NFTs" value={nfts.length} accent />
        <StatCard label="Collections" value={uniqueCollections} />
        <StatCard label="Creators" value={uniqueCreators} />
        <StatCard label="Avg Royalty" value={avgRoyalty} />
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-12 text-center">Loading NFTs…</div>
      ) : (
        <DataTable
          columns={['Token ID', 'Name', 'Collection', 'Owner', 'Creator', 'Royalty']}
          rows={nfts.map(n => [
            n.tokenId.slice(0, 10) + '…',
            n.name,
            shortAddr(n.collection),
            shortAddr(n.owner),
            shortAddr(n.creator),
            (n.royaltyBps / 100).toFixed(2) + '%',
          ])}
          empty="No NFTs indexed yet"
        />
      )}
    </div>
  )
}
