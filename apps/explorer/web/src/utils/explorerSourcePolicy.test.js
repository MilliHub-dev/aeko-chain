import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PRODUCTION_EXPLORER_PAGES = [
  'Explorer.jsx',
  'BlockDetails.jsx',
  'TransactionDetails.jsx',
  'ExplorerAccount.jsx',
  'ExplorerCreator.jsx',
  'ExplorerPost.jsx',
  'ExplorerNft.jsx',
  'ExplorerToken.jsx',
  'ExplorerCollection.jsx',
];

test('production Explorer pages use the Explorer API instead of RPC/demo fixtures', async () => {
  for (const page of PRODUCTION_EXPLORER_PAGES) {
    const source = await readFile(new URL(`../pages/${page}`, import.meta.url), 'utf8');
    assert.equal(
      source.includes('aekoRpcClient'),
      false,
      `${page} must not bypass the Explorer backend with direct RPC`,
    );
    assert.equal(
      source.includes('nftDemoExamples'),
      false,
      `${page} must not consume NFT demo fixtures`,
    );
  }
});

test('the production Explorer client is backend-first with a narrow RPC fallback', async () => {
  const source = await readFile(new URL('./explorerApi.js', import.meta.url), 'utf8');

  assert.match(source, /fetchEnvelope\('\/overview'/);
  assert.match(source, /overviewEndpointUnsupported/);
  assert.match(source, /getFinalizedSlot/);
  assert.match(source, /\[404, 405, 501\]/);
  assert.doesNotMatch(source, /\[404, 405, 500, 501, 502, 503, 504\]/);
});
