import assert from 'node:assert/strict';
import test from 'node:test';

async function load(runtime) {
  globalThis.__AEKO_RUNTIME_CONFIG__ = runtime;
  delete globalThis.__AEKO_DEV_RUNTIME_CONFIG__;
  return import(`./networkConfig.js?deploy-test=${Math.random()}`);
}

const MAINNET = {
  rpcUrl: 'https://rpc.main.example.invalid',
  websocketUrl: 'wss://ws.main.example.invalid',
  explorerApiUrl: '/api/explorer/mainnet',
};
const TESTNET = {
  rpcUrl: 'https://rpc.test.example.invalid',
  websocketUrl: 'wss://ws.test.example.invalid',
  explorerApiUrl: '/api/explorer/testnet',
  fundingUrl: '/api/explorer/testnet',
};
const DEVNET = {
  rpcUrl: 'https://rpc.dev.example.invalid',
  websocketUrl: 'wss://ws.dev.example.invalid',
  explorerApiUrl: '/api/explorer/devnet',
  fundingUrl: '/api/explorer/devnet',
};

test('active network is the default while alternate deployments remain selectable', async () => {
  const m = await load({
    network: 'mainnet',
    networks: { mainnet: MAINNET, testnet: TESTNET, devnet: DEVNET },
    demo: {},
  });

  assert.equal(m.getActiveNetwork(), 'mainnet');
  assert.equal(m.getDefaultExplorerNetwork(), 'mainnet');
  assert.equal(m.getNetworkConfig('mainnet').available, true);
  assert.equal(m.getNetworkConfig('testnet').available, true);
  assert.equal(m.getNetworkConfig('devnet').available, true);
  assert.equal(m.getNetworkConfig('localnet').available, false);
  assert.equal(m.getTestNetwork(), 'testnet');
});

test('testnet deployment defaults to testnet without pretending other networks share its server', async () => {
  const m = await load({
    network: 'testnet',
    networks: { testnet: TESTNET },
    demo: {},
  });

  assert.equal(m.getActiveNetwork(), 'testnet');
  assert.equal(m.getDefaultExplorerNetwork(), 'testnet');
  assert.equal(m.getNetworkConfig('testnet').rpcUrl, TESTNET.rpcUrl);
  assert.equal(m.getNetworkConfig('mainnet').available, false);
  assert.equal(m.getNetworkConfig('devnet').available, false);
  assert.equal(m.getTestNetwork(), 'testnet');
});

test('devnet is a real independent network rather than a localnet/testnet alias', async () => {
  const m = await load({
    network: 'devnet',
    networks: { devnet: DEVNET, testnet: TESTNET },
    demo: {},
  });

  assert.equal(m.getActiveNetwork(), 'devnet');
  assert.equal(m.resolveExplorerNetwork('devnet'), 'devnet');
  assert.equal(m.getNetworkConfig('devnet').rpcUrl, DEVNET.rpcUrl);
  assert.equal(m.getDefaultExplorerNetwork(), 'devnet');
  assert.equal(m.getTestNetwork(), 'devnet');
});

test('local development retains loopback fallback when localnet is active', async () => {
  const m = await load({ network: 'localnet', networks: {}, demo: {} });

  assert.equal(m.getActiveNetwork(), 'localnet');
  assert.equal(m.getNetworkConfig('localnet').available, true);
  assert.equal(m.getNetworkConfig('localnet').rpcUrl, 'http://127.0.0.1:8899');
  assert.equal(m.getNetworkConfig('testnet').available, false);
  assert.equal(m.getDefaultExplorerNetwork(), 'localnet');
});

test('unknown requested selection falls back to the configured active network', async () => {
  const m = await load({
    network: 'mainnet',
    networks: { mainnet: MAINNET, testnet: TESTNET },
    demo: {},
  });

  assert.equal(m.resolveExplorerNetwork('unknown'), 'mainnet');
  assert.equal(m.resolveExplorerNetwork('devnet'), 'mainnet');
});

test('partial alternate network configuration fails closed', async () => {
  await assert.rejects(
    () => load({
      network: 'testnet',
      networks: {
        testnet: TESTNET,
        devnet: { rpcUrl: DEVNET.rpcUrl },
      },
      demo: {},
    }),
    /Devnet Scan configuration is partial/,
  );
});
