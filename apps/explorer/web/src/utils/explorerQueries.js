import { useQuery } from '@tanstack/react-query';
import { getExplorerAvailability } from './explorerApi';
import { queryKeys } from '../queryKeys.js';

export function useExplorerResource(network, kind, id, queryFn) {
  const unavailable = !getExplorerAvailability(network);
  const query = useQuery({
    queryKey: queryKeys.explorer.resource(network, kind, id || ''),
    queryFn,
    enabled: !unavailable && Boolean(id),
  });

  return {
    unavailable,
    state: {
      loading: query.isLoading,
      fetching: query.isFetching,
      error: query.error instanceof Error ? query.error.message : '',
      data: query.data ?? null,
      refetch: query.refetch,
    },
  };
}
