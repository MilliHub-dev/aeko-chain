'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (!value) return

    if (BASE58.test(value) && value.length >= 32 && value.length <= 44) {
      setMessage('')
      setQuery('')
      router.push('/accounts/' + encodeURIComponent(value))
      return
    }

    if (BASE58.test(value) && value.length >= 64 && value.length <= 100) {
      setMessage('')
      setQuery('')
      router.push('/transactions/' + encodeURIComponent(value))
      return
    }

    setMessage('Enter a wallet/program address or a transaction signature.')
  }

  return (
    <div className="relative min-w-0 flex-1">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl">
        <label htmlFor="admin-global-search" className="sr-only">
          Search accounts or transactions
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
          <input
            id="admin-global-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (message) setMessage('')
            }}
            placeholder="Address or transaction signature"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(message)}
            aria-describedby={message ? 'admin-search-message' : undefined}
            className="h-11 w-full rounded-xl border border-[#252a3e] bg-[#0d0e16] pl-10 pr-3 text-sm text-gray-200 outline-none transition-colors placeholder:text-gray-700 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/15 mono"
          />
        </div>
      </form>
      {message ? (
        <div
          id="admin-search-message"
          role="status"
          className="absolute left-1/2 top-full z-50 mt-2 w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-amber-400/25 bg-[#17150d] px-3 py-2 text-xs text-amber-100 shadow-xl shadow-black/40"
        >
          {message}
        </div>
      ) : null}
    </div>
  )
}
