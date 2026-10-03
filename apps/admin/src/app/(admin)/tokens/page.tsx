'use client'

import { useQuery } from '@tanstack/react-query'
import { AccountLink, TransactionLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery, rpcQuery } from '@/lib/client-query'

type Supply = { total: number; circulating: number; nonCirculating: number }
type SupplyResponse = { value: Supply }
type Transfer = { signature: string; slot: number; mint: string; source: string; destination: string; amount: string }

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
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
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
          className="min-h-11 rounded-xl border border-[#1e2135] px-4 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {tokensQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {tokensQuery.error ? (
        <FeedbackAlert tone="error" title="Token data could not be refreshed">
          {tokensQuery.error instanceof Error ? tokensQuery.error.message : 'Token data is unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
          <div className="mt-2 flex flex-col gap-1 text-xs text-gray-600 sm:flex-row sm:justify-between">
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
            <TransactionLink key={transfer.signature} signature={transfer.signature} />,
            <AccountLink key={transfer.signature + '-mint'} address={transfer.mint} />,
            <AccountLink key={transfer.signature + '-source'} address={transfer.source} />,
            <AccountLink key={transfer.signature + '-destination'} address={transfer.destination} />,
            transfer.amount,
            transfer.slot.toLocaleString(),
          ])}
          empty={tokensQuery.isLoading ? 'Loading transfers…' : 'No token transfers indexed yet'}
        />
      </div>
    </div>
  )
}
