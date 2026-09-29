import { QueryClient } from '@tanstack/react-query';

export function shouldRetryQuery(failureCount, error) {
  const status = Number(error?.status);
  return failureCount < 2 && (!Number.isFinite(status) || status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: shouldRetryQuery,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
