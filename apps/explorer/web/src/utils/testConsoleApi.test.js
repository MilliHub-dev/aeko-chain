import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSocialProjection, fetchWalletProfile } from './testConsoleApi.js';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => ({ data }),
  };
}

test('normalizes the backend account detail for wallet metrics', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://api.aeko.test/accounts/Wallet123');
    return jsonResponse({
      account: { address: 'Wallet123', lamports: 44 },
      profile: { tokenCount: 2, nftCount: 3, reputationScore: 950, nativeBalance: 44 },
      recentTransactions: [{ signature: 'sig' }],
    });
  };

  try {
    const profile = await fetchWalletProfile('https://api.aeko.test', 'Wallet123');
    assert.equal(profile.tokenCount, 2);
    assert.equal(profile.nftCount, 3);
    assert.equal(profile.reputationScore, 950);
    assert.equal(profile.nativeBalance, 44);
    assert.equal(profile.recentTransactions.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads every durable Social projection without inventing local records', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return jsonResponse([]);
  };

  try {
    const result = await fetchSocialProjection('https://api.aeko.test', {
      wallet: 'Wallet123',
      creator: 'Creator456',
      limit: 999,
    });
    for (const key of [
      'posts', 'engagement', 'stakes', 'rewards', 'rewardAccounts', 'stakeYields',
      'antiSpam', 'tips', 'subscriptions', 'unlocks', 'revenues', 'domains',
    ]) {
      assert.equal(result[key].ok, true, key);
      assert.deepEqual(result[key].data, [], key);
    }
    assert.ok(urls.some((url) => url.includes('/social/anti-spam')));
    assert.ok(urls.some((url) => url.includes('/social/tips')));
    assert.ok(urls.some((url) => url.includes('/social/subscriptions')));
    assert.ok(urls.some((url) => url.includes('/social/unlocks')));
    assert.ok(urls.some((url) => url.includes('/social/revenues')));
    assert.ok(urls.every((url) => !url.includes('limit=999')));

    const engagementUrl = urls.find((url) => url.includes('/engagement'));
    assert.ok(engagementUrl);
    assert.ok(engagementUrl.includes('creator=Creator456'));
    assert.ok(!engagementUrl.includes('actor=Wallet123'));

    assert.ok(urls.some((url) => url.includes('/stakes') && url.includes('wallet=Wallet123')));
    assert.ok(urls.some((url) => url.includes('/social/anti-spam') && url.includes('wallet=Wallet123')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
