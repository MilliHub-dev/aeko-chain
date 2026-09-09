import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRpcExplorerAlignment } from './networkIdentity.js';

function response(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('write guard accepts RPC and Explorer bound to the same genesis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      return response({ jsonrpc: '2.0', id: 1, result: 'same-genesis' });
    }
    assert.equal(url, 'https://api.example.invalid/');
    return response({
      data: { ok: true, network: 'testnet', genesisHash: 'same-genesis' },
    });
  };

  try {
    const identity = await assertRpcExplorerAlignment({
      rpcUrl: 'https://rpc.example.invalid',
      explorerApiUrl: 'https://api.example.invalid',
    });
    assert.equal(identity.rpcGenesisHash, 'same-genesis');
    assert.equal(identity.network, 'testnet');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('write guard refuses split-brain RPC and Explorer endpoints', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      return response({ jsonrpc: '2.0', id: 1, result: 'local-genesis' });
    }
    return response({
      data: { ok: true, network: 'testnet', genesisHash: 'live-genesis' },
    });
  };

  try {
    await assert.rejects(
      () =>
        assertRpcExplorerAlignment({
          rpcUrl: 'http://127.0.0.1:8899',
          explorerApiUrl: 'https://api.aeko.online',
        }),
      /Refusing to sign or submit a transaction across different AEKO networks/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
