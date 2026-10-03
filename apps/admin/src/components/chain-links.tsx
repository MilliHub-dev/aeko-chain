'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

function compact(value: string, start: number, end: number) {
  if (value.length <= start + end + 1) return value
  return value.slice(0, start) + '…' + value.slice(-end)
}

type ChainLinkProps = {
  className?: string
  label?: ReactNode
}

export function TransactionLink({
  signature,
  className = '',
  label,
}: ChainLinkProps & { signature: string }) {
  return (
    <Link
      href={`/transactions/${encodeURIComponent(signature)}`}
      title={signature}
      className={`font-mono text-emerald-300 transition-colors hover:text-emerald-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${className}`}
    >
      {label ?? compact(signature, 14, 6)}
    </Link>
  )
}

export function AccountLink({
  address,
  className = '',
  label,
}: ChainLinkProps & { address: string }) {
  return (
    <Link
      href={`/accounts/${encodeURIComponent(address)}`}
      title={address}
      className={`font-mono text-sky-300 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${className}`}
    >
      {label ?? compact(address, 10, 6)}
    </Link>
  )
}
