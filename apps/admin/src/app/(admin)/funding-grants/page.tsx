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
}
type Grant = { address: string; amountAeko: number; signature: string; at: string; source: string; confirmed: boolean }
type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  status: 'pending' | 'processing' | 'approved' | 'rejected'
  signature?: string
}
type FundingView = 'queue' | 'policy' | 'history'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-[#1e2135] bg-[#0d0e16] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 mono'

export default function FundingGrantsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [requests, setRequests] = useState<FundingRequest[]>([])
  const [requestBusy, setRequestBusy] = useState('')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('10')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<FundingView>('queue')

  const refresh = useCallback(async () => {
    const [s, g, r] = await Promise.all([
      fetch('/api/admin/funding/settings').then((response) => response.json()),
      fetch('/api/admin/funding/grants?limit=100').then((response) => response.json()),
      fetch('/api/admin/funding/requests?limit=100').then((response) => response.json()),
    ])
    if (s.data) {
      setSettings(s.data.settings)
      setDraft((current) => current ?? s.data.settings)
      setRemaining(s.data.dailyRemainingAeko)
    }
    setGrants(g.data ?? [])
    setRequests(r.data ?? [])
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
    if (!draft) return
    setBusy(true)
    setNotice(null)
    const res = await fetch('/api/admin/funding/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) return setNotice({ ok: false, text: json.error?.message ?? 'Save failed' })
    if (json.data?.settings) {
      setSettings(json.data.settings)
      setDraft(json.data.settings)
    }
    setNotice({ ok: true, text: 'Funding policy saved.' })
    void refresh()
  }

  async function toggleEnabled() {
    if (!settings) return
    const nextEnabled = !settings.enabled
    const res = await fetch('/api/admin/funding/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    })
    if (!res.ok) return
    setSettings((current) => current ? { ...current, enabled: nextEnabled } : current)
    setDraft((current) => current ? { ...current, enabled: nextEnabled } : current)
    void refresh()
  }

  async function decideRequest(id: string, action: 'approve' | 'reject') {
    setRequestBusy(id)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/funding/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const json = await res.json()
      if (!res.ok) {
        setNotice({ ok: false, text: json.error?.message ?? `Funding request ${action} failed` })
        return
      }
      setNotice({
        ok: true,
        text: action === 'approve'
          ? json.data.confirmed
            ? `Approved and confirmed ${json.data.amountAeko} AEKO to ${json.data.address}`
            : `Approved ${json.data.amountAeko} AEKO for ${json.data.address}; transaction submitted but confirmation was not observed yet`
          : 'Funding request rejected',
      })
      await refresh()
    } catch {
      setNotice({ ok: false, text: 'Could not update the funding request. Try again.' })
    } finally {
      setRequestBusy('')
    }
  }

  async function manualGrant(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    const res = await fetch('/api/admin/funding/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim(), amountAeko: Number(amount) }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) return setNotice({ ok: false, text: json.error?.message ?? 'Grant failed' })
    setNotice({ ok: true, text: `Sent ${json.data.amountAeko} AEKO — ${json.data.confirmed ? 'confirmed' : 'submitted'} (${json.data.signature.slice(0, 16)}…)` })
    setAddress('')
    void refresh()
  }

  const field = (key: keyof Settings, label: string, step = '1') =>
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

  const pendingRequests = requests.filter((request) => request.status === 'pending' || request.status === 'processing')

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Funding operations</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Funding grants</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Review public requests, maintain the funding policy, and keep manual operator grants separate from the public approval queue.
          </p>
        </div>
        {settings ? (
          <button
            type="button"
            onClick={toggleEnabled}
            className={
              'min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors ' +
              (settings.enabled
                ? 'border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                : 'bg-emerald-400 text-black hover:bg-emerald-300')
            }
          >
            {settings.enabled ? 'Pause public funding' : 'Resume public funding'}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <StatCard label="Status" value={settings ? (settings.enabled ? 'Open' : 'Paused') : '—'} accent={settings?.enabled} />
        <StatCard label="Per request" value={settings ? `${settings.amountAeko} AEKO` : '—'} />
        <StatCard label="Left today" value={remaining !== null ? `${remaining.toLocaleString()} AEKO` : '—'} sub={settings ? `of ${settings.dailyBudgetAeko.toLocaleString()}` : undefined} />
        <StatCard label="Pending" value={pendingRequests.length} />
        <StatCard label="Grant history" value={grants.length} />
      </div>

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

      <SectionTabs
        label="Funding administration sections"
        value={view}
        onChange={setView}
        items={[
          { value: 'queue', label: 'Approval queue', description: 'Requests waiting on you', count: pendingRequests.length },
          { value: 'policy', label: 'Policy & manual grant', description: 'Limits and operator actions' },
          { value: 'history', label: 'Grant history', description: 'Released transactions', count: grants.length },
        ]}
      />

      {view === 'queue' ? (
        <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Requests requiring attention</h2>
              <p className="mt-1 text-sm text-gray-500">
                Approval re-checks wallet cooldown and daily budget before the protected low-level airdrop is submitted.
              </p>
            </div>
            <div className="text-xs text-gray-600">{pendingRequests.length} active request{pendingRequests.length === 1 ? '' : 's'}</div>
          </div>
          <DataTable
            paginationLabel="requests"
            columns={['Requested', 'Address', 'Amount', 'Status', 'Decision']}
            rows={pendingRequests.map((request) => [
              new Date(request.requestedAt).toLocaleString(),
              request.address.slice(0, 10) + '…' + request.address.slice(-6),
              `${request.amountAeko} AEKO`,
              <span key={`${request.id}-status`} className={request.status === 'processing' ? 'text-yellow-300' : 'text-emerald-300'}>{request.status}</span>,
              <div key={request.id} className="flex flex-wrap items-center gap-2">
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
                  disabled={Boolean(requestBusy) || request.status === 'processing'}
                  className="min-h-[36px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>
              </div>,
            ])}
            empty="No funding requests need attention"
          />
        </section>
      ) : null}

      {view === 'policy' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveSettings} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
            <div className="mb-5">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">Public policy</div>
              <h2 className="mt-1 font-semibold text-white">Approval limits</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                These values define what a normal public request asks for and what can be released after approval.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('amountAeko', 'Amount per request (AEKO)', '0.1')}
              {field('cooldownHours', 'Cooldown per wallet (hours)')}
              {field('dailyBudgetAeko', 'Daily budget (AEKO)')}
              {field('maxManualGrantAeko', 'Max manual grant (AEKO)')}
            </div>
            <button type="submit" disabled={busy || !draft} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? 'Saving…' : 'Save policy'}
            </button>
          </form>

          <form onSubmit={manualGrant} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
            <div className="mb-5">
              <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Operator action</div>
              <h2 className="mt-1 font-semibold text-white">Manual grant</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Bypasses public cooldown and daily budget. The manual ceiling and private Faucet Daemon per-request cap still apply.
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
            <h2 className="font-semibold text-white">Released grants</h2>
            <p className="mt-1 text-sm text-gray-500">Confirmed and submitted low-level funding transactions retained by Operations Web.</p>
          </div>
          <DataTable
            paginationLabel="grants"
            columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
            rows={grants.map((grant) => [
              new Date(grant.at).toLocaleString(),
              grant.address.slice(0, 10) + '…' + grant.address.slice(-6),
              `${grant.amountAeko} AEKO`,
              grant.source,
              <span key={grant.signature} className={grant.confirmed ? 'text-emerald-300' : 'text-yellow-300'}>{grant.confirmed ? 'confirmed' : 'submitted'}</span>,
              grant.signature.slice(0, 16) + '…',
            ])}
            empty="No grants have been released yet"
          />
        </section>
      ) : null}
    </div>
  )
}
