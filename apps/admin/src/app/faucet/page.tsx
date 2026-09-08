'use client'
import { useState } from 'react'

type Drop = { address: string; amount: number; sig: string; ts: number }

export default function FaucetPage() {
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('1')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Drop[]>([])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    const lamports = Math.floor(parseFloat(amount) * 1_000_000_000)
    if (isNaN(lamports) || lamports <= 0) {
      setStatus('error')
      setMessage('Invalid amount')
      return
    }

    try {
      const res = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'requestAirdrop', params: [address, lamports] }),
      })
      const json = await res.json()

      if (json.error) {
        setStatus('error')
        setMessage(json.error.message)
        return
      }

      const sig: string = json.result
      setStatus('ok')
      setMessage(sig)
      setHistory(prev => [{ address, amount: parseFloat(amount), sig, ts: Date.now() }, ...prev.slice(0, 19)])
      setAddress('')
    } catch (err: unknown) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Request failed')
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Faucet</h1>
        <p className="text-gray-500 text-sm mt-0.5">Send testnet AEKO to any wallet address</p>
      </div>

      <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6 space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
              Recipient Address
            </label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Base58 wallet address…"
              required
              className="w-full bg-[#0d0e16] border border-[#1e2135] rounded-lg px-4 py-3 text-sm mono text-gray-100 placeholder-gray-700 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
              Amount (AEKO) — max 10
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0.001"
                max="10"
                step="0.001"
                required
                className="w-40 bg-[#0d0e16] border border-[#1e2135] rounded-lg px-4 py-3 text-sm mono text-gray-100 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <div className="flex gap-1.5">
                {[1, 5, 10].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className="px-3 py-3 text-xs rounded-lg border border-[#1e2135] text-gray-400 hover:text-white hover:border-emerald-500 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={status === 'loading' || !address}
            className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold transition-colors text-sm"
          >
            {status === 'loading' ? 'Sending…' : 'Send AEKO'}
          </button>
        </form>

        {/* Result */}
        {status === 'ok' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <div className="text-emerald-400 text-xs font-semibold mb-1">✓ Airdrop sent!</div>
            <div className="text-gray-400 text-xs">Transaction signature:</div>
            <div className="mono text-xs text-gray-300 break-all mt-1">{message}</div>
          </div>
        )}
        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="text-red-400 text-xs font-semibold mb-1">✗ Failed</div>
            <div className="mono text-xs text-gray-300">{message}</div>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Airdrops</h2>
          <div className="space-y-2">
            {history.map((drop, i) => (
              <div key={i} className="bg-[#12141f] border border-[#1e2135] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="mono text-xs text-gray-300">{drop.address.slice(0, 16)}…</div>
                  <div className="text-xs text-gray-600 mono">{drop.sig.slice(0, 20)}…</div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 text-sm font-semibold">{drop.amount} AEKO</div>
                  <div className="text-gray-600 text-xs">{new Date(drop.ts).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
