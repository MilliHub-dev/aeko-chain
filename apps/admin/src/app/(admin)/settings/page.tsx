'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type ApplicationSettings = {
  networkConsoleEnabled: boolean
  nftDemoEnabled: boolean
  nftLiveFlowEnabled: boolean
  nftAdvancedToolsEnabled: boolean
  explorerListSize: number
  settingsRefreshSeconds: number
}

type BlockchainSettings = {
  network: string
  genesisHash: string
  socialIndexingEnabled: boolean
  socialReadinessRequired: boolean
  maxReadyLagSlots: number
  readinessPolicySource: string
  configurationSource: string
}

type SettingsDraft = ApplicationSettings & {
  socialReadinessRequired: boolean
  maxReadyLagSlots: number
}

type SettingsSnapshot = {
  revision: number
  updatedAt: string
  application: ApplicationSettings
  blockchain: BlockchainSettings
}

const SAFE_DRAFT: SettingsDraft = {
  networkConsoleEnabled: false,
  nftDemoEnabled: true,
  nftLiveFlowEnabled: false,
  nftAdvancedToolsEnabled: false,
  explorerListSize: 6,
  settingsRefreshSeconds: 30,
  socialReadinessRequired: false,
  maxReadyLagSlots: 128,
}

const SECTIONS = [
  { id: 'public-features', label: 'Public features', description: 'Route visibility and tools' },
  { id: 'explorer-experience', label: 'Explorer experience', description: 'Panel size and refresh' },
  { id: 'readiness-policy', label: 'Readiness policy', description: 'Indexer health thresholds' },
  { id: 'chain-binding', label: 'Chain binding', description: 'Read-only runtime identity' },
] as const

function toDraft(snapshot: SettingsSnapshot): SettingsDraft {
  return {
    ...snapshot.application,
    socialReadinessRequired: snapshot.blockchain.socialReadinessRequired,
    maxReadyLagSlots: snapshot.blockchain.maxReadyLagSlots,
  }
}

async function readResponse(response: Response): Promise<SettingsSnapshot> {
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Request failed with status ${response.status}`)
  }
  if (!payload?.data?.application || !payload?.data?.blockchain) {
    throw new Error('Explorer settings response is incomplete')
  }
  return payload.data as SettingsSnapshot
}

export default function SettingsPage() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [draft, setDraft] = useState<SettingsDraft>(SAFE_DRAFT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await readResponse(await fetch('/api/settings', { cache: 'no-store' }))
      setSnapshot(next)
      setDraft(toDraft(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(
    () => Boolean(snapshot && JSON.stringify(toDraft(snapshot)) !== JSON.stringify(draft)),
    [snapshot, draft],
  )

  const update = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setNotice('')
  }

  const save = async () => {
    if (!snapshot || !dirty) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: snapshot.revision,
          ...draft,
        }),
      })
      const next = await readResponse(response)
      setSnapshot(next)
      setDraft(toDraft(next))
      setNotice('Settings saved. Explorer clients will pick up the new configuration automatically.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  const connected = snapshot !== null
  const controlsDisabled = !connected || loading || saving
  const connectionLabel = loading ? 'Connecting' : connected ? 'Connected' : 'Unavailable'
  const blockchain = snapshot?.blockchain
  const lastUpdated = snapshot?.updatedAt
    ? new Date(snapshot.updatedAt).toLocaleString()
    : 'Waiting for Explorer backend'

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Control plane</div>
        <h1 className="mt-1 text-2xl font-bold text-white">Application settings</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
          Configure public Explorer behavior and readiness policy through the authenticated Operations Web route.
          Chain identity and bootstrap state stay visible but read-only.
        </p>
      </div>

      <div className="sticky top-14 z-30 -mx-1 rounded-xl border border-[#1e2135] bg-[#0d0e16]/95 p-3 shadow-xl shadow-black/10 backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className={
              'flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-sm ' +
              (connected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200')
            }>
              <span className={'h-2 w-2 rounded-full ' + (connected ? 'bg-emerald-400' : 'bg-amber-400')} />
              {connectionLabel}
            </div>
            <div className={
              'rounded-lg border px-3 py-2 text-xs ' +
              (dirty
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                : 'border-[#2b3048] bg-[#12141f] text-gray-500')
            }>
              {dirty ? 'Unsaved changes' : 'Configuration is saved'}
            </div>
            <div className="hidden text-xs text-gray-600 xl:block">Revision {snapshot?.revision ?? '—'} · {lastUpdated}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDraft(snapshot ? toDraft(snapshot) : SAFE_DRAFT)}
              disabled={!dirty || saving}
              className="min-h-[42px] rounded-lg border border-[#2b3048] px-4 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="min-h-[42px] rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Settings service unavailable</div>
            <div className="mt-1">{error}</div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="min-h-[44px] shrink-0 rounded-lg border border-red-400/30 px-4 font-medium hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'Retrying…' : 'Retry connection'}
          </button>
        </div>
      ) : null}

      {notice ? (
        <div aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="self-start xl:sticky xl:top-32">
          <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto rounded-xl border border-[#1e2135] bg-[#0a0b12] p-2 xl:block xl:space-y-1 xl:overflow-visible">
            {SECTIONS.map((section, index) => (
              <a
                key={section.id}
                href={'#' + section.id}
                className="min-w-[180px] rounded-lg px-3 py-3 transition-colors hover:bg-white/5 xl:block xl:min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#2b3048] bg-[#12141f] text-[10px] tabular-nums text-gray-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium text-gray-200">{section.label}</span>
                </div>
                <p className="mt-1 pl-8 text-[11px] leading-4 text-gray-600">{section.description}</p>
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          <section id="public-features" className="scroll-mt-32 rounded-2xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">01 · Public features</div>
              <h2 className="mt-1 font-semibold text-white">Visibility and operator tooling</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">These switches control public Explorer surfaces. Disabled routes fail closed and redirect to Aeko Scan.</p>
            </div>
            <div className="divide-y divide-[#1e2135]">
              <ToggleRow label="AEKO Network Console" description="Show the testnet accounts, programs, Social workspace, and Social E2E acceptance lab." checked={draft.networkConsoleEnabled} onChange={(value) => update('networkConsoleEnabled', value)} disabled={controlsDisabled} />
              <ToggleRow label="NFT Demo page" description="Expose the AEKO-721 demo route and navigation links." checked={draft.nftDemoEnabled} onChange={(value) => update('nftDemoEnabled', value)} disabled={controlsDisabled} />
              <ToggleRow label="NFT live lifecycle" description="Show the public wallet-local create, mint, freeze, thaw, update, transfer, and Explorer verification flow." checked={draft.nftLiveFlowEnabled} onChange={(value) => update('nftLiveFlowEnabled', value)} disabled={controlsDisabled || !draft.nftDemoEnabled} />
              <ToggleRow label="NFT advanced protocol tools" description="Show lower-level account reads, setup builders, unsigned transaction tools, wallet adapter diagnostics, and signed submission." checked={draft.nftAdvancedToolsEnabled} onChange={(value) => update('nftAdvancedToolsEnabled', value)} disabled={controlsDisabled || !draft.nftDemoEnabled} />
            </div>
          </section>

          <section id="explorer-experience" className="scroll-mt-32 rounded-2xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">02 · Explorer experience</div>
              <h2 className="mt-1 font-semibold text-white">Public data density and refresh</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">Numeric controls are constrained by the backend contract, not only by the browser.</p>
            </div>
            <div className="space-y-8 p-5">
              <RangeSetting label="Records per Explorer panel" description="Controls the number of blocks, transactions, posts, stakes, and NFTs fetched for each Aeko Scan panel." value={draft.explorerListSize} min={3} max={12} step={1} suffix=" records" onChange={(value) => update('explorerListSize', value)} disabled={controlsDisabled} />
              <RangeSetting label="Public settings propagation" description="How often an open Explorer page refreshes application settings from Explorer backend." value={draft.settingsRefreshSeconds} min={10} max={300} step={10} suffix=" sec" onChange={(value) => update('settingsRefreshSeconds', value)} disabled={controlsDisabled} />
            </div>
          </section>

          <section id="readiness-policy" className="scroll-mt-32 rounded-2xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">03 · Readiness policy</div>
              <h2 className="mt-1 font-semibold text-white">Blockchain readiness thresholds</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                These controls are enforced by Explorer backend health/readiness logic and persist with the chain-bound Explorer database.
              </p>
            </div>
            <div className="divide-y divide-[#1e2135]">
              <ToggleRow
                label="Require Social projection for readiness"
                description="When enabled, Explorer reports not ready if the Social projection is missing or beyond the configured lag tolerance."
                checked={draft.socialReadinessRequired}
                onChange={(value) => update('socialReadinessRequired', value)}
                disabled={controlsDisabled}
              />
              <div className="p-5">
                <RangeSetting
                  label="Maximum ready index lag"
                  description="Maximum slot distance tolerated between the validator and indexed projections before Explorer readiness fails."
                  value={draft.maxReadyLagSlots}
                  min={16}
                  max={4096}
                  step={16}
                  suffix=" slots"
                  onChange={(value) => update('maxReadyLagSlots', value)}
                  disabled={controlsDisabled}
                />
              </div>
            </div>
          </section>

          <section id="chain-binding" className="scroll-mt-32 rounded-2xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">04 · Chain binding</div>
                  <h2 className="mt-1 font-semibold text-white">Runtime identity</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">These values require deployment/runtime changes and are intentionally not editable here.</p>
                </div>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">Read only</span>
              </div>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <ReadOnlyValue label="Network" value={blockchain?.network || 'Unavailable'} />
              <ReadOnlyValue label="Genesis hash" value={blockchain?.genesisHash || 'Unavailable'} mono />
              <ReadOnlyValue label="Social indexing" value={blockchain ? (blockchain.socialIndexingEnabled ? 'Enabled' : 'Disabled') : 'Unavailable'} />
              <ReadOnlyValue label="Readiness policy source" value={blockchain?.readinessPolicySource || 'Unavailable'} />
              <ReadOnlyValue label="Runtime configuration source" value={blockchain?.configurationSource || 'Unavailable'} />
              <ReadOnlyValue label="Settings revision" value={snapshot ? String(snapshot.revision) : 'Unavailable'} />
            </div>
            <div className="border-t border-[#1e2135] px-5 py-3 text-xs text-gray-600">Last settings update: {lastUpdated}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:cursor-not-allowed disabled:opacity-40 ' +
          (checked ? 'border-emerald-400/60 bg-emerald-400' : 'border-[#343a55] bg-[#1b1e2d]')
        }
      >
        <span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

function RangeSetting({
  label,
  description,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <label className="text-sm font-medium text-white">{label}</label>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">{description}</p>
        </div>
        <div className="min-w-24 self-start rounded-lg border border-[#2b3048] bg-[#0a0b12] px-3 py-2 text-right text-sm font-semibold tabular-nums text-emerald-300">
          {value}{suffix}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="mt-4 h-2 w-full cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="mt-1 flex justify-between text-xs text-gray-600"><span>{min}{suffix}</span><span>{max}{suffix}</span></div>
    </div>
  )
}

function ReadOnlyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[#1e2135] bg-[#0a0b12] p-4">
      <div className="text-xs uppercase tracking-wider text-gray-600">{label}</div>
      <div className={'mt-2 break-all text-sm text-gray-200 ' + (mono ? 'font-mono' : '')}>{value}</div>
    </div>
  )
}
