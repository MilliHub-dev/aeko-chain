'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error?.message ?? 'Sign-in failed')
        return
      }
      const next = params.get('next')
      router.replace(next && next.startsWith('/') ? next : '/')
      router.refresh()
    } catch {
      setError('Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Operator password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          className="w-full bg-[#0d0e16] border border-[#1e2135] rounded-lg px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button
        type="submit"
        disabled={busy || !password}
        className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold text-sm transition-colors"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="text-emerald-400 font-bold text-xl tracking-wide">AEKO Operations</div>
          <div className="text-gray-500 text-sm mt-1">Chain monitoring and funding administration</div>
        </div>
        <div className="bg-[#12141f] border border-[#1e2135] rounded-xl p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <div className="text-xs text-gray-600">
          Looking for test AEKO? Use the <Link href="/funding" className="text-emerald-400 hover:underline">public funding portal</Link>.
        </div>
      </div>
    </div>
  )
}
