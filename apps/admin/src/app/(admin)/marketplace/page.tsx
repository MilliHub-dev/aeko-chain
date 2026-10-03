'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AccountLink } from '@/components/chain-links'
import FeedbackAlert from '@/components/feedback-alert'
import StatCard from '@/components/stat-card'
import { adminQueryKeys, explorerQuery } from '@/lib/client-query'

type ProgramStatus = {
  programId: string
  present: boolean
  executable: boolean
  owner: string | null
  error: string | null
}

type ProtocolStatus = {
  complete: boolean
  programs: Record<string, ProgramStatus>
}

const MARKETPLACE_PROGRAMS = [
  { key: 'token721', label: 'token-721' },
  { key: 'nftMarketplace', label: 'nft-marketplace' },
] as const

function shortAddr(value: string) {
  return value.length > 18 ? value.slice(0, 10) + '…' + value.slice(-6) : value
}

export default function MarketplacePage() {
  const protocolQuery = useQuery({
    queryKey: adminQueryKeys.marketplace,
    queryFn: () => explorerQuery<ProtocolStatus>('/protocol/status'),
    refetchInterval: 15_000,
  })

  const protocol = protocolQuery.data ?? null

  const programs = MARKETPLACE_PROGRAMS.map(({ key, label }) => ({
    key,
    label,
    status: protocol?.programs?.[key] ?? null,
  }))
  const allLive = programs.every((program) => program.status?.present && program.status.executable && !program.status.error)

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="mt-0.5 text-sm text-gray-500">NFT listing and trading activity, gated by live protocol state</p>
        </div>
        <button
          type="button"
          onClick={() => void protocolQuery.refetch()}
          disabled={protocolQuery.isFetching}
          className="min-h-11 rounded-lg border border-[#1e2135] px-4 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          {protocolQuery.isFetching ? 'Refreshing…' : 'Refresh protocol'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Marketplace readiness" value={allLive ? 'Ready' : protocol ? 'Attention' : '—'} accent={allLive} />
        <StatCard label="AEKO-721 program" value={programs[0]?.status?.present && programs[0]?.status?.executable ? 'Executable' : programs[0]?.status ? 'Not ready' : '—'} />
        <StatCard label="Marketplace program" value={programs[1]?.status?.present && programs[1]?.status?.executable ? 'Executable' : programs[1]?.status ? 'Not ready' : '—'} />
      </div>

      {protocolQuery.error ? (
        <FeedbackAlert tone="error" title="Marketplace protocol status is unavailable">
          {protocolQuery.error instanceof Error ? protocolQuery.error.message : 'Protocol status is unavailable.'}
        </FeedbackAlert>
      ) : null}

      <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Program status on this chain</h2>
            <p className="mt-1 text-xs text-gray-600">Resolved from Explorer protocol status. Admin no longer carries duplicate hard-coded program IDs.</p>
          </div>
          <Link href="/protocol" className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
            Open protocol control plane →
          </Link>
        </div>

        <div className="mt-5 space-y-2">
          {programs.map((program) => {
            const item = program.status
            const ready = Boolean(item?.present && item.executable && !item.error)
            return (
              <div key={program.key} className="flex flex-col gap-2 rounded-lg border border-[#1e2135] bg-[#0a0b12] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm text-gray-200">{program.label}</div>
                  <div className="mt-1 text-xs text-gray-600">{item?.programId ? <AccountLink address={item.programId} label={shortAddr(item.programId)} /> : 'registry value unavailable'}</div>
                </div>
                <span className={ready ? 'text-sm text-emerald-400' : item ? 'text-sm text-amber-300' : 'text-sm text-gray-500'}>
                  {ready ? 'executable' : item ? 'not ready' : 'unknown'}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-5 text-xs leading-5 text-gray-500">
          {allLive
            ? 'Both marketplace dependencies are executable. Explorer does not yet expose marketplace listing projections, so listing and sales counters remain intentionally unavailable.'
            : 'Marketplace operations require the token-program feature to be activated and the token-721 plus nft-marketplace native programs to be executable. Check the Protocol page for the canonical feature, program, and state-account evidence. No ledger reset is required.'}
        </p>
      </section>
    </div>
  )
}
