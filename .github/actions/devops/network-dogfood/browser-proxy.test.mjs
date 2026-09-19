import assert from 'node:assert/strict';
import test from 'node:test';

import { DOGFOOD_ENDPOINTS, installDogfoodEndpointProxy, rewriteDogfoodUrl } from './browser-proxy.mjs';

test('rewrites the canonical public RPC origin to the local dogfood RPC', () => {
  assert.equal(
    rewriteDogfoodUrl('https://rpc.aeko.online/?cluster=testnet'),
    'http://127.0.0.1:8899/?cluster=testnet',
  );
});

test('rewrites Explorer API paths and query strings to the local dogfood API', () => {
  assert.equal(
    rewriteDogfoodUrl('https://api.aeko.online/social/status?live=true'),
    'http://127.0.0.1:8088/social/status?live=true',
  );
});

test('does not rewrite unrelated or lookalike origins', () => {
  assert.equal(
    rewriteDogfoodUrl('https://scan.aeko.online/network-tools/social-e2e'),
    'https://scan.aeko.online/network-tools/social-e2e',
  );
  assert.equal(
    rewriteDogfoodUrl('https://rpc.aeko.online.example.com/'),
    'https://rpc.aeko.online.example.com/',
  );
});

test('supports an explicit endpoint contract without changing matching semantics', () => {
  const endpoints = {
    ...DOGFOOD_ENDPOINTS,
    localRpcOrigin: 'http://localhost:18899',
    localApiOrigin: 'http://localhost:18088',
  };
  assert.equal(
    rewriteDogfoodUrl('https://rpc.aeko.online/path', endpoints),
    'http://localhost:18899/path',
  );
  assert.equal(
    rewriteDogfoodUrl('https://api.aeko.online/health', endpoints),
    'http://localhost:18088/health',
  );
});

test('installs proxy routes only for the two canonical public origins', async () => {
  const patterns = [];
  await installDogfoodEndpointProxy({
    async route(pattern, handler) {
      patterns.push(pattern);
      assert.equal(typeof handler, 'function');
    },
  });
  assert.deepEqual(patterns, [
    'https://rpc.aeko.online/**',
    'https://api.aeko.online/**',
  ]);
});
