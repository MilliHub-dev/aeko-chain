'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

function shouldRetryQuery(failureCount: number, error: unknown) {
  const candidate = error as { status?: number; response?: { status?: number } } | null
  const status = Number(candidate?.status ?? candidate?.response?.status ?? 0)
  if (status >= 400 && status < 500) return false
  return failureCount < 2
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            gcTime: 5 * 60_000,
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            retry: shouldRetryQuery,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
