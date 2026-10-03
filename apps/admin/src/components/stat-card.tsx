import type { ReactNode } from 'react'

export default function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
}) {
  const primitiveValue = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined

  return (
    <div className="min-w-0 rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</div>
      <div
        title={primitiveValue}
        className={
          'min-w-0 break-words text-xl font-bold leading-tight sm:text-2xl mono ' +
          (accent ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 min-w-0 break-words text-xs leading-5 text-gray-500">{sub}</div> : null}
    </div>
  )
}
