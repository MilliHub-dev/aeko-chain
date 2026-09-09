const DEFAULT_TIMEOUT_MS = 12000;

export class TestConsoleApiError extends Error {
  constructor(message, { status = null, path = '', cause = null } = {}) {
    super(message);
    this.name = 'TestConsoleApiError';
    this.status = status;
    this.path = path;
    this.cause = cause;
  }
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fetchConsoleApi(baseUrl, path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!baseUrl) throw new TestConsoleApiError('Explorer API URL is not configured.', { path });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (cause) {
    throw new TestConsoleApiError('Explorer API request failed.', { path, cause });
  } finally { clearTimeout(timer); }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new TestConsoleApiError(`Explorer API returned non-JSON HTTP ${response.status}.`, { status: response.status, path });
  const payload = await response.json();
  if (!response.ok) throw new TestConsoleApiError(payload?.error?.message || `Explorer API returned HTTP ${response.status}.`, { status: response.status, path });
  return payload?.data;
}

export function fetchConsoleOverview(baseUrl) { return fetchConsoleApi(baseUrl, '/overview'); }
export function fetchSocialStatus(baseUrl) { return fetchConsoleApi(baseUrl, '/social/status'); }
export function fetchSocialRegistry(baseUrl) { return fetchConsoleApi(baseUrl, '/registry/social'); }

export async function fetchWalletProfile(baseUrl, address) {
  const detail = await fetchConsoleApi(baseUrl, `/accounts/${encodeURIComponent(address)}`);
  return { ...detail, tokenCount: detail?.profile?.tokenCount ?? null, nftCount: detail?.profile?.nftCount ?? null, reputationScore: detail?.profile?.reputationScore ?? null, nativeBalance: detail?.profile?.nativeBalance ?? detail?.account?.lamports ?? null };
}

export function fetchSocialFeed(baseUrl, { creator = '', cursor = '', limit = 24 } = {}) {
  return fetchConsoleApi(baseUrl, `/social/feed${queryString({ creator: creator || undefined, cursor: cursor || undefined, limit: Math.max(1, Math.min(100, Number(limit) || 24)) })}`);
}

export function fetchSocialThread(baseUrl, postId, limit = 200) {
  return fetchConsoleApi(baseUrl, `/social/threads/${encodeURIComponent(postId)}${queryString({ limit: Math.max(1, Math.min(250, Number(limit) || 200)) })}`);
}

export function fetchPostsPage(baseUrl, { creator = '', before = null, after = null, postKind = '', visibility = '', limit = 24 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 24, 100));
  return fetchConsoleApi(baseUrl, `/posts${queryString({ creator: creator || undefined, before, after, postKind: postKind || undefined, visibility: visibility || undefined, limit: safeLimit })}`);
}
export function fetchPost(baseUrl, postId) { return fetchConsoleApi(baseUrl, `/posts/${encodeURIComponent(postId)}`); }
export function fetchPostEngagement(baseUrl, postId, { actionKind = '', limit = 100 } = {}) {
  return fetchConsoleApi(baseUrl, `/engagement${queryString({ postId, actionKind: actionKind || undefined, limit: Math.max(1, Math.min(Number(limit) || 100, 500)) })}`);
}

export function fetchCreatorSocial(baseUrl, creator, wallet = '') {
  const encodedCreator = encodeURIComponent(creator);
  const encodedWallet = encodeURIComponent(wallet || creator);
  const requests = {
    posts: `/posts?creator=${encodedCreator}&limit=100`, stakes: `/stakes?creator=${encodedCreator}&limit=100`, rewards: `/rewards?creator=${encodedCreator}&limit=100`,
    rewardAccounts: `/social/reward-accounts?creator=${encodedCreator}&limit=100`, stakeYields: `/social/stake-yields?creator=${encodedCreator}&limit=100`, antiSpam: `/social/anti-spam?wallet=${encodedCreator}&limit=20`,
    tips: `/social/tips?creator=${encodedCreator}&limit=100`, subscriptions: `/social/subscriptions?creator=${encodedCreator}&limit=100`, unlocks: `/social/unlocks?creator=${encodedCreator}&limit=100`,
    revenues: `/social/revenues?creator=${encodedCreator}&limit=100`, walletStakes: `/stakes?wallet=${encodedWallet}&limit=100`, walletSubscriptions: `/social/subscriptions?subscriber=${encodedWallet}&limit=100`, walletUnlocks: `/social/unlocks?buyer=${encodedWallet}&limit=100`,
  };
  return Promise.all(Object.entries(requests).map(async ([key, path]) => {
    try { return [key, { ok: true, data: await fetchConsoleApi(baseUrl, path), error: '' }]; }
    catch (error) { return [key, { ok: false, data: [], error: error.message || String(error) }]; }
  })).then(Object.fromEntries);
}

export function fetchNftsForCreator(baseUrl, address, limit = 100) {
  return fetchConsoleApi(baseUrl, `/nfts${queryString({ owner: address, creator: address, limit: Math.min(100, Math.max(1, Number(limit) || 100)) })}`);
}

export async function fetchSocialProjection(baseUrl, { wallet = '', creator = '', limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const requests = {
    posts: `/posts${queryString({ creator: creator || undefined, limit: safeLimit })}`,
    engagement: `/engagement${queryString({ creator: creator || undefined, limit: safeLimit })}`,
    stakes: `/stakes${queryString({ wallet: wallet || undefined, creator: creator || undefined, limit: safeLimit })}`,
    rewards: `/rewards${queryString({ creator: creator || undefined, limit: safeLimit })}`,
    rewardAccounts: `/social/reward-accounts${queryString({ creator: creator || undefined, limit: safeLimit })}`,
    stakeYields: `/social/stake-yields${queryString({ wallet: wallet || undefined, creator: creator || undefined, limit: safeLimit })}`,
    antiSpam: `/social/anti-spam${queryString({ wallet: wallet || undefined, limit: safeLimit })}`,
    tips: `/social/tips${queryString({ creator: creator || undefined, sender: wallet || undefined, limit: safeLimit })}`,
    subscriptions: `/social/subscriptions${queryString({ creator: creator || undefined, subscriber: wallet || undefined, limit: safeLimit })}`,
    unlocks: `/social/unlocks${queryString({ creator: creator || undefined, buyer: wallet || undefined, limit: safeLimit })}`,
    revenues: `/social/revenues${queryString({ creator: creator || undefined, limit: safeLimit })}`,
    domains: '/social/domains',
  };
  const entries = await Promise.all(Object.entries(requests).map(async ([key, path]) => {
    try { return [key, { ok: true, data: await fetchConsoleApi(baseUrl, path), error: '' }]; }
    catch (error) { return [key, { ok: false, data: [], error: error.message || String(error) }]; }
  }));
  return Object.fromEntries(entries);
}
