'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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
        <label htmlFor="operator-password" className="mb-1.5 block text-xs uppercase tracking-wider text-gray-500">Operator password</label>
        <input
          id="operator-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          className="min-h-11 w-full rounded-xl border border-[#252a3e] bg-[#0d0e16] px-4 py-3 text-base text-gray-100 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 sm:text-sm"
        />
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
      <button
        type="submit"
        disabled={busy || !password}
        className="min-h-11 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:p-6">
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
      </div>
    </div>
  )
}
