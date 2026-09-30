import { QueryClient } from '@tanstack/react-query'

export function shouldRetryQuery(failureCount, error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0)
  if (status >= 400 && status < 500) return false
  return failureCount < 2
}

export const queryClient = new QueryClient({
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
})
