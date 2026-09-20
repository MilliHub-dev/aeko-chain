import { signMessage } from './aekoTestKeypair.js';

function fromBase64(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function toBase64(bytes) {
  let raw = '';
  bytes.forEach((byte) => { raw += String.fromCharCode(byte); });
  return btoa(raw);
}

function readShortVec(bytes, start = 0) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (true) {
    const byte = bytes[offset];
    if (byte == null) throw new Error('Prepared transaction signature section is truncated.');
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
    if (shift > 28) throw new Error('Prepared transaction signature count is invalid.');
  }
}

export function signPreparedTransactionWithTestWallet(wallet, preparedBase64) {
  if (!wallet?.address || !wallet?.secretKeyB64) {
    throw new Error('Select a browser-local test wallet before signing.');
  }
  if (!preparedBase64?.trim()) {
    throw new Error('Build a prepared transaction before signing.');
  }

  const bytes = fromBase64(preparedBase64.trim());
  const signatures = readShortVec(bytes);
  if (signatures.value !== 1) {
    throw new Error(`Browser-local test signing supports exactly one signature, received ${signatures.value}.`);
  }

  const signatureOffset = signatures.offset;
  const messageOffset = signatureOffset + signatures.value * 64;
  if (messageOffset >= bytes.length) {
    throw new Error('Prepared transaction does not contain a message payload.');
  }

  const signature = signMessage(wallet, bytes.slice(messageOffset));
  bytes.set(signature, signatureOffset);
  return toBase64(bytes);
}
