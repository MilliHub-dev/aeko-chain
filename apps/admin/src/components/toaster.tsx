'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type ToastKind = 'success' | 'error' | 'info'

type ToastInput = {
  id?: string
  kind?: ToastKind
  title?: string
  message: string
  duration?: number | null
}

type ToastRecord = Required<Pick<ToastInput, 'id' | 'kind' | 'message'>> &
  Pick<ToastInput, 'title' | 'duration'>

type ToasterApi = {
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  success: (message: string, options?: Omit<ToastInput, 'kind' | 'message'>) => string
  error: (message: string, options?: Omit<ToastInput, 'kind' | 'message'>) => string
  info: (message: string, options?: Omit<ToastInput, 'kind' | 'message'>) => string
}

const ToasterContext = createContext<ToasterApi | null>(null)
const DEFAULT_DURATION: Record<ToastKind, number | null> = {
  success: 5000,
  info: 4500,
  error: null,
}

let toastCounter = 0

function nextToastId() {
  toastCounter += 1
  return `toast-${Date.now()}-${toastCounter}`
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((input: ToastInput) => {
    const id = input.id ?? nextToastId()
    const kind = input.kind ?? 'info'
    const nextToast: ToastRecord = {
      id,
      kind,
      title: input.title,
      message: input.message,
      duration: input.duration === undefined ? DEFAULT_DURATION[kind] : input.duration,
    }

    setToasts((current) => {
      const duplicate = current.find(
        (toast) =>
          toast.kind === nextToast.kind &&
          toast.title === nextToast.title &&
          toast.message === nextToast.message,
      )
      if (duplicate) return current

      const next = [...current, nextToast]
      return next.length > 5 ? next.slice(next.length - 5) : next
    })

    return id
  }, [])

  const success = useCallback(
    (message: string, options: Omit<ToastInput, 'kind' | 'message'> = {}) =>
      push({ ...options, kind: 'success', message }),
    [push],
  )
  const error = useCallback(
    (message: string, options: Omit<ToastInput, 'kind' | 'message'> = {}) =>
      push({ ...options, kind: 'error', message }),
    [push],
  )
  const info = useCallback(
    (message: string, options: Omit<ToastInput, 'kind' | 'message'> = {}) =>
      push({ ...options, kind: 'info', message }),
    [push],
  )

  const api = useMemo(
    () => ({ push, dismiss, success, error, info }),
    [dismiss, error, info, push, success],
  )

  return (
    <ToasterContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-[380px]"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToasterContext.Provider>
  )
}

export function useToaster() {
  const context = useContext(ToasterContext)
  if (!context) {
    throw new Error('useToaster must be used within <ToasterProvider>')
  }
  return context
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastRecord
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!toast.duration) return undefined
    const timer = window.setTimeout(onDismiss, toast.duration)
    return () => window.clearTimeout(timer)
  }, [onDismiss, toast.duration])

  const palette =
    toast.kind === 'success'
      ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-50'
      : toast.kind === 'error'
        ? 'border-red-400/35 bg-red-500/15 text-red-50'
        : 'border-sky-400/35 bg-sky-500/15 text-sky-50'

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto overflow-hidden rounded-2xl border ${palette} shadow-2xl shadow-black/40 backdrop-blur-md`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className={
            'mt-1 size-2.5 shrink-0 rounded-full ' +
            (toast.kind === 'success'
              ? 'bg-emerald-300'
              : toast.kind === 'error'
                ? 'bg-red-300'
                : 'bg-sky-300')
          }
        />
        <div className="min-w-0 flex-1">
          {toast.title ? <div className="text-sm font-semibold">{toast.title}</div> : null}
          <div className="mt-0.5 break-words text-sm leading-5 text-gray-100">
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 shrink-0 rounded-lg border border-white/15 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
