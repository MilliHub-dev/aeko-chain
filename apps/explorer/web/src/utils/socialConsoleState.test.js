import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOCIAL_QUERY_KEYS,
  applyConsoleNavigation,
  mergeUniqueBy,
  normalizeSocialPage,
  resolveOwnedPersona,
} from './socialConsoleState.js';

test('resolveOwnedPersona never promotes a viewed external address to signer', () => {
  const wallets = [
    { id: 'a', name: 'Alice', address: 'owned-a' },
    { id: 'b', name: 'Bob', address: 'owned-b' },
  ];
  assert.equal(resolveOwnedPersona(wallets, 'owned-b')?.address, 'owned-b');
  assert.equal(resolveOwnedPersona(wallets, 'external-profile')?.address, 'owned-a');
  assert.equal(resolveOwnedPersona([], 'external-profile'), null);
});

test('closing console removes all nested social state without touching network', () => {
  const input = new URLSearchParams('network=mainnet&console=1&tab=social&social=post&post=p1&dialog=tip&target=p1&persona=w1');
  const next = applyConsoleNavigation(input, { consoleOpen: false });
  assert.equal(next.get('network'), 'mainnet');
  assert.equal(next.has('console'), false);
  assert.equal(next.has('tab'), false);
  SOCIAL_QUERY_KEYS.forEach((key) => assert.equal(next.has(key), false, key));
});

test('switching away from social clears stale deep-link state', () => {
  const input = new URLSearchParams('console=1&tab=social&social=profile&profile=someone&persona=owned-a');
  const next = applyConsoleNavigation(input, { consoleOpen: true, tab: 'accounts' });
  assert.equal(next.get('console'), '1');
  assert.equal(next.get('tab'), 'accounts');
  SOCIAL_QUERY_KEYS.forEach((key) => assert.equal(next.has(key), false, key));
});

test('social page falls back to feed for invalid deep links', () => {
  assert.equal(normalizeSocialPage('staking'), 'staking');
  assert.equal(normalizeSocialPage('invented-page'), 'feed');
  const next = applyConsoleNavigation(new URLSearchParams(), {
    consoleOpen: true,
    tab: 'social',
    socialPage: 'invented-page',
  });
  assert.equal(next.get('social'), 'feed');
});

test('mergeUniqueBy preserves first-seen cursor page ordering', () => {
  const merged = mergeUniqueBy([
    { postId: 'a' },
    { postId: 'b' },
    { postId: 'b' },
    { postId: 'c' },
  ], 'postId');
  assert.deepEqual(merged.map((item) => item.postId), ['a', 'b', 'c']);
});
