'use client'

import { useCallback, useEffect, useState } from 'react'
import DataTable from '@/components/data-table'
import SectionTabs from '@/components/section-tabs'
import StatCard from '@/components/stat-card'

type Settings = {
  enabled: boolean
  amountAeko: number
  cooldownHours: number
  dailyBudgetAeko: number
  maxManualGrantAeko: number
  consoleAirdropCapAeko: number
  revision: number
  updatedAt: string
}

type FundingSnapshot = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
  mode: 'test-funding' | 'mainnet-disabled'
  settings: Settings | null
  dailyRemainingAeko: number | null
  publicSpentAeko: number | null
  publicReservedAeko: number | null
  consoleAirdropAggregateUnlimited: boolean
  faucetPerRequestCapAeko: number | null
}

type Grant = {
  id: string
  address: string
  amountAeko: number
  signature?: string | null
  grantedAt: string
  source: string
  confirmed: boolean
}

type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  source: string
  status: 'pending' | 'processing' | 'submitted' | 'reconciliation_required' | 'confirmed' | 'rejected' | 'failed'
  decidedAt?: string | null
  signature?: string | null
  confirmed: boolean
  submittedAt?: string | null
  confirmedAt?: string | null
  lastCheckedAt?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}

type FundingView = 'queue' | 'policy' | 'history'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-[#1e2135] bg-[#0d0e16] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 mono'

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new Error(`Funding control plane returned HTTP ${response.status} without JSON`)
  }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Funding request failed with HTTP ${response.status}`)
  }
  return payload
}

export default function FundingGrantsPage() {
  const [snapshot, setSnapshot] = useState<FundingSnapshot | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [requests, setRequests] = useState<FundingRequest[]>([])
  const [requestBusy, setRequestBusy] = useState('')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('10')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<FundingView>('queue')

  const refresh = useCallback(async () => {
    try {
      const s = await readJson(await fetch('/api/admin/funding/settings', { cache: 'no-store' }))
      const nextSnapshot = s.data as FundingSnapshot
      setSnapshot(nextSnapshot)
      setSettings(nextSnapshot.settings)
      setDraft((current) => {
        if (!nextSnapshot.settings) return null
        if (!current || current.revision !== nextSnapshot.settings.revision) {
          return nextSnapshot.settings
        }
        return current
      })

      if (nextSnapshot.mode !== 'test-funding') {
        setGrants([])
        setRequests([])
        return
      }

      const [g, r] = await Promise.all([
        readJson(await fetch('/api/admin/funding/grants?limit=100', { cache: 'no-store' })),
        readJson(await fetch('/api/admin/funding/requests?limit=100', { cache: 'no-store' })),
      ])
      setGrants(g.data ?? [])
      setRequests(r.data ?? [])
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : 'Funding control plane is unavailable',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !settings || snapshot?.mode !== 'test-funding') return

    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch('/api/admin/funding/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: settings.revision,
          enabled: draft.enabled,
          amountAeko: draft.amountAeko,
          cooldownHours: draft.cooldownHours,
          dailyBudgetAeko: draft.dailyBudgetAeko,
          maxManualGrantAeko: draft.maxManualGrantAeko,
          consoleAirdropCapAeko: draft.consoleAirdropCapAeko,
        }),
      })
      const json = await readJson(response)
      if (json.data?.settings) {
        setSnapshot(json.data)
        setSettings(json.data.settings)
        setDraft(json.data.settings)
      }
      setNotice({ ok: true, text: 'Testnet funding policy saved.' })
      await refresh()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleEnabled() {
    if (!settings || snapshot?.mode !== 'test-funding') return
    const nextEnabled = !settings.enabled
    setBusy(true)
    setNotice(null)
    try {
      const json = await readJson(await fetch('/api/admin/funding/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: settings.revision,
          enabled: nextEnabled,
        }),
      }))
      if (json.data?.settings) {
        setSnapshot(json.data)
        setSettings(json.data.settings)
        setDraft(json.data.settings)
      }
      setNotice({ ok: true, text: nextEnabled ? 'Public test funding resumed.' : 'Public test funding paused.' })
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Policy update failed' })
    } finally {
      setBusy(false)
    }
  }

  async function decideRequest(id: string, action: 'approve' | 'reject') {
    setRequestBusy(id)
    setNotice(null)
    try {
      const json = await readJson(await fetch('/api/admin/funding/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      }))
      setNotice({
        ok: true,
        text: action === 'approve'
          ? json.data.confirmed
            ? `Approved and confirmed ${json.data.amountAeko} AEKO to ${json.data.address}`
            : `Approved ${json.data.amountAeko} AEKO for ${json.data.address}; the transfer was submitted and is awaiting observed confirmation`
          : 'Funding request rejected',
      })
      await refresh()
    } catch (error) {
      setNotice({
        ok: false,
        text: error instanceof Error ? error.message : `Funding request ${action} failed`,
      })
    } finally {
      setRequestBusy('')
    }
  }

  async function manualGrant(e: React.FormEvent) {
    e.preventDefault()
    if (snapshot?.mode !== 'test-funding') return

    setBusy(true)
    setNotice(null)
    try {
      const json = await readJson(await fetch('/api/admin/funding/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), amountAeko: Number(amount) }),
      }))
      const signature = String(json.data?.signature ?? '')
      setNotice({
        ok: true,
        text: `Sent ${json.data.amountAeko} AEKO — ${json.data.confirmed ? 'confirmed' : 'submitted'}${signature ? ` (${signature.slice(0, 16)}…)` : ''}`,
      })
      setAddress('')
      await refresh()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Grant failed' })
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof Pick<Settings, 'amountAeko' | 'cooldownHours' | 'dailyBudgetAeko' | 'maxManualGrantAeko' | 'consoleAirdropCapAeko'>, label: string, step = '1') =>
    draft && (
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">{label}</label>
        <input
          type="number"
          min="0"
          step={step}
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          className={inputClass}
        />
      </div>
    )

  const activeRequests = requests.filter((request) =>
    ['pending', 'processing', 'submitted', 'reconciliation_required'].includes(request.status),
  )
  const isTestFunding = snapshot?.mode === 'test-funding'

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Funding operations</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Funding, grants & airdrops</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            {isTestFunding
              ? 'Review public test-funding requests, maintain testnet policy, and keep operator grants separate from direct developer airdrops.'
              : 'Mainnet Faucet funding is disabled. Governed treasury, allocation and grant execution is not presented as available until its on-chain governance and native-supply contracts are actually implemented.'}
          </p>
        </div>
        {isTestFunding && settings ? (
          <button
            type="button"
            onClick={toggleEnabled}
            disabled={busy}
            className={
              'min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-40 ' +
              (settings.enabled
                ? 'border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                : 'bg-emerald-400 text-black hover:bg-emerald-300')
            }
          >
            {settings.enabled ? 'Pause public funding' : 'Resume public funding'}
          </button>
        ) : null}
      </div>

      {snapshot?.mode === 'mainnet-disabled' ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
          <div className="font-semibold">Mainnet distributions are fail-closed</div>
          <p className="mt-1 text-amber-100/80">
            Faucet funding is unavailable on mainnet. This console will not simulate ecosystem grants, treasury distributions, launch allocations or governance-approved airdrops while the documented governance execution path and native AEKO supply model remain unresolved.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
        <StatCard
          label="Network"
          value={snapshot?.network ?? '—'}
          accent={Boolean(snapshot)}
        />
        <StatCard
          label="Public funding"
          value={isTestFunding && settings ? (settings.enabled ? 'Open' : 'Paused') : snapshot ? 'Disabled' : '—'}
          accent={isTestFunding ? settings?.enabled : undefined}
        />
        <StatCard label="Per request" value={isTestFunding && settings ? `${settings.amountAeko} AEKO` : '—'} />
        <StatCard
          label="Left today"
          value={isTestFunding && snapshot?.dailyRemainingAeko !== null && snapshot?.dailyRemainingAeko !== undefined
            ? `${snapshot.dailyRemainingAeko.toLocaleString()} AEKO`
            : '—'}
          sub={isTestFunding && settings ? `of ${settings.dailyBudgetAeko.toLocaleString()}` : undefined}
        />
        <StatCard label="Pending" value={isTestFunding ? activeRequests.length : '—'} />
        <StatCard label="Grant history" value={isTestFunding ? grants.length : '—'} />
      </div>

      {isTestFunding ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Public spent today</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.publicSpentAeko?.toLocaleString() ?? '0'} AEKO</div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Public budget reserved</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.publicReservedAeko?.toLocaleString() ?? '0'} AEKO</div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Developer airdrop aggregate</div>
            <div className="mt-1 text-sm font-semibold text-emerald-300">
              {snapshot?.consoleAirdropAggregateUnlimited ? 'No daily allocation ceiling' : 'Policy limited'}
            </div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Faucet hard cap</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.faucetPerRequestCapAeko ?? '—'} AEKO / request</div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          aria-live="polite"
          className={
            'rounded-xl border px-4 py-3 text-sm ' +
            (notice.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200')
          }
        >
          {notice.text}
        </div>
      ) : null}

      {isTestFunding ? (
        <>
          <SectionTabs
            label="Funding administration sections"
            value={view}
            onChange={setView}
            items={[
              { value: 'queue', label: 'Approval queue', description: 'Public requests waiting on you', count: activeRequests.length },
              { value: 'policy', label: 'Policy & manual grant', description: 'Public limits and operator actions' },
              { value: 'history', label: 'Grant history', description: 'Released testnet transfers', count: grants.length },
            ]}
          />

          {view === 'queue' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-semibold text-white">Requests requiring attention</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Approval atomically re-checks wallet cooldown and the public daily budget before protected Validator/Faucet settlement.
                  </p>
                </div>
                <div className="text-xs text-gray-600">{activeRequests.length} active request{activeRequests.length === 1 ? '' : 's'}</div>
              </div>
              <DataTable
                paginationLabel="requests"
                columns={['Requested', 'Address', 'Amount', 'Source', 'Status', 'Decision']}
                rows={activeRequests.map((request) => [
                  new Date(request.requestedAt).toLocaleString(),
                  request.address.slice(0, 10) + '…' + request.address.slice(-6),
                  `${request.amountAeko} AEKO`,
                  request.source,
                  <span
                    key={`${request.id}-status`}
                    className={
                      request.status === 'submitted'
                        ? 'text-blue-300'
                        : request.status === 'reconciliation_required'
                          ? 'text-amber-300'
                          : request.status === 'processing'
                            ? 'text-yellow-300'
                            : 'text-emerald-300'
                    }
                  >
                    {request.status.replaceAll('_', ' ')}
                  </span>,
                  <div key={request.id} className="flex flex-wrap items-center gap-2">
                    {request.status === 'pending' || request.status === 'submitted' ? (
                      <button
                        type="button"
                        onClick={() => decideRequest(request.id, 'approve')}
                        disabled={Boolean(requestBusy)}
                        className="min-h-[36px] rounded-lg bg-emerald-400 px-3 text-xs font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {requestBusy === request.id
                          ? 'Working…'
                          : request.status === 'submitted'
                            ? 'Recheck confirmation'
                            : 'Approve & release'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {request.status === 'processing' ? 'Settlement in progress' : 'Manual reconciliation required'}
                      </span>
                    )}
                    {request.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => decideRequest(request.id, 'reject')}
                        disabled={Boolean(requestBusy)}
                        className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>,
                ])}
                empty="No public funding requests need attention"
              />
            </section>
          ) : null}

          {view === 'policy' ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <form onSubmit={saveSettings} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">Public test-funding policy</div>
                  <h2 className="mt-1 font-semibold text-white">Approval limits</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    The public queue has a request amount, wallet cooldown, and daily allocation. Direct developer airdrops do not consume that aggregate allocation; they remain bounded by the Test Console and Faucet per-request caps.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('amountAeko', 'Amount per public request (AEKO)', '0.1')}
                  {field('cooldownHours', 'Public wallet cooldown (hours)', '0.1')}
                  {field('dailyBudgetAeko', 'Public daily allocation (AEKO)', '0.1')}
                  {field('maxManualGrantAeko', 'Max operator grant (AEKO)', '0.1')}
                  {field('consoleAirdropCapAeko', 'Developer airdrop cap / request (AEKO)', '0.1')}
                </div>
                <div className="mt-4 text-xs text-gray-600">
                  Policy revision {settings?.revision ?? '—'} · updated {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}
                </div>
                <button type="submit" disabled={busy || !draft} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? 'Saving…' : 'Save policy'}
                </button>
              </form>

              <form onSubmit={manualGrant} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Operator action</div>
                  <h2 className="mt-1 font-semibold text-white">Manual testnet grant</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Sends a test AEKO transfer without consuming the public-request daily allocation. The operator grant cap and the private Faucet hard cap still apply.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Recipient address</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Base58 wallet address…" required className={inputClass} />
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Amount (AEKO)</label>
                  <div className="flex flex-wrap gap-2">
                    <input type="number" min="0.001" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} required className={`${inputClass} sm:w-40`} />
                    {[1, 10, 50].map((value) => (
                      <button key={value} type="button" onClick={() => setAmount(String(value))} className="min-h-[44px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-emerald-500/50 hover:text-white">
                        {value} AEKO
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={busy || !address} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? 'Sending…' : 'Send manual grant'}
                </button>
              </form>
            </div>
          ) : null}

          {view === 'history' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Released testnet grants & airdrops</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Durable settlement history from public approvals, operator grants, and Test Console airdrops.
                </p>
              </div>
              <DataTable
                paginationLabel="grants"
                columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
                rows={grants.map((grant) => [
                  new Date(grant.grantedAt).toLocaleString(),
                  grant.address.slice(0, 10) + '…' + grant.address.slice(-6),
                  `${grant.amountAeko} AEKO`,
                  grant.source,
                  <span key={grant.id} className="text-emerald-300">confirmed</span>,
                  grant.signature ? grant.signature.slice(0, 16) + '…' : '—',
                ])}
                empty="No grants or direct airdrops have been released yet"
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
