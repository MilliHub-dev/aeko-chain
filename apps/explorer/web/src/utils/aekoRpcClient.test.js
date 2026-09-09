import assert from 'node:assert/strict';
import test from 'node:test';
import { getFinalizedSlot, getGenesisHash } from './aekoRpcClient.js';

test('Explorer compatibility fallback requests a finalized validator slot', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, result: 987 }),
      text: async () => '',
    };
  };

  try {
    const slot = await getFinalizedSlot('https://rpc.example.invalid');
    assert.equal(slot, 987);
    assert.equal(requestBody.method, 'getSlot');
    assert.deepEqual(requestBody.params, [{ commitment: 'finalized' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chain identity reads the validator genesis hash', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, result: 'genesis-test-hash' }),
      text: async () => '',
    };
  };

  try {
    const genesisHash = await getGenesisHash('https://rpc.example.invalid');
    assert.equal(genesisHash, 'genesis-test-hash');
    assert.equal(requestBody.method, 'getGenesisHash');
    assert.deepEqual(requestBody.params, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
