import { getGenesisHash } from './aekoRpcClient.js';

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchExplorerChainIdentity(
  explorerApiUrl,
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  if (!explorerApiUrl) {
    throw new Error('Explorer API URL is required to verify chain identity.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${explorerApiUrl.replace(/\/$/, '')}/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Explorer identity check failed: ${response.status} ${response.statusText}`,
      );
    }
    const body = await response.json();
    const identity = body?.data;
    if (!identity?.genesisHash || !identity?.network) {
      throw new Error('Explorer API did not publish a complete chain identity.');
    }
    return {
      network: String(identity.network),
      genesisHash: String(identity.genesisHash),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function assertRpcExplorerAlignment({ rpcUrl, explorerApiUrl }) {
  const [rpcGenesisHash, explorerIdentity] = await Promise.all([
    getGenesisHash(rpcUrl),
    fetchExplorerChainIdentity(explorerApiUrl),
  ]);

  if (rpcGenesisHash !== explorerIdentity.genesisHash) {
    throw new Error(
      `Network mismatch: selected RPC genesis ${rpcGenesisHash} does not match Explorer API genesis ${explorerIdentity.genesisHash}. Refusing to sign or submit a transaction across different AEKO networks.`,
    );
  }

  return {
    rpcGenesisHash,
    explorerGenesisHash: explorerIdentity.genesisHash,
    network: explorerIdentity.network,
  };
}
