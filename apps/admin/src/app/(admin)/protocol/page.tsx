'use client'

import { useCallback, useEffect, useState } from 'react'
import DataTable from '@/components/data-table'
import SectionTabs from '@/components/section-tabs'
import StatCard from '@/components/stat-card'

type ProtocolRegistry = {
  schemaVersion: number | null
  genesisHash: string | null
  authority: string | null
  tokenProgramsFeature: string | null
  tokenProgramsFeatureActivatedAt: number | null
  permissionLayerFeature: string | null
  permissionLayerFeatureActivatedAt: number | null
  programs: Record<string, string>
  states: Record<string, string>
  accounts: Record<string, string>
  complete: boolean
}

type FeatureStatus = {
  featureId: string | null
  activatedAt: number | null
  registryActivatedAt: number | null
  present: boolean
  ownerMatches: boolean
  dataLen: number
  error: string | null
}

type ProgramStatus = {
  programId: string
  present: boolean
  executable: boolean
  owner: string | null
  error: string | null
}

type StateStatus = {
  stateAccount: string
  expectedOwner: string | null
  present: boolean
  ownerMatches: boolean
  dataLen: number
  condition: string
  error: string | null
}

type ProtocolStatus = {
  complete: boolean
  condition: string
  registryComplete: boolean
  registrySchemaVersion: number | null
  registryGenesisHash: string | null
  bootstrapInProgress: boolean
  liveGenesisHash: string
  genesisMatches: boolean
  features: Record<string, FeatureStatus>
  programs: Record<string, ProgramStatus>
  states: Record<string, StateStatus>
}

type ProtocolView = 'overview' | 'programs' | 'states'

async function readEnvelope<T>(path: string): Promise<T> {
  const response = await fetch('/api/explorer/' + path, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Request failed with status ' + response.status)
  }
  if (!payload?.data) throw new Error('Explorer response is missing data')
  return payload.data as T
}

function shortAddress(value: string | null | undefined) {
  if (!value) return '—'
  if (value.length <= 20) return value
  return value.slice(0, 10) + '…' + value.slice(-6)
}

function stateLabel(ok: boolean, good = 'ready', bad = 'not ready') {
  return ok ? good : bad
}

export default function ProtocolPage() {
  const [registry, setRegistry] = useState<ProtocolRegistry | null>(null)
  const [status, setStatus] = useState<ProtocolStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState('')
  const [view, setView] = useState<ProtocolView>('overview')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const [nextRegistry, nextStatus] = await Promise.all([
        readEnvelope<ProtocolRegistry>('registry/protocol'),
        readEnvelope<ProtocolStatus>('protocol/status'),
      ])
      setRegistry(nextRegistry)
      setStatus(nextStatus)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (err) {
      setRegistry(null)
      setStatus(null)
      setError(err instanceof Error ? err.message : 'Unable to load protocol state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const featureEntries = Object.entries(status?.features ?? {})
  const programEntries = Object.entries(status?.programs ?? {})
  const stateEntries = Object.entries(status?.states ?? {})
  const executablePrograms = programEntries.filter(([, value]) => value.present && value.executable && !value.error).length
  const healthyStates = stateEntries.filter(([, value]) => value.condition === 'healthy').length

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Chain control plane</div>
          <h1 className="mt-1 text-2xl font-bold text-white">AEKO Protocol</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Canonical protocol registry, feature activation, native program registration, and state-account ownership from Explorer live RPC checks.
          </p>
          <p className="mt-1 text-xs text-gray-600">{lastUpdate ? 'Updated ' + lastUpdate : 'Waiting for live status'}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="min-h-[42px] rounded-lg border border-[#1e2135] px-4 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Protocol status unavailable: {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        <StatCard label="Protocol" value={status ? stateLabel(status.complete, 'Complete', 'Incomplete') : '—'} accent={Boolean(status?.complete)} />
        <StatCard label="Registry" value={registry ? stateLabel(registry.complete, 'Complete', 'Incomplete') : '—'} />
        <StatCard label="Executable Programs" value={status ? executablePrograms + ' / ' + programEntries.length : '—'} />
        <StatCard label="Healthy State Accounts" value={status ? healthyStates + ' / ' + stateEntries.length : '—'} />
      </div>

      <SectionTabs
        label="Protocol control plane sections"
        value={view}
        onChange={setView}
        items={[
          { value: 'overview', label: 'Overview', description: 'Binding and feature activation' },
          { value: 'programs', label: 'Native programs', description: 'Executable registrations', count: programEntries.length },
          { value: 'states', label: 'State accounts', description: 'Ownership and initialization', count: stateEntries.length },
        ]}
      />

      {view === 'overview' ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">Chain binding</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  The canonical registry must be bound to the same genesis currently served by the validator before Protocol can be considered complete.
                </p>
              </div>
              <span className={status?.genesisMatches ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>
                {status?.condition ?? 'unavailable'}
              </span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatusRow label="Schema" value={registry?.schemaVersion == null ? 'missing' : 'v' + registry.schemaVersion} />
              <StatusRow label="Registry genesis" value={shortAddress(registry?.genesisHash)} mono />
              <StatusRow label="Live genesis" value={shortAddress(status?.liveGenesisHash)} mono />
              <StatusRow label="Binding" value={status ? (status.genesisMatches ? 'matches' : 'mismatch') : '—'} />
              <StatusRow label="Bootstrap" value={status ? (status.bootstrapInProgress ? 'in progress' : 'settled') : '—'} />
            </div>
          </section>

          <section className="rounded-xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <h2 className="font-semibold text-white">Feature activation</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">Runtime features must exist, be owned by the feature program, and agree with the canonical registry activation slot.</p>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {featureEntries.length ? featureEntries.map(([name, feature]) => {
                const healthy = feature.present && feature.ownerMatches && feature.activatedAt !== null && !feature.error
                return (
                  <div key={name} className="rounded-xl border border-[#1e2135] bg-[#0a0b12] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{name}</div>
                      <span className={healthy ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>
                        {healthy ? 'active' : 'attention'}
                      </span>
                    </div>
                    <dl className="mt-4 space-y-2 text-xs">
                      <StatusRow label="Feature ID" value={shortAddress(feature.featureId)} mono />
                      <StatusRow label="On-chain activation slot" value={feature.activatedAt === null ? 'pending' : String(feature.activatedAt)} />
                      <StatusRow label="Registry activation slot" value={feature.registryActivatedAt === null ? 'missing' : String(feature.registryActivatedAt)} />
                      <StatusRow label="Owner" value={feature.ownerMatches ? 'matches feature program' : 'mismatch'} />
                    </dl>
                    {feature.error ? <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">{feature.error}</div> : null}
                  </div>
                )
              }) : <div className="text-sm text-gray-600">No feature status returned.</div>}
            </div>
          </section>

          <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-5">
            <div>
              <h2 className="font-semibold text-white">Registry identity</h2>
              <p className="mt-1 text-sm text-gray-500">Canonical authority and registry inventory for this chain.</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <StatusRow label="Protocol authority" value={shortAddress(registry?.authority)} mono />
              <StatusRow label="Registered programs" value={registry ? String(Object.keys(registry.programs).length) : '—'} />
              <StatusRow label="Registered state accounts" value={registry ? String(Object.keys(registry.states).length) : '—'} />
              <StatusRow label="Registered protocol accounts" value={registry ? String(Object.keys(registry.accounts).length) : '—'} />
            </div>
          </section>
        </div>
      ) : null}

      {view === 'programs' ? (
        <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-white">Native program registrations</h2>
            <p className="mt-1 text-sm text-gray-500">Program IDs come from the canonical protocol registry, not duplicate Admin constants.</p>
          </div>
          <DataTable
            paginationLabel="programs"
            columns={['Program', 'Program ID', 'Present', 'Executable', 'Error']}
            rows={programEntries.map(([name, program]) => [
              name,
              <span key={name + '-id'} className="font-mono text-gray-500">{shortAddress(program.programId)}</span>,
              program.present ? 'yes' : 'no',
              <span key={name + '-exec'} className={program.executable ? 'text-emerald-300' : 'text-amber-300'}>{program.executable ? 'yes' : 'no'}</span>,
              program.error ?? '—',
            ])}
            empty="No native program status returned"
          />
        </section>
      ) : null}

      {view === 'states' ? (
        <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-white">Canonical state accounts</h2>
            <p className="mt-1 text-sm text-gray-500">State is healthy only when the account exists, has the expected owner, and contains initialized data.</p>
          </div>
          <DataTable
            paginationLabel="state accounts"
            columns={['State', 'Account', 'Owner', 'Data', 'Condition', 'Error']}
            rows={stateEntries.map(([name, item]) => [
              name,
              <span key={name + '-account'} className="font-mono text-gray-500">{shortAddress(item.stateAccount)}</span>,
              <span key={name + '-owner'} className={item.present && item.ownerMatches ? 'text-emerald-300' : 'text-amber-300'}>{!item.present ? 'missing' : item.ownerMatches ? 'matches' : 'mismatch'}</span>,
              item.present ? item.dataLen.toLocaleString() + ' bytes' : '—',
              <span key={name + '-condition'} className={item.condition === 'healthy' ? 'text-emerald-300' : 'text-amber-300'}>{item.condition}</span>,
              item.error ?? '—',
            ])}
            empty="No canonical state status returned"
          />
        </section>
      ) : null}
    </div>
  )
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#1e2135] pb-2 last:border-b-0">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={mono ? 'text-right font-mono text-xs text-gray-300' : 'text-right text-xs text-gray-300'}>{value}</span>
    </div>
  )
}
