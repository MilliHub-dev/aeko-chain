'use client'

type TabItem<T extends string> = {
  value: T
  label: string
  description?: string
  count?: number
}

export default function SectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="overflow-x-auto">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex min-w-full gap-1 rounded-xl border border-[#1e2135] bg-[#0a0b12] p-1 sm:min-w-0"
      >
        {items.map((item) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={
                'min-h-[44px] min-w-[150px] flex-1 rounded-lg px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ' +
                (active
                  ? 'bg-[#171a29] text-white shadow-sm'
                  : 'text-gray-500 hover:bg-white/[0.035] hover:text-gray-300')
              }
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{item.label}</span>
                {typeof item.count === 'number' ? (
                  <span className={
                    'rounded-full px-2 py-0.5 text-[10px] tabular-nums ' +
                    (active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-gray-500')
                  }>
                    {item.count}
                  </span>
                ) : null}
              </span>
              {item.description ? (
                <span className="mt-1 block whitespace-nowrap text-[11px] text-gray-600">{item.description}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
