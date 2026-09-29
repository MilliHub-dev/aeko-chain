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

test('public runtime exposes only independently configured Mainnet and Testnet', async () => {
  const m = await load({
    network: 'mainnet',
    networks: { mainnet: MAINNET, testnet: TESTNET },
  });

  assert.equal(m.getActiveNetwork(), 'mainnet');
  assert.equal(m.getDefaultExplorerNetwork(), 'mainnet');
  assert.equal(m.getNetworkConfig('mainnet').available, true);
  assert.equal(m.getNetworkConfig('testnet').available, true);
  assert.equal(m.getNetworkConfig('devnet').key, 'mainnet');
  assert.equal(m.getNetworkConfig('localnet').key, 'mainnet');
  assert.equal(m.getTestNetwork(), 'testnet');
});

test('Testnet funding follows the selected Testnet Explorer boundary', async () => {
  const m = await load({ network: 'testnet', networks: { testnet: TESTNET } });
  const testnet = m.getNetworkConfig('testnet');

  assert.equal(m.getActiveNetwork(), 'testnet');
  assert.equal(testnet.explorerApiUrl, '/api/explorer/testnet');
  assert.equal(testnet.fundingUrl, '/api/explorer/testnet');
  assert.equal(testnet.fundingEnabled, true);
  assert.match(testnet.explorerUrl, /\/explorer$/);
});

test('Mainnet funding follows the selected Mainnet Explorer boundary', async () => {
  const m = await load({
    network: 'mainnet',
    networks: {
      mainnet: { ...MAINNET, fundingUrl: '/api/explorer/mainnet' },
      testnet: TESTNET,
    },
  });
  const mainnet = m.getNetworkConfig('mainnet');

  assert.equal(m.getActiveNetwork(), 'mainnet');
  assert.equal(mainnet.explorerApiUrl, '/api/explorer/mainnet');
  assert.equal(mainnet.fundingUrl, '/api/explorer/mainnet');
  assert.equal(mainnet.fundingEnabled, true);
});

test('public presentation uses Mainnet and Testnet terminology', async () => {
  const m = await load({
    network: 'testnet',
    networks: { mainnet: MAINNET, testnet: TESTNET },
  });

  assert.equal(m.getNetworkPresentation('mainnet').name, 'Mainnet');
  assert.equal(m.getNetworkPresentation('testnet').name, 'Testnet');
  assert.match(m.getNetworkPresentation('mainnet').stateLabel, /production/i);
  assert.match(m.getNetworkPresentation('testnet').stateLabel, /public test/i);
});

test('unknown and development-only selections fall back to the configured public network', async () => {
  const m = await load({
    network: 'mainnet',
    networks: { mainnet: MAINNET, testnet: TESTNET },
  });

  assert.equal(m.resolveExplorerNetwork('devnet'), 'mainnet');
  assert.equal(m.resolveExplorerNetwork('localnet'), 'mainnet');
  assert.equal(m.resolveExplorerNetwork('unknown'), 'mainnet');
});

test('partial alternate public network configuration fails closed', async () => {
  await assert.rejects(
    () => load({
      network: 'testnet',
      networks: {
        testnet: TESTNET,
        mainnet: { rpcUrl: MAINNET.rpcUrl },
      },
    }),
    /Mainnet Scan configuration is partial/,
  );
});
