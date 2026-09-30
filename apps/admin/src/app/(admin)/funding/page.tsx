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
  maxAdminFundingAeko: number
  consoleAirdropCapAeko: number
  revision: number
  updatedAt: string
}

type FundingSnapshot = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
  mode: 'funding'
  settings: Settings | null
  dailyRemainingAeko: number | null
  publicSpentAeko: number | null
  publicReservedAeko: number | null
  developerAirdropEnabled: boolean
  faucetPerRequestCapAeko: number | null
}

type FundingTransfer = {
  id: string
  requestId?: string | null
  address: string
  amountAeko: number
  signature?: string | null
  fundedAt: string
  source: string
  confirmed: boolean
}

type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  source: string
  status: 'pending' | 'processing' | 'submitted' | 'confirmed' | 'failed' | 'rejected'
  decidedAt?: string | null
  submittedAt?: string | null
  confirmedAt?: string | null
  signature?: string | null
  confirmed: boolean
  errorCode?: string | null
  errorMessage?: string | null
}

type Airdrop = {
  id: string
  address: string
  amountAeko: number
  signature?: string | null
  status: 'processing' | 'submitted' | 'confirmed' | 'failed'
  requestedAt: string
  submittedAt?: string | null
  confirmedAt?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}

type FundingView = 'queue' | 'policy' | 'history' | 'airdrops'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-[#1e2135] bg-[#0d0e16] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 mono'

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new Error(`Funding control plane returned HTTP ${response.status} without JSON`)
  }
  if (!response.ok) {
    const code = String(payload.error?.code ?? '')
    const friendly = {
      FUNDING_SUBMISSION_RETRY_PENDING: 'Funding submission is retrying safely. No duplicate transfer will be created.',
      AIRDROP_SUBMISSION_RETRY_PENDING: 'Developer airdrop is retrying safely. No duplicate airdrop will be created.',
      AIRDROP_DISABLED_ON_MAINNET: 'Developer airdrop is disabled on Mainnet.',
    }[code]
    throw new Error(friendly ?? payload.error?.message ?? `Funding request failed with HTTP ${response.status}`)
  }
  return payload
}

export default function FundingPage() {
  const [snapshot, setSnapshot] = useState<FundingSnapshot | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [fundingHistory, setFundingHistory] = useState<FundingTransfer[]>([])
  const [airdrops, setAirdrops] = useState<Airdrop[]>([])
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

      if (nextSnapshot.mode !== 'funding') {
        setFundingHistory([])
        setAirdrops([])
        setRequests([])
        return
      }

      const [g, a, r] = await Promise.all([
        readJson(await fetch('/api/admin/funding/history?limit=100', { cache: 'no-store' })),
        readJson(await fetch('/api/admin/funding/airdrops?limit=100', { cache: 'no-store' })),
        readJson(await fetch('/api/admin/funding/requests?limit=100', { cache: 'no-store' })),
      ])
      setFundingHistory(g.data ?? [])
      setAirdrops(a.data ?? [])
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
    if (!draft || !settings || snapshot?.mode !== 'funding') return

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
          maxAdminFundingAeko: draft.maxAdminFundingAeko,
          consoleAirdropCapAeko: draft.consoleAirdropCapAeko,
        }),
      })
      const json = await readJson(response)
      if (json.data?.settings) {
        setSnapshot(json.data)
        setSettings(json.data.settings)
        setDraft(json.data.settings)
      }
      setNotice({ ok: true, text: 'Funding policy saved.' })
      await refresh()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleEnabled() {
    if (!settings || snapshot?.mode !== 'funding') return
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
      setNotice({ ok: true, text: nextEnabled ? 'Public funding resumed.' : 'Public funding paused.' })
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Policy update failed' })
    } finally {
      setBusy(false)
    }
  }

  async function decideRequest(id: string, action: 'approve' | 'reject' | 'reconcile') {
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
        text: action === 'reject'
          ? 'Funding request rejected'
          : json.data.status === 'confirmed'
            ? `Funding confirmed: ${json.data.amountAeko} AEKO to ${json.data.address}`
            : `Funding is ${json.data.status}; no duplicate transfer will be submitted while confirmation is unresolved.`,
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

  async function sendFunding(e: React.FormEvent) {
    e.preventDefault()
    if (snapshot?.mode !== 'funding') return

    setBusy(true)
    setNotice(null)
    try {
      const json = await readJson(await fetch('/api/admin/funding/send', {
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
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Funding send failed' })
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof Pick<Settings, 'amountAeko' | 'cooldownHours' | 'dailyBudgetAeko' | 'maxAdminFundingAeko' | 'consoleAirdropCapAeko'>, label: string, step = '1') =>
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

  const attentionRequests = requests.filter((request) =>
    ['pending', 'processing', 'submitted', 'failed'].includes(request.status),
  )
  const isFunding = snapshot?.mode === 'funding'

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Funding operations</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Funding & developer airdrops</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            {isFunding
              ? 'Review public funding requests, maintain network policy, send Admin funding directly, and keep developer airdrops as a separate test utility.'
              : 'Funding policy and direct Admin sends are controlled here. Developer airdrop is disabled on Mainnet.'}
          </p>
        </div>
        {isFunding && settings ? (
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-4">
        <StatCard
          label="Network"
          value={snapshot?.network ?? '—'}
          accent={Boolean(snapshot)}
        />
        <StatCard
          label="Public funding"
          value={isFunding && settings ? (settings.enabled ? 'Open' : 'Paused') : snapshot ? 'Unavailable' : '—'}
          accent={isFunding ? settings?.enabled : undefined}
        />
        <StatCard label="Per request" value={isFunding && settings ? `${settings.amountAeko} AEKO` : '—'} />
        <StatCard
          label="Left today"
          value={isFunding && snapshot?.dailyRemainingAeko !== null && snapshot?.dailyRemainingAeko !== undefined
            ? `${snapshot.dailyRemainingAeko.toLocaleString()} AEKO`
            : '—'}
          sub={isFunding && settings ? `of ${settings.dailyBudgetAeko.toLocaleString()}` : undefined}
        />
        <StatCard label="Needs attention" value={isFunding ? attentionRequests.length : '—'} />
        <StatCard label="Funding history" value={isFunding ? fundingHistory.length : '—'} />
      </div>

      {isFunding ? (
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
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Developer airdrop</div>
            <div className="mt-1 text-sm font-semibold text-emerald-300">
              {snapshot?.developerAirdropEnabled ? 'Enabled on test environments' : 'Disabled on Mainnet'}
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

      {isFunding ? (
        <>
          <SectionTabs
            label="Funding administration sections"
            value={view}
            onChange={setView}
            items={[
              { value: 'queue', label: 'Funding requests', description: 'Admin decisions and submitted funding reconciliation', count: attentionRequests.length },
              { value: 'policy', label: 'Policy & direct funding', description: 'Public limits and direct Admin funding' },
              { value: 'history', label: 'Funding history', description: 'Confirmed public and Admin funding', count: fundingHistory.length },
              { value: 'airdrops', label: 'Airdrop history', description: 'Developer Test Console airdrops', count: airdrops.length },
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
                <div className="text-xs text-gray-600">{attentionRequests.length} request{attentionRequests.length === 1 ? '' : 's'} requiring attention</div>
              </div>
              <DataTable
                paginationLabel="requests"
                columns={['Requested', 'Address', 'Amount', 'Source', 'Status', 'Decision']}
                rows={attentionRequests.map((request) => [
                  new Date(request.requestedAt).toLocaleString(),
                  request.address.slice(0, 10) + '…' + request.address.slice(-6),
                  `${request.amountAeko} AEKO`,
                  request.source,
                  <span
                    key={`${request.id}-status`}
                    className={
                      request.status === 'failed'
                        ? 'text-red-300'
                        : request.status === 'pending'
                          ? 'text-emerald-300'
                          : 'text-yellow-300'
                    }
                  >
                    {request.status}
                  </span>,
                  <div key={request.id} className="flex flex-wrap items-center gap-2">
                    {request.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => decideRequest(request.id, 'approve')}
                          disabled={Boolean(requestBusy)}
                          className="min-h-[36px] rounded-lg bg-emerald-400 px-3 text-xs font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {requestBusy === request.id ? 'Working…' : 'Approve & release'}
                        </button>
                        <button
                          type="button"
                          onClick={() => decideRequest(request.id, 'reject')}
                          disabled={Boolean(requestBusy)}
                          className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </>
                    ) : request.status === 'submitted' ? (
                      <button
                        type="button"
                        onClick={() => decideRequest(request.id, 'reconcile')}
                        disabled={Boolean(requestBusy)}
                        className="min-h-[36px] rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
                      >
                        {requestBusy === request.id ? 'Checking…' : 'Check confirmation'}
                      </button>
                    ) : request.status === 'processing' ? (
                      <div key={request.id} className="flex max-w-xs flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decideRequest(request.id, 'reconcile')}
                            disabled={Boolean(requestBusy)}
                            className="min-h-[36px] rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
                          >
                            {requestBusy === request.id ? 'Retrying…' : 'Retry submission'}
                          </button>
                          <button
                            type="button"
                            onClick={() => decideRequest(request.id, 'reject')}
                            disabled={Boolean(requestBusy)}
                            className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Cancel request
                          </button>
                        </div>
                        <span className="text-xs leading-5 text-amber-200">
                          Funding submission is retrying safely in the background. The persisted transaction intent is reused, so no duplicate transfer is created.
                        </span>
                      </div>
                    ) : (
                      <span className="max-w-xs text-xs leading-5 text-red-300">
                        Transfer failed on-chain. No funding history entry was recorded.
                      </span>
                    )}
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
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">Public funding policy</div>
                  <h2 className="mt-1 font-semibold text-white">Approval limits</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    The public queue has a request amount, wallet cooldown, and daily allocation. Direct developer airdrops do not consume that aggregate allocation; they remain bounded by the Test Console and Faucet per-request caps.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('amountAeko', 'Amount per public request (AEKO)', '0.1')}
                  {field('cooldownHours', 'Public wallet cooldown (hours)', '0.1')}
                  {field('dailyBudgetAeko', 'Public daily allocation (AEKO)', '0.1')}
                  {field('maxAdminFundingAeko', 'Max Admin funding send (AEKO)', '0.1')}
                  {field('consoleAirdropCapAeko', 'Developer airdrop cap / request (AEKO)', '0.1')}
                </div>
                <div className="mt-4 text-xs text-gray-600">
                  Policy revision {settings?.revision ?? '—'} · updated {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}
                </div>
                <button type="submit" disabled={busy || !draft} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? 'Saving…' : 'Save policy'}
                </button>
              </form>

              <form onSubmit={sendFunding} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Operator action</div>
                  <h2 className="mt-1 font-semibold text-white">Direct Admin funding</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Sends AEKO directly to the recipient without a second approval step. The Admin funding cap and Faucet hard cap still apply.
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
                  {busy ? 'Sending…' : 'Send funding'}
                </button>
              </form>
            </div>
          ) : null}

          {view === 'airdrops' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Developer Test Console airdrops</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Developer airdrops are separate from public funding requests. They are disabled on Mainnet and remain rate-limited, capped per request, and durably tracked on test environments.
                </p>
              </div>
              <DataTable
                paginationLabel="airdrops"
                columns={['Requested', 'Address', 'Amount', 'Status', 'Signature', 'Error']}
                rows={airdrops.map((airdrop) => [
                  new Date(airdrop.requestedAt).toLocaleString(),
                  airdrop.address.slice(0, 10) + '…' + airdrop.address.slice(-6),
                  `${airdrop.amountAeko} AEKO`,
                  <span
                    key={airdrop.id}
                    className={
                      airdrop.status === 'confirmed'
                        ? 'text-emerald-300'
                        : airdrop.status === 'failed'
                          ? 'text-red-300'
                          : 'text-yellow-300'
                    }
                  >
                    {airdrop.status}
                  </span>,
                  airdrop.signature ? airdrop.signature.slice(0, 16) + '…' : '—',
                  airdrop.errorCode ?? '—',
                ])}
                empty="No developer airdrops have been requested yet"
              />
            </section>
          ) : null}

          {view === 'history' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Confirmed funding</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Confirmed public requests and direct Admin funding appear here. Developer airdrops remain deliberately separate.
                </p>
              </div>
              <DataTable
                paginationLabel="funding history"
                columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
                rows={fundingHistory.map((funding) => [
                  new Date(funding.fundedAt).toLocaleString(),
                  funding.address.slice(0, 10) + '…' + funding.address.slice(-6),
                  `${funding.amountAeko} AEKO`,
                  funding.source,
                  <span key={funding.id} className={funding.confirmed ? 'text-emerald-300' : 'text-yellow-300'}>{funding.confirmed ? 'confirmed' : 'submitted'}</span>,
                  funding.signature ? funding.signature.slice(0, 16) + '…' : '—',
                ])}
                empty="No confirmed funding transfers yet"
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
