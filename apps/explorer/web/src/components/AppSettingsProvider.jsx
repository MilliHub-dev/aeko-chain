import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPublicAppSettings, normalizeAppSettingsPayload, SAFE_APP_SETTINGS } from '../utils/appSettings';

const SAFE_SNAPSHOT = normalizeAppSettingsPayload({ revision: 0, application: SAFE_APP_SETTINGS });

const AppSettingsContext = createContext({
  ...SAFE_SNAPSHOT,
  settings: SAFE_SNAPSHOT.application,
  loading: true,
  error: '',
  refresh: async () => {},
});

export function AppSettingsProvider({ children }) {
  const [snapshot, setSnapshot] = useState(SAFE_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPublicAppSettings();
      setSnapshot(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load application settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, snapshot.application.settingsRefreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [refresh, snapshot.application.settingsRefreshSeconds]);

  const value = useMemo(
    () => ({ ...snapshot, settings: snapshot.application, loading, error, refresh }),
    [snapshot, loading, error, refresh],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
