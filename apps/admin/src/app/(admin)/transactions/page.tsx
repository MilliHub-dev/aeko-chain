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
    <div className="space-y-6 p-4 sm:p-6">
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
          className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
        >
          {transactionsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {transactionsQuery.error ? (
        <FeedbackAlert tone="error" title="Transactions could not be refreshed">
          {transactionsQuery.error instanceof Error ? transactionsQuery.error.message : 'Explorer transactions are unavailable.'}
        </FeedbackAlert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Shown" value={txs.length} />
        <StatCard label="Success" value={successCount} accent />
        <StatCard label="Success Rate" value={`${successRate}%`} />
      </div>

      <div className="flex gap-2">
        {(['all', 'success', 'failed'] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === value ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
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
