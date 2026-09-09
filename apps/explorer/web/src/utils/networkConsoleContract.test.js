import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('active test console delegates to the end-to-end implementation', async () => {
  const wrapper = await source('components/NetworkConsoleModal.jsx');
  const implementation = await source('components/NetworkConsoleModalV2.jsx');

  assert.match(wrapper, /NetworkConsoleModalV2/);
  assert.match(wrapper, /websocketUrl/);
  assert.match(implementation, /new AekoWsClient/);
  assert.match(implementation, /fetchConsoleOverview/);
  assert.match(implementation, /fetchWalletProfile/);
  assert.match(implementation, /fetchSocialStatus/);
  assert.match(implementation, /fetchSocialProjection/);
  assert.match(implementation, /requestAirdrop/);
  assert.match(implementation, /buildSignedTransfer/);
  assert.match(implementation, /buildSignedAnchorPostTx/);
  assert.match(implementation, /buildSignedLikeTx/);
  assert.doesNotMatch(implementation, /mock|dummy|fixture/i);
});

test('console reads are API-first and direct RPC is limited to unsupported write primitives', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');

  assert.doesNotMatch(implementation, /\bgetBalance\b/);
  assert.doesNotMatch(implementation, /\bgetHealth\b/);
  assert.doesNotMatch(implementation, /\bgetFinalizedSlot\b/);
  assert.doesNotMatch(implementation, /discoverSocialPostsStateAccount/);

  assert.match(implementation, /fetchWalletProfile\(explorerApiUrl, address\)/);
  assert.match(implementation, /fetchConsoleOverview\(explorerApiUrl\)/);
  assert.match(implementation, /fetchSocialStatus\(explorerApiUrl\)/);
  assert.match(implementation, /fetchSocialProjection\(explorerApiUrl/);

  for (const rpcWritePrimitive of ['requestAirdrop', 'getLatestBlockhash', 'sendTransaction', 'confirmSignature']) {
    assert.match(implementation, new RegExp(`\\b${rpcWritePrimitive}\\b`), rpcWritePrimitive);
  }
});

test('console websocket drives slot, wallet and API-derived social state subscriptions', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /subscribeSlot/);
  assert.match(implementation, /subscribeAccount\(wallet\.address/);
  assert.match(implementation, /socialStatus\?\.domains\?\.posts\?\.stateAccount/);
  assert.match(implementation, /subscribeAccount\(socialStateAccount/);
  assert.match(implementation, /refreshWallet\(wallet\.address\)/);
});

test('wallet and social interactions remain wired while source ownership changes', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /renameWallet/);
  assert.match(implementation, /postKind: composer\.kind/);
  assert.match(implementation, /parentPostId: composer\.parent\?\.postId/);
  assert.match(implementation, /kind: 'reply'/);
  assert.match(implementation, /kind: 'quote'/);
  assert.match(implementation, /setFeedCreator/);
  assert.match(implementation, /projection\?\.posts\?\.data/);
  assert.match(implementation, /projection\?\.engagement\?\.data/);
});
