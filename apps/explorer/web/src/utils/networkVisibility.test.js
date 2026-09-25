import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Mainnet hides every test surface regardless of API visibility flags:
// network console, NTF demo and the Social E2E lab must never render on
// mainnet, even when the backend enables them.

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('network selection is global across the UI', async () => {
  const context = await source('components/NetworkContext.js');
  const provider = await source('components/NetworkContext.jsx');
  const main = await source('main.jsx');

  assert.match(context, /NetworkContext/);
  assert.match(context, /useNetwork/);
  assert.match(provider, /NetworkProvider/);
  assert.match(provider, /aeko:selected-network/);
  assert.match(provider, /testSurfacesVisible/);
  assert.match(main, /NetworkProvider/);

  for (const page of [
    'pages/Explorer.jsx',
    'pages/BlockDetails.jsx',
    'pages/TransactionDetails.jsx',
    'pages/ExplorerAccount.jsx',
    'pages/ExplorerCreator.jsx',
    'pages/ExplorerPost.jsx',
    'pages/ExplorerNft.jsx',
    'pages/ExplorerToken.jsx',
    'pages/ExplorerCollection.jsx',
    'pages/Docs.jsx',
    'pages/Developers.jsx',
    'pages/NetworkTools.jsx',
  ]) {
    const body = await source(page);
    assert.match(body, /useNetwork/, `${page} must read the global network`);
    assert.doesNotMatch(
      body,
      /useState\(\(\) => getDefaultExplorerNetwork\(\)\)/,
      `${page} must not keep a local network default`,
    );
    assert.doesNotMatch(
      body,
      /<NetworkToggle value=\{network\} onChange=\{setNetwork\} \/>/,
      `${page} must not wire a local toggle`,
    );
  }
});

test('mainnet hides test routes even when the API enables them', async () => {
  const app = await source('App.jsx');

  assert.match(app, /testSurfacesVisible/);
  assert.match(app, /settings\.nftDemoEnabled && testSurfacesVisible/);
  assert.match(
    app,
    /settings\.networkConsoleEnabled && testSurfacesVisible/,
  );
  assert.match(app, /path="\/ntf"/);
});

test('mainnet hides test navigation entries', async () => {
  const layout = await source('components/Layout.jsx');
  const developers = await source('pages/Developers.jsx');
  const token = await source('pages/Token.jsx');

  assert.match(layout, /testSurfacesVisible/);
  assert.match(layout, /settings\.nftDemoEnabled && testSurfacesVisible/);
  assert.match(developers, /testSurfacesVisible/);
  assert.match(token, /testSurfacesVisible/);

  for (const [name, body] of [
    ['Layout', layout],
    ['Developers', developers],
    ['Token', token],
  ]) {
    assert.doesNotMatch(body, /\/nft-demo/, `${name} must link to /ntf, not /nft-demo`);
  }
  assert.doesNotMatch(layout, /NFT Demo/);
});

test('demo surface is branded NTF', async () => {
  const demo = await source('pages/NftDemo.jsx');
  assert.match(demo, /NTF Flow/);
  assert.match(demo, /NTF Lifecycle/);
});

test('toggle and surfaces use consumer wording, not core-dev jargon', async () => {
  const toggle = await source('components/NetworkToggle.jsx');
  const config = await source('utils/networkConfig.js');
  // Toggle renders config labels plus a disabled coming-soon entry.
  assert.match(toggle, /getNetworkConfig\(option\)\.label/);
  assert.match(toggle, /Mainnet · Coming soon/);
  assert.match(toggle, /showMainnetComingSoon/);
  // Config labels pair each network with a plain-word hint.
  assert.match(config, /Mainnet · Live/);
  assert.match(config, /Testnet · Test/);
  assert.match(config, /Localnet · Local/);

  // User-facing surfaces must not leak core chain-developer vocabulary.
  // (RPC method names and codec internals stay in utils, not in UI copy.)
  const surfaces = [
    'pages/Explorer.jsx',
    'pages/NetworkTools.jsx',
    'pages/NftDemo.jsx',
    'pages/Docs.jsx',
    'pages/Developers.jsx',
    'components/NetworkToolsPanel.jsx',
    'components/TestnetFundingRequest.jsx',
  ];
  const jargon = [
    'JSON-RPC',
    'WebSocket PubSub',
    'Faucet Daemon',
    'requestAirdrop',
    'Borsh layout',
    'rent-exempt',
    'Live Chain Slot',
    'slot lag',
    'Program Owner Check',
    'Testnet Funding URL',
    'Public Testnet',
    'public testnet',
  ];
  for (const page of surfaces) {
    const body = await source(page);
    for (const term of jargon) {
      assert.doesNotMatch(body, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${page} must not show "${term}"`);
    }
  }
});

test('developer flow shows cluster selection and quick commands per network', async () => {
  const tools = await source('pages/NetworkTools.jsx');
  assert.match(tools, /developerQuickCommands/);
  assert.match(tools, /aeko config set --url/);
  assert.match(tools, /aeko-keygen new/);
  assert.match(tools, /aeko balance/);
  assert.match(tools, /aeko transfer/);
  assert.match(tools, /aeko airdrop/);
  assert.match(tools, /aeko program deploy/);
  assert.match(tools, /aeko program close/);
  // Airdrops go through the CLI everywhere; funding is special-cases only.
  assert.doesNotMatch(tools, /curl -X POST/);
});
