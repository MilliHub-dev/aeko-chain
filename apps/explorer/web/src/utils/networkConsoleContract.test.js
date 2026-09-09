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
  assert.match(implementation, /fetchSocialProjection/);
  assert.match(implementation, /requestAirdrop/);
  assert.match(implementation, /buildSignedTransfer/);
  assert.match(implementation, /buildSignedAnchorPostTx/);
  assert.match(implementation, /buildSignedLikeTx/);
  assert.doesNotMatch(implementation, /mock|dummy|fixture/i);
});

test('console websocket drives slot, wallet and social state subscriptions', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /subscribeSlot/);
  assert.match(implementation, /subscribeAccount\(wallet\.address/);
  assert.match(implementation, /subscribeAccount\(discovered\.address/);
});

test('wallet and social interactions remain wired while transport changes', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /renameWallet/);
  assert.match(implementation, /postKind: composer\.kind/);
  assert.match(implementation, /parentPostId: composer\.parent\?\.postId/);
  assert.match(implementation, /kind: 'reply'/);
  assert.match(implementation, /kind: 'quote'/);
  assert.match(implementation, /setFeedCreator/);
});
