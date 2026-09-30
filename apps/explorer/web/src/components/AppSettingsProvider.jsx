import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchPublicAppSettings, normalizeAppSettingsPayload, SAFE_APP_SETTINGS } from '../utils/appSettings';
import { queryKeys } from '../queryKeys.js';
import { AppSettingsContext } from './AppSettingsContext';

const SAFE_SNAPSHOT = normalizeAppSettingsPayload({ revision: 0, application: SAFE_APP_SETTINGS });
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

export function AppSettingsProvider({ children }) {
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.public,
    queryFn: fetchPublicAppSettings,
    placeholderData: SAFE_SNAPSHOT,
    staleTime: 0,
    refetchInterval: (query) => {
      const seconds = query.state.data?.application?.settingsRefreshSeconds
        ?? SAFE_APP_SETTINGS.settingsRefreshSeconds;
      return seconds * 1000;
    },
    retryDelay: (attempt) => Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS),
  });

  const snapshot = settingsQuery.data ?? SAFE_SNAPSHOT;
  const loading = settingsQuery.isFetching && settingsQuery.dataUpdatedAt === 0;
  const error = settingsQuery.error instanceof Error ? settingsQuery.error.message : '';

  const value = useMemo(
    () => ({
      ...snapshot,
      settings: snapshot.application,
      loading,
      error,
      refresh: settingsQuery.refetch,
    }),
    [snapshot, loading, error, settingsQuery.refetch],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
