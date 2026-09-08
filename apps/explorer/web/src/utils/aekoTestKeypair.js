// In-browser test keypair management for the /faucet test console.
//
// Keypairs are ed25519 (the same scheme aeko-validator accepts on the wire).
// We use tweetnacl because it ships ed25519 sign + keyPair primitives in a
// single 15 kB dependency with no setup, which keeps the bundle from
// inflating just to make demo transactions land on testnet.
//
// SECURITY: these wallets are stored unencrypted in localStorage. They are
// strictly for testnet experimentation — the modal makes this explicit.
import nacl from 'tweetnacl';

const STORAGE_KEY = 'aeko.faucet.testWallets.v1';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('encodeBase58 expects a Uint8Array');
  }
  // Count leading zeros; each one becomes a leading '1' in the output.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = (value / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '';
  for (let i = 0; i < zeros; i += 1) out += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58_ALPHABET[digits[i]];
  return out;
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(s) {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// Internal wallet shape — kept narrow so we never persist anything we don't
// need to reconstruct the keypair on reload.
function makeWallet({ name, secretKey, createdAt }) {
  const pubBytes = secretKey.slice(32);
  return {
    id: encodeBase58(pubBytes),
    name,
    address: encodeBase58(pubBytes),
    secretKeyB64: bytesToBase64(secretKey),
    createdAt,
  };
}

export function generateTestWallet(name) {
  const kp = nacl.sign.keyPair();
  return makeWallet({
    name: name?.trim() || defaultWalletName(),
    secretKey: kp.secretKey,
    createdAt: new Date().toISOString(),
  });
}

export function importTestWalletFromSecretKey({ name, secretKeyB64 }) {
  const bytes = base64ToBytes(secretKeyB64);
  if (bytes.length !== 64) {
    throw new Error('Secret key must be 64 bytes (base64-encoded).');
  }
  return makeWallet({
    name: name?.trim() || defaultWalletName(),
    secretKey: bytes,
    createdAt: new Date().toISOString(),
  });
}

export function getSecretKeyBytes(wallet) {
  return base64ToBytes(wallet.secretKeyB64);
}

export function signMessage(wallet, messageBytes) {
  return nacl.sign.detached(messageBytes, getSecretKeyBytes(wallet));
}

export function loadWallets() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWallets(wallets) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

function defaultWalletName() {
  return `Test wallet ${new Date().toISOString().slice(11, 19)}`;
}

export function shortAddress(address) {
  if (!address || address.length <= 10) return address || '';
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
