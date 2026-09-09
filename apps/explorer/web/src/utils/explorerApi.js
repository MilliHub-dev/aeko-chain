import { getFinalizedSlot } from './aekoRpcClient';
import { normalizeSearchMatches } from './explorerData';
import { getNetworkConfig } from './networkConfig';

const OVERVIEW_CACHE_MS = 5_000;
const overviewCache = new Map();

class ExplorerApiError extends Error {
  constructor(message, { status = null, path = '', cause = null } = {}) {
    super(message);
    this.name = 'ExplorerApiError';
    this.status = status;
    this.path = path;
    this.cause = cause;
  }
}

function getExplorerApiBase(network) {
  const active = getNetworkConfig(network);
  return active.explorerApiUrl || '';
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function fetchEnvelope(path, network) {
  const base = getExplorerApiBase(network);
  if (!base) {
    throw new ExplorerApiError('Explorer API URL is not configured', { path });
  }

  let response;
  try {
    response = await fetch(`${base}${path}`);
  } catch (cause) {
    throw new ExplorerApiError('Explorer API request failed before receiving a response', {
      path,
      cause,
    });
  }

  // Reverse proxies (Traefik / Dokploy / nginx) may return HTML while an
  // upstream service is restarting. Preserve the HTTP status so callers can
  // distinguish an unsupported additive endpoint from a genuine outage.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    const snippet = text.replace(/<[^>]*>/g, ' ').trim().slice(0, 120);
    throw new ExplorerApiError(
      response.status === 502 || response.status === 503 || response.status === 504
        ? `Indexer is unreachable (${response.status}). The explorer backend may be restarting or syncing — retry in a moment.`
        : `Indexer returned non-JSON (${response.status}). ${snippet}`,
      { status: response.status, path },
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new ExplorerApiError(
      payload?.error?.message || `Request failed: ${response.status}`,
      { status: response.status, path },
    );
  }

  return payload;
}

async function fetchJson(path, network) {
  const payload = await fetchEnvelope(path, network);
  return payload?.data;
}

function emptyOverview(overrides = {}) {
  return {
    backendOverviewAvailable: false,
    dataSource: 'overview-unavailable',
    overviewError: '',
    rpcAvailable: false,
    latestChainSlot: null,
    latestIndexedSlot: null,
    indexLagSlots: null,
    latestAssetSlot: null,
    assetLagSlots: null,
    latestSocialSlot: null,
    socialLagSlots: null,
    indexedBlocks: null,
    indexedTransactions: null,
    indexedTokens: null,
    indexedNfts: null,
    indexedPosts: null,
    indexedStakes: null,
    ...overrides,
  };
}

function overviewEndpointUnsupported(error) {
  return error instanceof ExplorerApiError && [404, 405, 501].includes(error.status);
}

export function getExplorerAvailability(network) {
  return Boolean(getExplorerApiBase(network));
}

async function readExplorerOverview(network) {
  try {
    const payload = await fetchEnvelope('/overview', network);
    return emptyOverview({
      ...payload?.data,
      backendOverviewAvailable: true,
      dataSource: payload?.meta?.source || 'explorer-backend',
    });
  } catch (error) {
    // Backward-compatible rollout only: if an older Explorer backend does not
    // yet implement /overview, the UI may read the finalized live slot
    // directly from the configured public RPC. A backend outage (5xx/network
    // failure) is NOT silently bypassed, because the Explorer backend remains
    // authoritative for indexed history and aggregates.
    if (!overviewEndpointUnsupported(error)) {
      throw error;
    }

    const rpcUrl = getNetworkConfig(network).rpcUrl;
    if (!rpcUrl) {
      return emptyOverview({
        dataSource: 'explorer-backend-legacy',
        overviewError: 'Explorer backend does not expose /overview and no RPC fallback is configured.',
      });
    }

    try {
      const latestChainSlot = await getFinalizedSlot(rpcUrl);
      return emptyOverview({
        dataSource: 'rpc-live-fallback',
        rpcAvailable: true,
        latestChainSlot,
        overviewError: 'Explorer backend is running an older contract without /overview.',
      });
    } catch (rpcError) {
      return emptyOverview({
        dataSource: 'explorer-backend-legacy',
        overviewError: `Explorer backend lacks /overview and RPC fallback failed: ${rpcError.message}`,
      });
    }
  }
}

export async function fetchExplorerOverview(network) {
  const cached = overviewCache.get(network);
  if (cached && Date.now() - cached.receivedAt < OVERVIEW_CACHE_MS) {
    return cached.value;
  }

  const value = await readExplorerOverview(network);
  overviewCache.set(network, { receivedAt: Date.now(), value });
  return value;
}

export async function fetchExplorerHome(network, filters = {}) {
  // Overview is informative and additive. If it is unavailable, preserve the
  // primary indexed lists rather than turning a dashboard-summary failure into
  // a total Explorer outage. The short cache also keeps filter changes from
  // repeatedly running global count queries against PostgreSQL.
  const overviewPromise = fetchExplorerOverview(network).catch((error) =>
    emptyOverview({
      overviewError: error.message,
      dataSource: 'overview-error',
    }),
  );

  const [overview, blocks, transactions, posts, stakes, nfts] = await Promise.all([
    overviewPromise,
    fetchJson(`/blocks${buildQuery({ limit: 6, before: filters.blockBefore, after: filters.blockAfter })}`, network),
    fetchJson(`/transactions${buildQuery({
      limit: 6,
      before: filters.txBefore,
      after: filters.txAfter,
      address: filters.txAddress,
      type: filters.txType,
      status: filters.txStatus,
    })}`, network),
    fetchJson(`/posts${buildQuery({
      limit: 6,
      creator: filters.postCreator,
      postKind: filters.postKind,
      visibility: filters.postVisibility,
      before: filters.postBefore,
      after: filters.postAfter,
    })}`, network),
    fetchJson(`/stakes${buildQuery({
      limit: 6,
      wallet: filters.stakeWallet,
      creator: filters.stakeCreator,
      staker: filters.stakeStaker,
      state: filters.stakeState,
    })}`, network),
    fetchJson(`/nfts${buildQuery({
      limit: 6,
      collection: filters.nftCollection,
      owner: filters.nftOwner,
      creator: filters.nftCreator,
    })}`, network),
  ]);

  return { overview, blocks, transactions, posts, stakes, nfts };
}

export async function fetchBlockDetails(network, slot) {
  return fetchJson(`/blocks/${slot}`, network);
}

export async function fetchTransactionDetails(network, signature) {
  return fetchJson(`/transactions/${encodeURIComponent(signature)}`, network);
}

export async function fetchAccountDetails(network, address) {
  return fetchJson(`/accounts/${encodeURIComponent(address)}`, network);
}

export async function fetchCreatorDetails(network, address) {
  return fetchJson(`/creators/${encodeURIComponent(address)}`, network);
}

export async function fetchTokenDetails(network, mint) {
  return fetchJson(`/tokens/${encodeURIComponent(mint)}`, network);
}

export async function fetchCollectionDetails(network, collectionId) {
  return fetchJson(`/collections/${encodeURIComponent(collectionId)}`, network);
}

export async function fetchPostDetails(network, postId) {
  return fetchJson(`/posts/${encodeURIComponent(postId)}`, network);
}

export async function fetchNftDetails(network, tokenId) {
  return fetchJson(`/nfts/${encodeURIComponent(tokenId)}`, network);
}

export async function searchExplorer(network, query) {
  const payload = await fetchJson(`/search?q=${encodeURIComponent(query)}&limit=8`, network);
  return { matches: normalizeSearchMatches(payload) };
}
