'use client'

type AlertTone = 'error' | 'warning' | 'info' | 'success'

const PALETTE: Record<AlertTone, string> = {
  error: 'border-red-400/30 bg-red-500/10 text-red-100',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
}

export default function FeedbackAlert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: AlertTone
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${PALETTE[tone]}`}
    >
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="mt-1 break-words text-xs leading-5 opacity-80">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
