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
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
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
    load()
  }, [load])

  const dirty = useMemo(
    () => Boolean(snapshot && draft && JSON.stringify(toDraft(snapshot)) !== JSON.stringify(draft)),
    [snapshot, draft],
  )

  const update = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setNotice('')
  }

  const save = async () => {
    if (!snapshot || !draft || !dirty) return
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

  if (loading && !snapshot) {
    return <div className="p-6 text-sm text-gray-400">Loading application and blockchain settings…</div>
  }

  if (!snapshot || !draft) {
    return (
      <div className="p-6">
        <div className="max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
          <div className="font-semibold">Settings unavailable</div>
          <div className="mt-1">{error || 'Explorer backend did not return a settings snapshot.'}</div>
          <button type="button" onClick={load} className="mt-4 min-h-[44px] rounded-lg border border-red-400/30 px-4 text-sm font-medium hover:bg-red-400/10">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Control plane</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Application Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Durable UI controls are stored by Explorer backend in the PostgreSQL database already bound
            to this chain. Validator bootstrap and chain identity stay read-only here.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setDraft(toDraft(snapshot))} disabled={!dirty || saving} className="min-h-[44px] rounded-lg border border-[#2b3048] px-4 text-sm font-medium text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">
            Discard changes
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="min-h-[44px] rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}

      <section className="rounded-2xl border border-[#1e2135] bg-[#12141f]">
        <div className="border-b border-[#1e2135] px-5 py-4">
          <h2 className="font-semibold text-white">Public feature visibility</h2>
          <p className="mt-1 text-sm text-gray-500">These switches affect public Explorer surfaces. Disabled routes fail closed and redirect to Aeko Scan.</p>
        </div>
        <div className="divide-y divide-[#1e2135]">
          <ToggleRow label="AEKO Network Console" description="Show the testnet accounts, programs, Social workspace, and Social E2E acceptance lab." checked={draft.networkConsoleEnabled} onChange={(value) => update('networkConsoleEnabled', value)} />
          <ToggleRow label="NFT Demo page" description="Expose the AEKO-721 demo route and navigation links." checked={draft.nftDemoEnabled} onChange={(value) => update('nftDemoEnabled', value)} />
          <ToggleRow label="NFT live lifecycle" description="Show the public wallet-local create, mint, freeze, thaw, update, transfer, and Explorer verification flow." checked={draft.nftLiveFlowEnabled} onChange={(value) => update('nftLiveFlowEnabled', value)} disabled={!draft.nftDemoEnabled} />
          <ToggleRow label="NFT advanced protocol tools" description="Show lower-level account reads, setup builders, unsigned transaction tools, wallet adapter diagnostics, and signed submission." checked={draft.nftAdvancedToolsEnabled} onChange={(value) => update('nftAdvancedToolsEnabled', value)} disabled={!draft.nftDemoEnabled} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#1e2135] bg-[#12141f]">
        <div className="border-b border-[#1e2135] px-5 py-4">
          <h2 className="font-semibold text-white">Explorer experience</h2>
          <p className="mt-1 text-sm text-gray-500">Numeric controls are constrained by the backend contract, not only by the browser.</p>
        </div>
        <div className="space-y-8 p-5">
          <RangeSetting label="Records per Explorer panel" description="Controls the number of blocks, transactions, posts, stakes, and NFTs fetched for each Aeko Scan panel." value={draft.explorerListSize} min={3} max={12} step={1} suffix=" records" onChange={(value) => update('explorerListSize', value)} />
          <RangeSetting label="Public settings propagation" description="How often an open Explorer page refreshes application settings from Explorer backend." value={draft.settingsRefreshSeconds} min={10} max={300} step={10} suffix=" sec" onChange={(value) => update('settingsRefreshSeconds', value)} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#1e2135] bg-[#12141f]">
        <div className="border-b border-[#1e2135] px-5 py-4">
          <h2 className="font-semibold text-white">Blockchain readiness policy</h2>
          <p className="mt-1 text-sm text-gray-500">
            These controls are enforced by Explorer backend health/readiness logic and persist with the chain-bound Explorer database.
          </p>
        </div>
        <div className="divide-y divide-[#1e2135]">
          <ToggleRow
            label="Require Social projection for readiness"
            description="When enabled, Explorer reports not ready if the Social projection is missing or beyond the configured lag tolerance."
            checked={draft.socialReadinessRequired}
            onChange={(value) => update('socialReadinessRequired', value)}
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
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#1e2135] bg-[#12141f]">
        <div className="border-b border-[#1e2135] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Blockchain binding</h2>
              <p className="mt-1 text-sm text-gray-500">Live process and chain identity. These values require deployment/runtime changes and are intentionally not editable here.</p>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">Read only</span>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <ReadOnlyValue label="Network" value={snapshot.blockchain.network} />
          <ReadOnlyValue label="Genesis hash" value={snapshot.blockchain.genesisHash} mono />
          <ReadOnlyValue label="Social indexing" value={snapshot.blockchain.socialIndexingEnabled ? 'Enabled' : 'Disabled'} />
          <ReadOnlyValue label="Readiness policy source" value={snapshot.blockchain.readinessPolicySource} />
          <ReadOnlyValue label="Runtime configuration source" value={snapshot.blockchain.configurationSource} />
          <ReadOnlyValue label="Settings revision" value={String(snapshot.revision)} />
        </div>
        <div className="border-t border-[#1e2135] px-5 py-3 text-xs text-gray-600">Last settings update: {new Date(snapshot.updatedAt).toLocaleString()}</div>
      </section>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">{description}</div>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'border-emerald-400/60 bg-emerald-400' : 'border-[#343a55] bg-[#1b1e2d]'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

function RangeSetting({ label, description, value, min, max, step, suffix, onChange }: { label: string; description: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="text-sm font-medium text-white">{label}</label>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">{description}</p>
        </div>
        <div className="min-w-24 rounded-lg border border-[#2b3048] bg-[#0a0b12] px-3 py-2 text-right text-sm font-semibold tabular-nums text-emerald-300">{value}{suffix}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-4 h-2 w-full cursor-pointer accent-emerald-400" />
      <div className="mt-1 flex justify-between text-xs text-gray-600"><span>{min}{suffix}</span><span>{max}{suffix}</span></div>
    </div>
  )
}

function ReadOnlyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[#1e2135] bg-[#0a0b12] p-4">
      <div className="text-xs uppercase tracking-wider text-gray-600">{label}</div>
      <div className={`mt-2 break-all text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
