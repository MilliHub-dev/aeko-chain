'use client'

import { useQuery } from '@tanstack/react-query'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery, rpcQuery } from '@/lib/client-query'

type Supply = { total: number; circulating: number; nonCirculating: number }
type SupplyResponse = { value: Supply }
type Transfer = { signature: string; slot: number; mint: string; source: string; destination: string; amount: string }

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-4) }
function fmtAeko(lamports: number) {
  return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' AEKO'
}

export default function TokensPage() {
  const tokensQuery = useQuery({
    queryKey: adminQueryKeys.tokens,
    queryFn: async () => {
      const [supply, transfers] = await Promise.all([
        rpcQuery<SupplyResponse>('getSupply'),
        explorerQuery<Transfer[]>('/tokens/transfers?limit=50'),
      ])
      return { supply: supply?.value ?? null, transfers: transfers ?? [] }
    },
    refetchInterval: 15_000,
  })

  const supply = tokensQuery.data?.supply ?? null
  const transfers = tokensQuery.data?.transfers ?? []
  const lastUpdate = tokensQuery.dataUpdatedAt
    ? new Date(tokensQuery.dataUpdatedAt).toLocaleTimeString()
    : ''
  const circulatingPct = supply?.total
    ? Math.round((supply.circulating / supply.total) * 100)
    : 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tokens</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : tokensQuery.isLoading ? 'Loading…' : 'Waiting for data…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void tokensQuery.refetch()}
          disabled={tokensQuery.isFetching}
          className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
        >
          {tokensQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {tokensQuery.error ? (
        <FeedbackAlert tone="error" title="Token data could not be refreshed">
          {tokensQuery.error instanceof Error ? tokensQuery.error.message : 'Token data is unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total Supply" value={supply ? fmtAeko(supply.total) : '—'} accent />
        <StatCard label="Circulating" value={supply ? fmtAeko(supply.circulating) : '—'} sub={`${circulatingPct}% of total`} />
        <StatCard label="Non-Circulating" value={supply ? fmtAeko(supply.nonCirculating) : '—'} />
      </div>

      {supply ? (
        <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-5">
          <div className="flex justify-between text-xs text-gray-500 mb-3">
            <span>Circulating Supply</span>
            <span className="text-emerald-400">{circulatingPct}%</span>
          </div>
          <div className="w-full bg-[#1e2135] rounded-full h-3">
            <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${circulatingPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>{fmtAeko(supply.circulating)} circulating</span>
            <span>{fmtAeko(supply.nonCirculating)} locked</span>
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Token Transfers</h2>
        <DataTable
          paginationLabel="token transfers"
          columns={['Signature', 'Mint', 'From', 'To', 'Amount', 'Slot']}
          rows={transfers.map(transfer => [
            transfer.signature.slice(0, 12) + '…',
            shortAddr(transfer.mint),
            shortAddr(transfer.source),
            shortAddr(transfer.destination),
            transfer.amount,
            transfer.slot.toLocaleString(),
          ])}
          empty={tokensQuery.isLoading ? 'Loading transfers…' : 'No token transfers indexed yet'}
        />
      </div>
    </div>
  )
}
