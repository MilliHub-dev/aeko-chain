'use client'
import { useCallback, useEffect, useState } from 'react'
import DataTable from '@/components/data-table'
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

const inputClass =
  'w-full bg-[#0d0e16] border border-[#1e2135] rounded-lg px-3 py-2 text-sm mono text-gray-100 focus:outline-none focus:border-emerald-500 transition-colors'

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

  const refresh = useCallback(async () => {
    const [s, g, r] = await Promise.all([
      fetch('/api/admin/funding/settings').then((response) => response.json()),
      fetch('/api/admin/funding/grants?limit=100').then((response) => response.json()),
      fetch('/api/admin/funding/requests?limit=100').then((response) => response.json()),
    ])
    if (s.data) {
      setSettings(s.data.settings)
      setDraft(s.data.settings)
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
    setNotice({ ok: true, text: 'Policy saved' })
    refresh()
  }

  async function toggleEnabled() {
    if (!settings) return
    const res = await fetch('/api/admin/funding/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !settings.enabled }),
    })
    if (res.ok) refresh()
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
          ? `Approved and released ${json.data.amountAeko} AEKO to ${json.data.address}`
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
    refresh()
  }

  const field = (key: keyof Settings, label: string, step = '1') =>
    draft && (
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</label>
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Funding grants</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Public funding requests wait here for operator approval. Releasing an approved request performs the protected low-level <span className="mono">requestAirdrop</span>; manual grants remain a separate operator tool.
          </p>
        </div>
        {settings && (
          <button
            onClick={toggleEnabled}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              settings.enabled ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-emerald-500 text-black hover:bg-emerald-400'
            }`}
          >
            {settings.enabled ? 'Pause funding' : 'Resume funding'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Status" value={settings ? (settings.enabled ? 'Open' : 'Paused') : '—'} accent={settings?.enabled} />
        <StatCard label="Per request" value={settings ? `${settings.amountAeko} AEKO` : '—'} />
        <StatCard label="Left today" value={remaining !== null ? `${remaining.toLocaleString()} AEKO` : '—'} sub={settings ? `of ${settings.dailyBudgetAeko.toLocaleString()}` : undefined} />
        <StatCard label="Pending requests" value={pendingRequests.length} />
        <StatCard label="Grants kept" value={grants.length} />
      </div>

      {notice && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${notice.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Pending funding requests</h2>
            <p className="text-xs text-gray-600 mt-1">Approve to release the requested policy amount, or reject without sending funds.</p>
          </div>
        </div>
        <DataTable
          columns={['Requested', 'Address', 'Amount', 'Status', 'Decision']}
          rows={pendingRequests.map((request) => [
            new Date(request.requestedAt).toLocaleString(),
            request.address.slice(0, 10) + '…' + request.address.slice(-6),
            `${request.amountAeko} AEKO`,
            <span key={`${request.id}-status`} className={request.status === 'processing' ? 'text-yellow-400' : 'text-emerald-400'}>{request.status}</span>,
            <div key={request.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => decideRequest(request.id, 'approve')}
                disabled={Boolean(requestBusy)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-semibold disabled:opacity-40"
              >
                {requestBusy === request.id ? 'Working…' : 'Approve & release'}
              </button>
              <button
                type="button"
                onClick={() => decideRequest(request.id, 'reject')}
                disabled={Boolean(requestBusy) || request.status === 'processing'}
                className="px-3 py-1.5 rounded-lg border border-[#1e2135] text-gray-400 text-xs hover:text-white disabled:opacity-40"
              >
                Reject
              </button>
            </div>,
          ])}
          empty="No pending funding requests"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={saveSettings} className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Public policy</h2>
          <div className="grid grid-cols-2 gap-4">
            {field('amountAeko', 'Amount per request (AEKO)', '0.1')}
            {field('cooldownHours', 'Cooldown per wallet (hours)')}
            {field('dailyBudgetAeko', 'Daily budget (AEKO)')}
            {field('maxManualGrantAeko', 'Max manual grant (AEKO)')}
          </div>
          <button type="submit" disabled={busy || !draft} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold text-sm">
            Save policy
          </button>
        </form>

        <form onSubmit={manualGrant} className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Manual grant</h2>
          <p className="text-xs text-gray-600">Skips cooldown and budget. Capped by “max manual grant” and by the private Faucet Daemon&apos;s per-request cap.</p>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Recipient address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Base58 wallet address…" required className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Amount (AEKO)</label>
            <div className="flex gap-2">
              <input type="number" min="0.001" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} required className={`${inputClass} w-40`} />
              {[1, 10, 50].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className="px-3 text-xs rounded-lg border border-[#1e2135] text-gray-400 hover:text-white hover:border-emerald-500">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={busy || !address} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold text-sm">
            {busy ? 'Sending…' : 'Send AEKO'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent grants</h2>
        <DataTable
          columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
          rows={grants.map((g) => [
            new Date(g.at).toLocaleString(),
            g.address.slice(0, 10) + '…' + g.address.slice(-6),
            `${g.amountAeko} AEKO`,
            g.source,
            <span key={g.signature} className={g.confirmed ? 'text-emerald-400' : 'text-yellow-400'}>{g.confirmed ? 'confirmed' : 'submitted'}</span>,
            g.signature.slice(0, 16) + '…',
          ])}
          empty="No grants yet"
        />
      </div>
    </div>
  )
}
