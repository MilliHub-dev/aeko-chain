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
  explorerApiUrl: '/api/explorer/testnet',
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
        assert.match(error.message, /\/api\/explorer\/testnet\/settings/);
        assert.match(error.message, /500/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings fetch network failure says the backend is unreachable', async () => {
  const { fetchPublicAppSettings } = await loadAppSettings({ testnet: TESTNET, demo: {} });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    await assert.rejects(
      () => fetchPublicAppSettings(),
      /unreachable via .*\/api\/explorer\/testnet\/settings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings provider backs off a dead backend instead of polling every tick', async () => {
  const provider = await source('components/AppSettingsProvider.jsx');
  assert.match(provider, /consecutiveFailures/);
  assert.match(provider, /nextAllowedAttempt/);
  assert.match(provider, /FAILURE_BACKOFF_MAX_MS/);
  // Last-good snapshot is preserved: setSnapshot only runs on success.
  assert.match(provider, /setSnapshot\(next\)/);
  assert.doesNotMatch(provider, /setSnapshot\(SAFE_/);
});
