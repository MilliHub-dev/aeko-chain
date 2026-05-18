import { getNetworkConfig } from './networkConfig';

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

async function fetchJson(path, network) {
  const base = getExplorerApiBase(network);
  if (!base) {
    throw new Error('Explorer API URL is not configured');
  }

  const response = await fetch(`${base}${path}`);

  // Reverse proxies (Traefik / Coolify / nginx) return HTML when the upstream
  // service is down or restarting — most commonly a 502/503/504. Calling
  // .json() on that body throws "Unexpected token 'B', \"Bad Gateway\" is not
  // valid JSON", which is what users saw on /explorer. Sniff the content-type
  // and convert to a friendly typed error before JSON-parsing.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    const snippet = text.replace(/<[^>]*>/g, ' ').trim().slice(0, 120);
    throw new Error(
      response.status === 502 || response.status === 503 || response.status === 504
        ? `Indexer is unreachable (${response.status}). The explorer-backend may be restarting or syncing — retry in a moment.`
        : `Indexer returned non-JSON (${response.status}). ${snippet}`,
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload?.data;
}

export function getExplorerAvailability(network) {
  return Boolean(getExplorerApiBase(network));
}

export async function fetchExplorerHome(network, filters = {}) {
  const [blocks, transactions, posts, stakes, nfts] = await Promise.all([
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

  return { blocks, transactions, posts, stakes, nfts };
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
  return fetchJson(`/search?q=${encodeURIComponent(query)}&limit=8`, network);
}
