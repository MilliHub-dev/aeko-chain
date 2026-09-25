import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPublicAppSettings, normalizeAppSettingsPayload, SAFE_APP_SETTINGS } from '../utils/appSettings';
import { AppSettingsContext } from './AppSettingsContext';

const SAFE_SNAPSHOT = normalizeAppSettingsPayload({ revision: 0, application: SAFE_APP_SETTINGS });

// Backoff for a dead/unreachable Explorer backend: the provider already keeps
// serving the last-good (or safe-default) snapshot on failure, so hammering
// /settings on every tick only fills the console with identical 500s.
const FAILURE_BACKOFF_BASE_MS = 5_000;
const FAILURE_BACKOFF_MAX_MS = 5 * 60_000;

export function AppSettingsProvider({ children }) {
  const [snapshot, setSnapshot] = useState(SAFE_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const consecutiveFailures = useRef(0);
  const nextAllowedAttempt = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() < nextAllowedAttempt.current) return;
    try {
      const next = await fetchPublicAppSettings();
      consecutiveFailures.current = 0;
      nextAllowedAttempt.current = 0;
      setSnapshot(next);
      setError('');
    } catch (err) {
      consecutiveFailures.current += 1;
      const delay = Math.min(
        FAILURE_BACKOFF_BASE_MS * 2 ** (consecutiveFailures.current - 1),
        FAILURE_BACKOFF_MAX_MS,
      );
      nextAllowedAttempt.current = Date.now() + delay;
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
