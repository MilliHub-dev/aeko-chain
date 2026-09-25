import assert from 'node:assert/strict';
import test from 'node:test';

async function load(runtime) {
  globalThis.__AEKO_RUNTIME_CONFIG__ = runtime;
  delete globalThis.__AEKO_DEV_RUNTIME_CONFIG__;
  return import(`./networkConfig.js?deploy-test=${Math.random()}`);
}

const TESTNET = {
  rpcUrl: 'https://rpc.example.invalid',
  websocketUrl: 'wss://ws.example.invalid',
  explorerApiUrl: '/api/explorer/testnet',
  fundingUrl: 'https://fund.example.invalid',
};
const MAINNET = {
  rpcUrl: 'https://main-rpc.example.invalid',
  websocketUrl: 'wss://main-ws.example.invalid',
  explorerApiUrl: '/api/explorer/mainnet',
};

test('local deploy exposes only localnet on loopback', async () => {
  const m = await load({ env: 'local', demo: {} });
  assert.equal(m.getDeployEnv(), 'local');
  assert.equal(m.getNetworkConfig('localnet').available, true);
  assert.equal(m.getNetworkConfig('localnet').rpcUrl, 'http://127.0.0.1:8899');
  assert.equal(m.getNetworkConfig('testnet').available, false);
  assert.equal(m.getNetworkConfig('mainnet').available, false);
  assert.equal(m.getDefaultExplorerNetwork(), 'localnet');
  assert.equal(m.getNetworkConfig().key, 'localnet');
  assert.equal(m.getTestNetwork(), 'localnet');
});

test('localnet env overrides hardcoded loopback in local deploys', async () => {
  const m = await load({
    env: 'local',
    localnet: {
      rpcUrl: 'http://192.168.1.50:8899',
      websocketUrl: 'ws://192.168.1.50:8900',
      explorerApiUrl: '/api/explorer/localnet',
      fundingUrl: '',
    },
    demo: {},
  });
  const local = m.getNetworkConfig('localnet');
  assert.equal(local.available, true);
  assert.equal(local.rpcUrl, 'http://192.168.1.50:8899');
  assert.equal(local.fromEnv, true);
});

test('production deploy exposes testnet plus mainnet with mainnet default', async () => {
  const m = await load({ env: 'production', testnet: TESTNET, mainnet: MAINNET, demo: {} });
  assert.equal(m.getDeployEnv(), 'production');
  assert.equal(m.getNetworkConfig('testnet').available, true);
  assert.equal(m.getNetworkConfig('mainnet').available, true);
  assert.equal(m.getNetworkConfig('localnet').available, false);
  assert.equal(m.getDefaultExplorerNetwork(), 'mainnet');
  assert.equal(m.getTestNetwork(), 'testnet');
});

test('production with testnet only defaults to testnet', async () => {
  const m = await load({ env: 'production', testnet: TESTNET, demo: {} });
  assert.equal(m.getDefaultExplorerNetwork(), 'testnet');
  assert.equal(m.resolveExplorerNetwork('mainnet'), 'testnet');
});

test('production keeps an explicitly configured localnet without changing defaults', async () => {
  const m = await load({
    env: 'production',
    testnet: TESTNET,
    mainnet: MAINNET,
    localnet: {
      rpcUrl: 'http://127.0.0.1:8899',
      websocketUrl: 'ws://127.0.0.1:8900',
      explorerApiUrl: '/api/explorer/localnet',
      fundingUrl: '',
    },
    demo: {},
  });
  assert.equal(m.getNetworkConfig('localnet').available, true);
  assert.equal(m.getDefaultExplorerNetwork(), 'mainnet');
});

test('testnet deploy exposes only testnet with configured endpoints', async () => {
  const m = await load({ env: 'testnet', testnet: TESTNET, mainnet: MAINNET, demo: {} });
  assert.equal(m.getDeployEnv(), 'testnet');
  assert.equal(m.getNetworkConfig('testnet').available, true);
  assert.equal(m.getNetworkConfig('testnet').rpcUrl, 'https://rpc.example.invalid');
  assert.equal(m.getNetworkConfig('mainnet').available, false);
  assert.equal(m.getNetworkConfig('localnet').available, false);
  assert.equal(m.getDefaultExplorerNetwork(), 'testnet');
  assert.equal(m.getTestNetwork(), 'testnet');
});

test('deploy env aliases normalize to local, testnet or production', async () => {
  for (const alias of ['development', 'dev', 'LOCAL']) {
    const m = await load({ env: alias, demo: {} });
    assert.equal(m.getDeployEnv(), 'local', alias);
  }
  for (const alias of ['prod', 'PRODUCTION']) {
    const m = await load({ env: alias, testnet: TESTNET, demo: {} });
    assert.equal(m.getDeployEnv(), 'production', alias);
    assert.equal(m.getDefaultExplorerNetwork(), 'testnet', alias);
  }
  {
    const m = await load({ env: 'TESTNET', testnet: TESTNET, demo: {} });
    assert.equal(m.getDeployEnv(), 'testnet');
    assert.equal(m.getDefaultExplorerNetwork(), 'testnet');
  }
});
