'use client'

import { useQuery } from '@tanstack/react-query'
import { TransactionLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery, rpcQuery } from '@/lib/client-query'

type Stats = {
  slot: number
  epoch: number
  epochProgress: number
  supply: number
  circulating: number
  txCount: number
  version: string
  validators: number
  delinquent: number
}

type Block = { slot: number; transactionCount: number; unixTimestamp?: number }
type Tx = { signature: string; slot: number; success: boolean; primaryProgram?: string }
type EpochInfo = { absoluteSlot: number; epoch: number; slotIndex: number; slotsInEpoch: number }
type SupplyResponse = { value: { total: number; circulating: number } }
type VersionResponse = { 'aeko-core'?: string }
type VoteAccounts = { current?: unknown[]; delinquent?: unknown[] }

function fmtTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleTimeString()
}
function fmtAeko(lamports: number) {
  return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' AEKO'
}

export default function Dashboard() {
  const dashboardQuery = useQuery({
    queryKey: adminQueryKeys.dashboard,
    queryFn: async () => {
      const [epochInfo, supply, txCount, version, voteAccounts, recentBlocks, recentTxs] =
        await Promise.all([
          rpcQuery<EpochInfo>('getEpochInfo'),
          rpcQuery<SupplyResponse>('getSupply'),
          rpcQuery<number>('getTransactionCount'),
          rpcQuery<VersionResponse>('getVersion'),
          rpcQuery<VoteAccounts>('getVoteAccounts'),
          explorerQuery<Block[]>('/blocks?limit=8'),
          explorerQuery<Tx[]>('/transactions?limit=8'),
        ])

      const stats: Partial<Stats> = {
        slot: epochInfo?.absoluteSlot,
        epoch: epochInfo?.epoch,
        epochProgress: epochInfo
          ? Math.round((epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100)
          : 0,
        supply: supply?.value?.total,
        circulating: supply?.value?.circulating,
        txCount,
        version: version?.['aeko-core'] ?? '—',
        validators: voteAccounts?.current?.length ?? 0,
        delinquent: voteAccounts?.delinquent?.length ?? 0,
      }

      return { stats, blocks: recentBlocks ?? [], txs: recentTxs ?? [] }
    },
    refetchInterval: 10_000,
  })

  const stats = dashboardQuery.data?.stats ?? {}
  const blocks = dashboardQuery.data?.blocks ?? []
  const txs = dashboardQuery.data?.txs ?? []
  const online = dashboardQuery.isError ? false : dashboardQuery.data ? true : null
  const lastUpdate = dashboardQuery.dataUpdatedAt
    ? new Date(dashboardQuery.dataUpdatedAt).toLocaleTimeString()
    : ''

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : dashboardQuery.isLoading ? 'Loading…' : 'Waiting for data…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online === null ? 'bg-gray-500' : online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-400">{online === null ? 'Connecting' : online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {dashboardQuery.error ? (
        <FeedbackAlert
          tone="error"
          title="Dashboard data is unavailable"
          action={
            <button
              type="button"
              onClick={() => void dashboardQuery.refetch()}
              disabled={dashboardQuery.isFetching}
              className="min-h-11 rounded-lg border border-red-300/25 px-3 text-xs font-semibold hover:bg-red-300/10 disabled:opacity-40"
            >
              {dashboardQuery.isFetching ? 'Retrying…' : 'Retry'}
            </button>
          }
        >
          {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Operations data could not be loaded.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Current Slot" value={stats.slot?.toLocaleString() ?? '—'} accent />
        <StatCard label="Total Supply" value={stats.supply ? fmtAeko(stats.supply) : '—'} sub={stats.circulating ? `Circulating: ${fmtAeko(stats.circulating)}` : undefined} />
        <StatCard label="Transactions" value={stats.txCount?.toLocaleString() ?? '—'} />
        <StatCard label="Validators" value={stats.validators ?? '—'} sub={stats.delinquent ? `${stats.delinquent} delinquent` : undefined} />
        <StatCard label="Epoch" value={stats.epoch ?? '—'} sub={stats.epochProgress !== undefined ? `${stats.epochProgress}% complete` : undefined} />
        <StatCard label="Node Version" value={stats.version ?? '—'} />
        <div className="col-span-1 rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:col-span-2">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Epoch Progress</div>
          <div className="w-full bg-[#1e2135] rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${stats.epochProgress ?? 0}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1.5">
            <span>Epoch {stats.epoch}</span>
            <span>{stats.epochProgress ?? 0}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Blocks</h2>
          <DataTable
            columns={['Slot', 'Txs', 'Time']}
            rows={blocks.map(b => [
              <span key={b.slot} className="text-emerald-400">{b.slot.toLocaleString()}</span>,
              b.transactionCount,
              fmtTime(b.unixTimestamp),
            ])}
            empty={dashboardQuery.isLoading ? 'Loading blocks…' : 'No blocks indexed yet'}
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Transactions</h2>
          <DataTable
            columns={['Signature', 'Slot', 'Status']}
            rows={txs.map(tx => [
              <TransactionLink key={tx.signature} signature={tx.signature} />,
              tx.slot.toLocaleString(),
              <span key={tx.signature + '-status'} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>
                {tx.success ? 'OK' : 'Fail'}
              </span>,
            ])}
            empty={dashboardQuery.isLoading ? 'Loading transactions…' : 'No transactions indexed yet'}
          />
        </div>
      </div>
    </div>
  )
}
