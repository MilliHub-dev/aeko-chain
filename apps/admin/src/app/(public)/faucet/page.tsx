'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Policy = {
  enabled: boolean
  amountAeko: number
  cooldownHours: number
  dailyBudgetAeko: number
  dailyRemainingAeko: number
  explorerUrl: string
}

type Result =
  | { kind: 'ok'; signature: string; amountAeko: number; confirmed: boolean; explorerUrl: string }
  | { kind: 'error'; message: string }

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export default function PublicFaucetPage() {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    fetch('/api/faucet/policy')
      .then((r) => r.json())
      .then((j) => setPolicy(j.data ?? null))
      .catch(() => setPolicy(null))
  }, [])

  const valid = ADDRESS_RE.test(address.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/faucet/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ kind: 'error', message: json.error?.message ?? 'Request failed' })
      } else {
        setResult({ kind: 'ok', ...json.data })
        setPolicy((p) => (p ? { ...p, dailyRemainingAeko: Math.max(0, p.dailyRemainingAeko - json.data.amountAeko) } : p))
      }
    } catch {
      setResult({ kind: 'error', message: 'Could not reach the faucet. Try again in a moment.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#1e2135] bg-[#0a0b12] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-emerald-400 font-bold text-lg tracking-wide">AEKO Chain</div>
          <div className="text-gray-500 text-xs">Testnet faucet</div>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {policy && (
            <a href={policy.explorerUrl} className="text-gray-400 hover:text-white" target="_blank" rel="noreferrer">
              Explorer
            </a>
          )}
          <Link href="/login" className="text-gray-500 hover:text-white">
            Operator sign-in
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-xl space-y-6 mt-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Get test AEKO</h1>
            <p className="text-gray-500 text-sm mt-1">
              Testnet tokens for trying Aeko. They have no monetary value and the chain may be reset.
            </p>
          </div>

          <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6 space-y-5">
            {policy && !policy.enabled && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">
                The faucet is paused right now. Check back later.
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Your AEKO wallet address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Base58 address from the Aeko app → Wallet → Receive"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full bg-[#0d0e16] border border-[#1e2135] rounded-lg px-4 py-3 text-sm mono text-gray-100 placeholder-gray-700 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {address && !valid && <div className="text-red-400 text-xs mt-1">That doesn&apos;t look like an AEKO address.</div>}
              </div>

              <button
                type="submit"
                disabled={busy || !valid || !policy || !policy.enabled}
                className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold transition-colors text-sm"
              >
                {busy ? 'Sending…' : policy ? `Send me ${policy.amountAeko} AEKO` : 'Loading…'}
              </button>
            </form>

            {result?.kind === 'ok' && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-1">
                <div className="text-emerald-400 text-sm font-semibold">
                  {result.confirmed ? `✓ ${result.amountAeko} AEKO sent` : `${result.amountAeko} AEKO submitted — confirming…`}
                </div>
                <div className="text-gray-500 text-xs">Transaction</div>
                <div className="mono text-xs text-gray-300 break-all">{result.signature}</div>
                <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-emerald-400 hover:underline mt-1">
                  View wallet on the explorer →
                </a>
              </div>
            )}
            {result?.kind === 'error' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">{result.message}</div>
            )}
          </div>

          {policy && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Per request</div>
                <div className="text-emerald-400 font-semibold mt-1">{policy.amountAeko} AEKO</div>
              </div>
              <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Per wallet</div>
                <div className="text-white font-semibold mt-1">every {policy.cooldownHours} h</div>
              </div>
              <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Left today</div>
                <div className="text-white font-semibold mt-1">{policy.dailyRemainingAeko.toLocaleString()} AEKO</div>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600">
            In the Aeko app the same faucet is available from Wallet → “Get test AEKO”.
          </p>
        </div>
      </main>
    </div>
  )
}
