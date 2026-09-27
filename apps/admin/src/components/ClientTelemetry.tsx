'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-telemetry'

export default function ClientTelemetry() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, 'window.error')
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, 'unhandledrejection')
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
