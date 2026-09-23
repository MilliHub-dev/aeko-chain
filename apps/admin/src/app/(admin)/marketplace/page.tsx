'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import StatCard from '@/components/stat-card'

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
  const [protocol, setProtocol] = useState<ProtocolStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const response = await fetch('/api/explorer/protocol/status', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? 'Protocol status is unavailable')
      }
      setProtocol(payload.data as ProtocolStatus)
    } catch (err) {
      setProtocol(null)
      setError(err instanceof Error ? err.message : 'Unable to load protocol status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const programs = MARKETPLACE_PROGRAMS.map(({ key, label }) => ({
    key,
    label,
    status: protocol?.programs?.[key] ?? null,
  }))
  const allLive = programs.every((program) => program.status?.present && program.status.executable && !program.status.error)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="mt-0.5 text-sm text-gray-500">NFT listing and trading activity, gated by live protocol state</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="min-h-[42px] rounded-lg border border-[#1e2135] px-4 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh protocol'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Listings" value="—" />
        <StatCard label="Volume (24h)" value="—" />
        <StatCard label="Sales (24h)" value="—" />
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
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
                  <div className="mt-1 font-mono text-xs text-gray-600">{item?.programId ? shortAddr(item.programId) : 'registry value unavailable'}</div>
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
