'use client'
import { useEffect, useState } from 'react'
import StatCard from '@/components/stat-card'

// Program ids as the SDK publishes them (programs/token-721 = [10u8; 32],
// programs/nft-marketplace = [11u8; 32]).
const PROGRAMS = [
  { name: 'token-721', id: 'gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5' },
  { name: 'nft-marketplace', id: 'k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn' },
]

type Status = { name: string; id: string; executable: boolean | null }

export default function MarketplacePage() {
  const [status, setStatus] = useState<Status[]>([])

  useEffect(() => {
    Promise.all(
      PROGRAMS.map(async (p) => {
        try {
          const res = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [p.id, { encoding: 'base64' }] }),
          })
          const json = await res.json()
          return { ...p, executable: json.result?.value?.executable === true }
        } catch {
          return { ...p, executable: null }
        }
      }),
    ).then(setStatus)
  }, [])

  const allLive = status.length > 0 && status.every((s) => s.executable)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <p className="text-gray-500 text-sm mt-0.5">NFT listing and trading activity</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active Listings" value="—" />
        <StatCard label="Volume (24h)" value="—" />
        <StatCard label="Sales (24h)" value="—" />
      </div>

      <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Program status on this chain</h2>
        <div className="space-y-2">
          {status.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="text-gray-200">{s.name}</span>
                <span className="mono text-xs text-gray-600 ml-3">{s.id}</span>
              </div>
              <span className={s.executable ? 'text-emerald-400' : s.executable === null ? 'text-gray-500' : 'text-red-400'}>
                {s.executable ? 'registered' : s.executable === null ? 'unknown' : 'not registered'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          {allLive
            ? 'Both programs are executable. Listings are not indexed by the Explorer yet; query listing accounts with getProgramAccounts on the marketplace program id.'
            : 'These programs are native builtins. A validator built without them registered (runtime/src/builtins.rs) cannot mint, list or buy NFTs, and the Aeko app reports “NFT trading isn’t available yet”. Deploy a validator image that registers them and restart; no ledger reset is needed.'}
        </p>
      </div>
    </div>
  )
}
