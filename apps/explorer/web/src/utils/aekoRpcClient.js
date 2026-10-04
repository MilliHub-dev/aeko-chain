import { getTestNetworkConfig, isLocalNetworkConfig, NETWORKS } from './networkConfig.js';

// Thin JSON-RPC client for the AEKO testnet validator.
//
// Used by the network/test consoles for funding, transactions, explicit
// live-chain reads, and the Explorer's narrowly scoped compatibility fallback.

const DEFAULT_TIMEOUT_MS = 15_000;

async function rpc(url, method, params, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `RPC ${method} failed: ${res.status} ${res.statusText} — ${text.slice(0, 140)}`,
      );
    }
    const body = await res.json();
    if (body.error) {
      throw new Error(`RPC ${method} error: ${body.error.message || JSON.stringify(body.error)}`);
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSlot(rpcUrl) {
  return rpc(rpcUrl, 'getSlot', []);
}

export async function getFinalizedSlot(rpcUrl) {
  return rpc(rpcUrl, 'getSlot', [{ commitment: 'finalized' }]);
}

export async function getEpochInfo(rpcUrl) {
  return rpc(rpcUrl, 'getEpochInfo', [{ commitment: 'confirmed' }]);
}

export async function getHealth(rpcUrl) {
  return rpc(rpcUrl, 'getHealth', []);
}

export async function getGenesisHash(rpcUrl) {
  return rpc(rpcUrl, 'getGenesisHash', []);
}

export async function getVersion(rpcUrl) {
  return rpc(rpcUrl, 'getVersion', []);
}

export async function getSupply(rpcUrl) {
  return rpc(rpcUrl, 'getSupply', [{ commitment: 'confirmed' }]);
}

export async function getVoteAccounts(rpcUrl) {
  return rpc(rpcUrl, 'getVoteAccounts', [{ commitment: 'confirmed' }]);
}

export async function getLatestBlockhash(rpcUrl) {
  const r = await rpc(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return r?.value?.blockhash || r?.blockhash;
}

export async function getBalance(rpcUrl, address) {
  const r = await rpc(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]);
  return typeof r === 'number' ? r : r?.value ?? 0;
}

export async function getMinimumBalanceForRentExemption(rpcUrl, space) {
  const value = await rpc(rpcUrl, 'getMinimumBalanceForRentExemption', [
    Number(space),
    { commitment: 'confirmed' },
  ]);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('RPC did not return a valid rent-exemption balance.');
  }
  return value;
}

export async function requestAirdrop(rpcUrl, address, lamports) {
  return rpc(rpcUrl, 'requestAirdrop', [address, lamports]);
}

function normalizedUrl(value) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function isConfiguredPublicTestnetRpc(rpcUrl) {
  const config = getTestNetworkConfig();
  if (!config.available || isLocalNetworkConfig(config) || !config.fundingUrl) return false;
  return normalizedUrl(rpcUrl) === normalizedUrl(config.rpcUrl);
}

function fundingEndpoint(fundingUrl, path) {
  const configured = String(fundingUrl || '').trim();
  if (!configured) throw new Error('Test AEKO is temporarily unavailable.');

  let base;
  try {
    base = new URL(configured, globalThis.location?.origin || 'http://127.0.0.1');
  } catch {
    throw new Error('Test AEKO is temporarily unavailable.');
  }
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('Test AEKO is temporarily unavailable.');
  }

  // Funding is served directly by the selected network's Explorer API.
  // `fundingUrl` is an absolute Explorer API origin, not a Scan proxy path
  // and not a separate Funding Gateway address.
  const basePath = `${base.pathname.replace(/\/?$/, '/')}`;
  return new URL(path.replace(/^\//, ''), `${base.origin}${basePath}`).toString();
}

async function readFundingResponse(response, label) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new FundingResponseError(
      `${label} returned HTTP ${response.status} with ${contentType || 'non-JSON'} content. `
        + `The Explorer API did not return the funding JSON contract. Check the API edge/WAF and CORS configuration. ${text.slice(0, 100)}`,
      { status: response.status },
    );
  }
  const body = await response.json();
  if (!response.ok || !body?.data) {
    // Preserve machine-readable fields so callers can resume: a
    // REQUEST_PENDING rejection carries the existing request id, letting the
    // UI poll the in-flight request instead of dead-ending.
    throw new FundingResponseError(
      body?.error?.message || `${label} failed with HTTP ${response.status}`,
      {
        code: body?.error?.code,
        requestId: body?.error?.requestId ?? body?.error?.request_id ?? null,
        status: response.status,
      },
    );
  }
  return body.data;
}

/**
 * Error from the selected network's Explorer funding API that preserves the
 * machine-readable `code`/`requestId` fields alongside the human-readable
 * message.
 */
export class FundingResponseError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, requestId?: string | null, status?: number }} [options]
   */
  constructor(message, { code, requestId = null, status } = {}) {
    super(message);
    this.name = 'FundingResponseError';
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

export async function getFundingPolicy(fundingUrl) {
  const response = await fetch(fundingEndpoint(fundingUrl, '/funding/policy'));
  return readFundingResponse(response, 'Funding policy request');
}

export async function requestFundingApproval(fundingUrl, address) {
  const response = await fetch(fundingEndpoint(fundingUrl, '/funding/request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  return readFundingResponse(response, 'Funding request');
}

export async function getFundingRequestStatus(fundingUrl, requestId) {
  const id = String(requestId || '').trim();
  if (!id) throw new Error('Funding request id is required.');
  const response = await fetch(
    fundingEndpoint(fundingUrl, `/funding/request/${encodeURIComponent(id)}`),
    { cache: 'no-store' },
  );
  return readFundingResponse(response, 'Funding request status');
}

export async function requestConsoleAirdrop(fundingUrl, address, amountAeko) {
  const response = await fetch(fundingEndpoint(fundingUrl, '/funding/airdrop'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, amountAeko }),
  });
  const data = await readFundingResponse(response, 'Test Console airdrop');
  if (!data?.signature) {
    throw new Error('Test airdrop finished without a transaction signature.');
  }
  return data;
}

export async function requestTestnetFunding(rpcUrl, address, lamports) {
  const wanted = normalizedUrl(rpcUrl);
  const config = Object.values(NETWORKS).find(
    (entry) => entry?.available && entry?.fundingUrl && normalizedUrl(entry.rpcUrl) === wanted,
  ) ?? getTestNetworkConfig();
  if (
    !config.available
    || !config.fundingUrl
    || normalizedUrl(rpcUrl) !== normalizedUrl(config.rpcUrl)
  ) {
    throw new Error(
      'Test AEKO is temporarily unavailable for this network.',
    );
  }

  const airdrop = await requestConsoleAirdrop(
    config.fundingUrl,
    address,
    lamportsToAeko(lamports),
  );
  return airdrop.signature;
}

export async function getAccountInfo(rpcUrl, address) {
  const r = await rpc(rpcUrl, 'getAccountInfo', [
    address,
    { commitment: 'confirmed', encoding: 'base64' },
  ]);
  return r?.value || null;
}

export async function sendTransaction(rpcUrl, base64Tx) {
  return rpc(rpcUrl, 'sendTransaction', [
    base64Tx,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ]);
}

export async function confirmSignature(rpcUrl, signature, { attempts = 20, intervalMs = 750 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await rpc(rpcUrl, 'getSignatureStatuses', [[signature], { searchTransactionHistory: false }]);
    const status = r?.value?.[0];
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Transaction not confirmed within timeout window.');
}

export const LAMPORTS_PER_AEKO = 1_000_000_000;

export function lamportsToAeko(lamports) {
  return Number(lamports) / LAMPORTS_PER_AEKO;
}

export function aekoToLamports(aeko) {
  return Math.round(Number(aeko) * LAMPORTS_PER_AEKO);
}

export function formatAeko(lamports) {
  const value = lamportsToAeko(lamports);
  if (Number.isNaN(value)) return '—';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} AEKO`;
}
