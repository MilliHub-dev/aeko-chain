'use client'

import { useQuery } from '@tanstack/react-query'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery } from '@/lib/client-query'

type Block = { slot: number; blockhash: string; parentSlot: number; transactionCount: number; unixTimestamp?: number; producer?: string }

function shortHash(h: string) { return h.slice(0, 8) + '…' + h.slice(-6) }
function fmtTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

export default function BlocksPage() {
  const blocksQuery = useQuery({
    queryKey: adminQueryKeys.blocks,
    queryFn: () => explorerQuery<Block[]>('/blocks?limit=50'),
    refetchInterval: 10_000,
  })

  const blocks = blocksQuery.data ?? []
  const lastUpdate = blocksQuery.dataUpdatedAt
    ? new Date(blocksQuery.dataUpdatedAt).toLocaleTimeString()
    : ''
  const totalTxs = blocks.reduce((sum, block) => sum + block.transactionCount, 0)
  const avgTxsPerBlock = blocks.length ? Math.round(totalTxs / blocks.length) : 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Blocks</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : blocksQuery.isLoading ? 'Loading…' : 'Waiting for data…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void blocksQuery.refetch()}
          disabled={blocksQuery.isFetching}
          className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
        >
          {blocksQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {blocksQuery.error ? (
        <FeedbackAlert tone="error" title="Blocks could not be refreshed">
          {blocksQuery.error instanceof Error ? blocksQuery.error.message : 'Explorer blocks are unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Latest Slot" value={blocks[0]?.slot.toLocaleString() ?? '—'} accent />
        <StatCard label="Total Txs (shown)" value={totalTxs.toLocaleString()} />
        <StatCard label="Avg Txs / Block" value={avgTxsPerBlock} />
      </div>

      <DataTable
        paginationLabel="blocks"
        columns={['Slot', 'Blockhash', 'Parent', 'Txs', 'Producer', 'Time']}
        rows={blocks.map(block => [
          <span key={block.slot} className="text-emerald-400 font-semibold">{block.slot.toLocaleString()}</span>,
          shortHash(block.blockhash),
          block.parentSlot.toLocaleString(),
          block.transactionCount,
          block.producer ? shortHash(block.producer) : '—',
          fmtTime(block.unixTimestamp),
        ])}
        empty={blocksQuery.isLoading ? 'Loading blocks…' : 'No blocks indexed yet'}
      />
    </div>
  )
}
