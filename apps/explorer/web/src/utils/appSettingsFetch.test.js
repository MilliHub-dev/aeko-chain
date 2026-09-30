import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function loadAppSettings(runtime) {
  globalThis.__AEKO_RUNTIME_CONFIG__ = runtime;
  delete globalThis.__AEKO_DEV_RUNTIME_CONFIG__;
  const mod = await import(`./appSettings.js?fetch-test=${Math.random()}`);
  return mod;
}

const TESTNET = {
  rpcUrl: 'https://rpc.example.invalid',
  websocketUrl: 'wss://ws.example.invalid',
  explorerApiUrl: 'https://api.test.example.invalid',
  fundingUrl: 'https://fund.example.invalid',
};

test('settings fetch failure names the backend URL instead of a bare status', async () => {
  const { fetchPublicAppSettings } = await loadAppSettings({
    network: 'testnet',
    networks: { testnet: TESTNET },
    demo: {},
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    headers: { get: () => 'application/json' },
    json: async () => ({ error: { message: '' } }),
  });
  try {
    await assert.rejects(
      () => fetchPublicAppSettings(),
      (error) => {
        assert.match(error.message, /https:\/\/api\.test\.example\.invalid\/settings/);
        assert.match(error.message, /500/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings fetch network failure says the backend is unreachable', async () => {
  const { fetchPublicAppSettings } = await loadAppSettings({
    network: 'testnet',
    networks: { testnet: TESTNET },
    demo: {},
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    await assert.rejects(
      () => fetchPublicAppSettings(),
      /unreachable via https:\/\/api\.test\.example\.invalid\/settings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings provider delegates retry backoff and polling to TanStack Query', async () => {
  const provider = await source('components/AppSettingsProvider.jsx');
  assert.match(provider, /useQuery/);
  assert.match(provider, /retryDelay:/);
  assert.match(provider, /Math\.min\(RETRY_BASE_MS \* 2 \*\* attempt, RETRY_MAX_MS\)/);
  assert.match(provider, /refetchInterval:/);
  assert.match(provider, /settingsRefreshSeconds/);
  assert.match(provider, /placeholderData: SAFE_SNAPSHOT/);
  assert.match(provider, /settingsQuery\.data \?\? SAFE_SNAPSHOT/);
  assert.doesNotMatch(provider, /setInterval|setTimeout|consecutiveFailures|nextAllowedAttempt/);
});
