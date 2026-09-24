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
  const activeItem = items.find((item) => item.value === value)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div
          role="group"
          aria-label={label}
          className="inline-flex min-w-max gap-1 rounded-xl border border-[#1e2135] bg-[#0a0b12] p-1"
        >
          {items.map((item) => {
            const active = item.value === value
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.value)}
                className={
                  'inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ' +
                  (active
                    ? 'bg-[#171a29] text-white shadow-sm'
                    : 'text-gray-500 hover:bg-white/[0.035] hover:text-gray-300')
                }
              >
                <span>{item.label}</span>
                {typeof item.count === 'number' ? (
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[10px] tabular-nums ' +
                      (active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-gray-500')
                    }
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      {activeItem?.description ? (
        <p className="px-1 text-xs leading-5 text-gray-600">{activeItem.description}</p>
      ) : null}
    </div>
  )
}
