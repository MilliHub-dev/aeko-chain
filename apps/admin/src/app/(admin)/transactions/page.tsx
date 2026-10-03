'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { AccountLink, TransactionLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery } from '@/lib/client-query'

type Tx = { signature: string; slot: number; success: boolean; fee: number; signer?: string | null; primaryProgram?: string | null }
function fmtFee(lamports: number) { return (lamports / 1e9).toFixed(6) + ' AEKO' }

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')
  const transactionsQuery = useQuery({
    queryKey: adminQueryKeys.transactions,
    queryFn: () => explorerQuery<Tx[]>('/transactions?limit=100'),
    refetchInterval: 10_000,
  })

  const txs = transactionsQuery.data ?? []
  const lastUpdate = transactionsQuery.dataUpdatedAt
    ? new Date(transactionsQuery.dataUpdatedAt).toLocaleTimeString()
    : ''
  const filtered = txs.filter(tx => {
    if (filter === 'success') return tx.success
    if (filter === 'failed') return !tx.success
    return true
  })
  const successCount = txs.filter(tx => tx.success).length
  const successRate = txs.length ? Math.round((successCount / txs.length) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdate ? `Updated ${lastUpdate}` : transactionsQuery.isLoading ? 'Loading…' : 'Waiting for data…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void transactionsQuery.refetch()}
          disabled={transactionsQuery.isFetching}
          className="min-h-11 rounded-xl border border-[#1e2135] px-4 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {transactionsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {transactionsQuery.error ? (
        <FeedbackAlert tone="error" title="Transactions could not be refreshed">
          {transactionsQuery.error instanceof Error ? transactionsQuery.error.message : 'Explorer transactions are unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Shown" value={txs.length} />
        <StatCard label="Success" value={successCount} accent />
        <StatCard label="Success Rate" value={`${successRate}%`} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Transaction status filter">
        {(['all', 'success', 'failed'] as const).map(value => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-11 rounded-xl border px-4 text-sm capitalize transition-colors ${filter === value ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {value}
          </button>
        ))}
      </div>

      <DataTable
        paginationLabel="transactions"
        columns={['Signature', 'Slot', 'Status', 'Fee', 'Signer', 'Program']}
        rows={filtered.map(tx => [
          <TransactionLink key={tx.signature} signature={tx.signature} />,
          tx.slot.toLocaleString(),
          <span key={tx.signature + '-status'} className={tx.success ? 'text-emerald-400' : 'text-red-400'}>
            {tx.success ? '✓ OK' : '✗ Fail'}
          </span>,
          fmtFee(tx.fee),
          tx.signer ? <AccountLink key={tx.signature + '-signer'} address={tx.signer} /> : '—',
          tx.primaryProgram ? <AccountLink key={tx.signature + '-program'} address={tx.primaryProgram} /> : '—',
        ])}
        empty={transactionsQuery.isLoading ? 'Loading transactions…' : 'No transactions found'}
      />
    </div>
  )
}
