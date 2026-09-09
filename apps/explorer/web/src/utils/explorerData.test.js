import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatExplorerMetric,
  normalizeSearchMatch,
  normalizeSearchMatches,
} from './explorerData.js';

test('normalizes the current flat Rust search enum representation', () => {
  assert.deepEqual(
    normalizeSearchMatch({ kind: 'block', slot: 42, blockhash: 'abc' }),
    { kind: 'block', data: { slot: 42, blockhash: 'abc' } },
  );
});

test('keeps compatibility with the earlier nested search representation', () => {
  assert.deepEqual(
    normalizeSearchMatch({ kind: 'wallet', wallet: { address: 'wallet-1' } }),
    { kind: 'wallet', data: { address: 'wallet-1' } },
  );
});

test('normalizes both array and legacy matches payloads', () => {
  assert.equal(normalizeSearchMatches([{ kind: 'nft', tokenId: 'nft-1' }]).length, 1);
  assert.equal(
    normalizeSearchMatches({ matches: [{ kind: 'transaction', signature: 'sig-1' }] }).length,
    1,
  );
  assert.deepEqual(normalizeSearchMatches(null), []);
});

test('formats only finite non-negative metrics', () => {
  assert.equal(formatExplorerMetric(12345), '12,345');
  assert.equal(formatExplorerMetric(null), '—');
  assert.equal(formatExplorerMetric(-1), '—');
});
