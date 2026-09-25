import { getTestNetworkConfig, isLocalNetworkConfig } from './networkConfig.js';

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

export async function getLatestBlockhash(rpcUrl) {
  const r = await rpc(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return r?.value?.blockhash || r?.blockhash;
}

export async function getBalance(rpcUrl, address) {
  const r = await rpc(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]);
  return typeof r === 'number' ? r : r?.value ?? 0;
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
  if (!configured) throw new Error('Test funding is not set up for this network.');

  let base;
  try {
    base = new URL(configured, globalThis.location?.origin || 'http://127.0.0.1');
  } catch {
    throw new Error('Test funding address is invalid.');
  }
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('Test funding address must use http or https.');
  }

  // Funding is now served by the Explorer/Scan backend. `fundingUrl` is the
  // same-origin Explorer proxy base (for example
  // `/api/explorer/testnet`), not a separate Funding Gateway address.
  const basePath = `${base.pathname.replace(/\/?$/, '/')}`;
  return new URL(path.replace(/^\//, ''), `${base.origin}${basePath}`).toString();
}

async function readFundingResponse(response, label) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${label} returned HTTP ${response.status} with ${contentType || 'non-JSON'} content. `
        + `Check that the funding address points at the funding service, not a web page. ${text.slice(0, 100)}`,
    );
  }
  const body = await response.json();
  if (!response.ok || !body?.data) {
    throw new Error(body?.error?.message || `${label} failed with HTTP ${response.status}`);
  }
  return body.data;
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
  const config = getTestNetworkConfig();
  if (!isConfiguredPublicTestnetRpc(rpcUrl)) {
    return requestAirdrop(rpcUrl, address, lamports);
  }

  const grant = await requestConsoleAirdrop(config.fundingUrl, address, lamportsToAeko(lamports));
  return grant.signature;
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
