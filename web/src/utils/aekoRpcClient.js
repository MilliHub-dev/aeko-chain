// Thin JSON-RPC client for the AEKO testnet validator.
//
// Used by the /faucet test console to drive airdrops, transfers, and read
// SocialFi state without going through the explorer-backend (so the modal
// still works even when the explorer-backend deploy is unhealthy).

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
      // Bubble up Traefik 502/503 plain-text bodies as a typed error instead
      // of letting JSON.parse blow up with the confusing
      // "Unexpected token 'B', 'Bad Gateway'" message users have been
      // seeing on /explorer.
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

export async function getHealth(rpcUrl) {
  return rpc(rpcUrl, 'getHealth', []);
}

export async function getLatestBlockhash(rpcUrl) {
  const r = await rpc(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return r?.value?.blockhash || r?.blockhash;
}

export async function getBalance(rpcUrl, address) {
  const r = await rpc(rpcUrl, 'getBalance', [address, { commitment: 'confirmed' }]);
  // Validator returns { context, value: <lamports> }
  return typeof r === 'number' ? r : r?.value ?? 0;
}

export async function requestAirdrop(rpcUrl, address, lamports) {
  return rpc(rpcUrl, 'requestAirdrop', [address, lamports]);
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
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Transaction not confirmed within timeout window.');
}

// Lamports <-> AEKO display helpers. The chain uses 9 decimal places, the
// same as the Solana-style fork it's built from.
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
  // Show up to 6 fractional digits but strip trailing zeros; fee math here
  // is in 5000-lamport increments so 4 dp would round it off.
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} AEKO`;
}
