const TELEMETRY_ENDPOINT = '/api/telemetry/client';
const MAX_MESSAGE = 1200;
const MAX_STACK = 6000;
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 20;

let windowStartedAt = Date.now();
let sentInWindow = 0;

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function currentPath() {
  return typeof globalThis.location?.pathname === 'string'
    ? truncate(globalThis.location.pathname, 512)
    : '';
}

function allowEvent() {
  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= MAX_EVENTS_PER_WINDOW) return false;
  sentInWindow += 1;
  return true;
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: truncate(error.name || 'Error', 120),
      message: truncate(error.message || 'Unknown client error', MAX_MESSAGE),
      stack: truncate(error.stack || '', MAX_STACK),
    };
  }
  return {
    name: 'Error',
    message: truncate(error ?? 'Unknown client error', MAX_MESSAGE),
    stack: '',
  };
}

export function reportClientError(error, context = {}) {
  if (!allowEvent()) return;

  const normalized = normalizeError(error);
  const payload = JSON.stringify({
    event: 'browser_error',
    level: 'error',
    path: currentPath(),
    error: normalized,
    context: {
      source: truncate(context.source || 'browser', 120),
      componentStack: truncate(context.componentStack || '', MAX_STACK),
    },
  });

  try {
    if (typeof navigator?.sendBeacon === 'function') {
      const body = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(TELEMETRY_ENDPOINT, body)) return;
    }
  } catch {
    // Telemetry must never create another application failure.
  }

  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin',
    });
  } catch {
    // Best-effort only. Do not recurse into the logger on transport failure.
  }
}

export function installGlobalErrorLogging() {
  const onError = (event) => {
    reportClientError(event.error || event.message, { source: 'window.error' });
  };
  const onUnhandledRejection = (event) => {
    reportClientError(event.reason, { source: 'unhandledrejection' });
  };

  globalThis.addEventListener?.('error', onError);
  globalThis.addEventListener?.('unhandledrejection', onUnhandledRejection);

  return () => {
    globalThis.removeEventListener?.('error', onError);
    globalThis.removeEventListener?.('unhandledrejection', onUnhandledRejection);
  };
}
