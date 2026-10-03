'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { AccountLink } from '@/components/chain-links'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery } from '@/lib/client-query'

type TransactionRecord = {
  signature: string
  slot: number
  success: boolean
  fee: number
  primaryProgram?: string | null
  signer?: string | null
}

function fmtFee(lamports: number) {
  return (lamports / 1e9).toFixed(6) + ' AEKO'
}

export default function TransactionDetailPage() {
  const { signature } = useParams<{ signature: string }>()
  const router = useRouter()

  const transactionQuery = useQuery({
    queryKey: adminQueryKeys.transaction(signature),
    enabled: Boolean(signature),
    queryFn: () =>
      explorerQuery<TransactionRecord>(
        `/transactions/${encodeURIComponent(signature)}`,
      ),
  })

  const transaction = transactionQuery.data ?? null

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push('/transactions')}
            className="mb-3 min-h-11 rounded-lg border border-[#1e2135] px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/5"
          >
            ← Transactions
          </button>
          <h1 className="text-2xl font-bold text-white">Explorer transaction</h1>
          <p className="mt-1 text-sm text-gray-500">
            Indexed transaction state from the Explorer API for this Admin network.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void transactionQuery.refetch()}
          disabled={transactionQuery.isFetching}
          className="min-h-11 rounded-lg border border-[#1e2135] px-4 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          {transactionQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {transactionQuery.error ? (
        <FeedbackAlert tone="error" title="Transaction could not be loaded">
          {transactionQuery.error instanceof Error
            ? transactionQuery.error.message
            : 'Explorer transaction data is unavailable.'}
        </FeedbackAlert>
      ) : null}

      {transactionQuery.isLoading ? (
        <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-6 text-sm text-gray-500">
          Loading transaction…
        </div>
      ) : transaction ? (
        <>
          <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Signature</div>
                <p className="mt-2 break-all font-mono text-sm text-gray-200">
                  {transaction.signature}
                </p>
              </div>
              <span
                className={
                  'inline-flex min-h-[36px] shrink-0 items-center rounded-full border px-3 text-xs font-semibold ' +
                  (transaction.success
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-red-400/30 bg-red-400/10 text-red-200')
                }
              >
                {transaction.success ? 'Success' : 'Failed'}
              </span>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Slot" value={transaction.slot.toLocaleString()} accent />
            <StatCard label="Status" value={transaction.success ? 'Success' : 'Failed'} />
            <StatCard label="Fee" value={fmtFee(transaction.fee)} />
          </div>

          <section className="overflow-hidden rounded-2xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <h2 className="font-semibold text-white">Network context</h2>
              <p className="mt-1 text-sm text-gray-500">
                Follow the related signer or program account without leaving the Admin control plane.
              </p>
            </div>
            <dl className="divide-y divide-[#1e2135]">
              <DetailRow label="Signature" value={transaction.signature} mono />
              <DetailRow label="Slot" value={transaction.slot.toLocaleString()} />
              <DetailRow label="Fee" value={fmtFee(transaction.fee)} />
              <DetailRow
                label="Signer"
                value={transaction.signer ? <AccountLink address={transaction.signer} /> : '—'}
              />
              <DetailRow
                label="Primary program"
                value={transaction.primaryProgram ? <AccountLink address={transaction.primaryProgram} /> : '—'}
              />
            </dl>
          </section>
        </>
      ) : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
      <dt className="text-xs uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className={`min-w-0 break-all text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
