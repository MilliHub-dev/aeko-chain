import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('nft demo is live-first and no longer exposes the local lifecycle simulator', async () => {
  const demo = await source('pages/NftDemo.jsx');

  assert.match(demo, /NftLiveFlow/);
  assert.match(demo, /rpcUrl={networkConfig\.rpcUrl}/);
  assert.match(demo, /explorerApiUrl={networkConfig\.explorerApiUrl}/);
  assert.doesNotMatch(demo, /nftDemoExamples/);
  assert.doesNotMatch(demo, /handleMint/);
  assert.doesNotMatch(demo, /simulate the same guardrails/i);
  assert.doesNotMatch(demo, /Demo Event Log/);
});

test('live nft flow signs, submits, confirms, reads back and verifies explorer indexing', async () => {
  const live = await source('components/NftLiveFlow.jsx');

  assert.match(live, /signPreparedTransactionWithTestWallet/);
  assert.match(live, /sendTransaction\(rpcUrl, signed\)/);
  assert.match(live, /confirmSignature\(rpcUrl, signature\)/);
  assert.match(live, /decodeCollectionAccount/);
  assert.match(live, /decodeTokenAccount/);
  assert.match(live, /fetchConsoleApi\(explorerApiUrl, `\/nfts\//);
  assert.match(live, /buildPreparedCollectionSetupTransaction/);
  assert.match(live, /buildPreparedMintWithAccountSetupTransaction/);
  assert.match(live, /buildPreparedToken721Transaction/);
  assert.match(live, /requestTestnetFunding/);
  assert.doesNotMatch(live, /\brequestAirdrop\b/);
});

test('live nft lifecycle exposes real freeze thaw update and transfer actions', async () => {
  const live = await source('components/NftLiveFlow.jsx');

  for (const action of ['freeze', 'thaw', 'update', 'transfer']) {
    assert.match(live, new RegExp(`runLifecycleAction\\('${action}'\\)`), action);
  }
  assert.match(live, /token\.creator !== wallet\.address/);
  assert.match(live, /token\.owner !== wallet\.address/);
  assert.match(live, /nft\.owner === recipient\.trim\(\)/);
  assert.match(live, /nft\.metadataUri === metadataUri\.trim\(\)/);
});
