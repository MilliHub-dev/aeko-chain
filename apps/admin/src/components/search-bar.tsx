'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    // Base58 address length is 32–44 chars — treat as account lookup
    if (q.length >= 32 && q.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q)) {
      router.push(`/accounts/${q}`)
    }
    // Otherwise search
    setQuery('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-md">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search address…"
        className="w-full bg-[#0d0e16] border border-[#1e2135] rounded-lg px-4 py-2 text-sm mono text-gray-200 placeholder-gray-700 focus:outline-none focus:border-emerald-500 transition-colors"
      />
    </form>
  )
}
