import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('production runtime configuration is deployment-fresh and public Scan stays Mainnet/Testnet-only', async () => {
  const server = await source('../../../../docker/explorer-ui-server.mjs');
  const compose = await source('../compose.coolify.yml');
  const env = await source('../.env.coolify.example');
  const toggle = await source('components/NetworkToggle.jsx');

  assert.match(server, /RUNTIME_CONFIG_PATH/);
  assert.match(server, /no-store, max-age=0/);
  assert.match(toggle, /PUBLIC_NETWORK_ORDER = \['mainnet', 'testnet'\]/);

  for (const name of [
    'AEKO_MAINNET_RPC_URL',
    'AEKO_MAINNET_WS_URL',
    'AEKO_MAINNET_EXPLORER_API_URL',
    'AEKO_TESTNET_RPC_URL',
    'AEKO_TESTNET_WS_URL',
    'AEKO_TESTNET_EXPLORER_API_URL',
  ]) {
    assert.match(compose, new RegExp(name));
    assert.match(env, new RegExp('^' + name + '=', 'm'));
  }

  for (const name of [
    'AEKO_DEVNET_RPC_URL',
    'AEKO_DEVNET_WS_URL',
    'AEKO_DEVNET_EXPLORER_API_URL',
    'AEKO_LOCALNET_RPC_URL',
    'AEKO_LOCALNET_WS_URL',
    'AEKO_LOCALNET_EXPLORER_API_URL',
    'AEKO_DEMO_RPC_URL',
  ]) {
    assert.doesNotMatch(compose, new RegExp(name));
    assert.doesNotMatch(env, new RegExp('^' + name + '=', 'm'));
  }
});

test('network tools link to Aeko Scan and keep funding implementation details private', async () => {
  const config = await source('utils/networkConfig.js');
  const panel = await source('components/NetworkToolsPanel.jsx');
  const tools = await source('pages/NetworkTools.jsx');

  assert.match(config, /browserOrigin \? `\$\{browserOrigin\}\/explorer` : '\/explorer'/);
  assert.doesNotMatch(config, /funding through the selected Explorer API/);
  assert.doesNotMatch(panel, /href=\{config\.fundingUrl\}/);
  assert.match(panel, /Available on this page/);
  assert.match(tools, /isTestNetwork && config\.fundingEnabled/);
});

test('unimplemented Bridge fails closed instead of exposing the Phase 7 prototype', async () => {
  const app = await source('App.jsx');
  const layout = await source('components/Layout.jsx');
  const settings = await source('utils/appSettings.js');

  assert.doesNotMatch(app, /import Bridge from/);
  assert.match(app, /path="\/bridge"[\s\S]*Navigate to="\/explorer"/);
  assert.doesNotMatch(layout, /to="\/bridge"/);
  assert.match(settings, /bridgeEnabled: false/);
});

test('Operations Web and bootstrap expose health that reflects the split deployment lifecycle', async () => {
  const middleware = await source('../../../admin/src/middleware.ts');
  const adminCompose = await source('../../../admin/compose.coolify.yml');
  const adminHealth = await source('../../../admin/src/app/healthz/route.ts');
  const bootstrap = await source('../../../../docker/coolify/bootstrap/compose.yml');

  assert.match(middleware, /'\/healthz'/);
  assert.match(adminCompose, /127\.0\.0\.1:3001\/healthz/);
  assert.match(adminHealth, /aeko-operations-web/);
  assert.match(bootstrap, /social\/\.aeko-chain-binding/);
  assert.match(bootstrap, /protocol\/\.aeko-chain-binding/);
});
