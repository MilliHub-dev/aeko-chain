'use client'

import { useQuery } from '@tanstack/react-query'
import { AccountLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery } from '@/lib/client-query'

type Nft = {
  tokenId: string
  collectionId: string | null
  owner: string
  creator: string
  metadataUri: string | null
  frozen: boolean
  lastSeenSlot: number
}

function shortAddr(value: string | null | undefined) {
  if (!value) return '—'
  return value.slice(0, 8) + '…' + value.slice(-4)
}

function shortText(value: string | null | undefined, maxLength = 36) {
  if (!value) return '—'
  return value.length > maxLength ? value.slice(0, maxLength - 1) + '…' : value
}

export default function NftsPage() {
  const nftsQuery = useQuery({
    queryKey: adminQueryKeys.nfts,
    queryFn: () => explorerQuery<Nft[]>('/nfts?limit=100'),
    refetchInterval: 15_000,
  })

  const nfts = nftsQuery.data ?? []
  const lastUpdate = nftsQuery.dataUpdatedAt
    ? new Date(nftsQuery.dataUpdatedAt).toLocaleTimeString()
    : ''
  const uniqueCollections = new Set(
    nfts.flatMap((nft) => (nft.collectionId ? [nft.collectionId] : [])),
  ).size
  const uniqueCreators = new Set(nfts.map((nft) => nft.creator)).size
  const frozenCount = nfts.filter((nft) => nft.frozen).length

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">NFTs</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : nftsQuery.isLoading ? 'Loading…' : 'Waiting for data…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void nftsQuery.refetch()}
          disabled={nftsQuery.isFetching}
          className="min-h-11 rounded-xl border border-[#1e2135] px-4 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {nftsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {nftsQuery.error ? (
        <FeedbackAlert tone="error" title="NFT data could not be refreshed">
          {nftsQuery.error instanceof Error ? nftsQuery.error.message : 'NFT data is unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Total NFTs" value={nfts.length} accent />
        <StatCard label="Collections" value={uniqueCollections} />
        <StatCard label="Creators" value={uniqueCreators} />
        <StatCard label="Frozen" value={frozenCount} />
      </div>

      <DataTable
        paginationLabel="NFTs"
        columns={['Token ID', 'Collection', 'Owner', 'Creator', 'Metadata', 'Status', 'Last Seen Slot']}
        rows={nfts.map((nft) => [
          shortAddr(nft.tokenId),
          shortAddr(nft.collectionId),
          <AccountLink key={nft.tokenId + '-owner'} address={nft.owner} label={shortAddr(nft.owner)} />,
          <AccountLink key={nft.tokenId + '-creator'} address={nft.creator} label={shortAddr(nft.creator)} />,
          shortText(nft.metadataUri),
          nft.frozen ? 'Frozen' : 'Active',
          nft.lastSeenSlot.toLocaleString(),
        ])}
        empty={nftsQuery.isLoading ? 'Loading NFTs…' : 'No NFTs indexed yet'}
      />
    </div>
  )
}
