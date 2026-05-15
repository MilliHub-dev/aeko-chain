'use client'
import StatCard from '@/components/stat-card'

export default function MarketplacePage() {
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

      <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-10 text-center">
        <div className="text-4xl mb-4">◆</div>
        <div className="text-gray-300 font-semibold mb-2">Marketplace Indexing Coming Soon</div>
        <div className="text-gray-600 text-sm max-w-md mx-auto">
          The <span className="text-emerald-400 mono">nft-marketplace</span> program is deployed.
          Explorer indexing for listing events will be added in the next sprint.
          The on-chain data is live — use <span className="mono">getProgramAccounts</span> with{' '}
          <span className="text-emerald-400 mono">PROGRAM_IDS.NFT_MARKETPLACE</span> to query listings directly.
        </div>
      </div>
    </div>
  )
}
