import assert from 'node:assert/strict';
import test from 'node:test';

import { AekoConnection } from '../dist/index.js';

test('protected funding RPC uses requestFunding, including the legacy alias', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const request = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: request.id, result: 'funding-signature' }),
    };
  };
  const client = new AekoConnection('http://rpc.local', { fetchImpl });

  assert.equal(
    await client.requestFundingTransfer('wallet', 42, 'server-secret', 'blockhash'),
    'funding-signature',
  );
  assert.equal(await client.requestGrant('wallet', 42, 'server-secret', 'blockhash'), 'funding-signature');

  for (const call of calls) {
    const request = JSON.parse(call.init.body);
    assert.equal(request.method, 'requestFunding');
    assert.equal(request.params[0], 'wallet');
    assert.equal(request.params[1], 42);
    assert.equal(request.params[2].fundingAuthorization, 'server-secret');
    assert.equal(request.params[2].recentBlockhash, 'blockhash');
  }
});

test('direct Admin Funding uses /admin/funding/send, including the legacy alias', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ data: { id: 'funding-1', status: 'submitted' } }),
    };
  };
  const client = new AekoConnection('http://rpc.local', { fetchImpl });
  const options = {
    explorerApiUrl: 'https://api.aeko.test/',
    adminToken: 'admin-token',
    fetchImpl,
  };

  await client.sendFunding('wallet', 2, options);
  await client.createGrant('wallet', 2, options);

  for (const call of calls) {
    assert.equal(call.url, 'https://api.aeko.test/admin/funding/send');
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers['x-aeko-settings-token'], 'admin-token');
    assert.deepEqual(JSON.parse(call.init.body), { address: 'wallet', amountAeko: 2 });
  }
});
