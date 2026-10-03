'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-telemetry'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError(error, 'next.error_boundary')
  }, [error])

  return (
    <main className="flex min-h-dvh items-center bg-[#0d0e16] px-4 py-10 text-gray-100 sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-semibold">Operations Web hit an unexpected error</h1>
        <p className="mt-3 text-sm text-gray-400">
          The failure has been recorded. Retry this screen, and check the deployment logs if it continues.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={reset}
        >
          Retry
        </button>
      </div>
    </main>
  )
}
