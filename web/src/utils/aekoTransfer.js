// Browser-side System Program transfer instruction builder + legacy
// transaction signer. Mirrors what `aeko transfer <recipient> <amount>`
// produces, but skips the CLI roundtrip so the /faucet test console can
// move lamports between two in-browser test wallets directly.
//
// Wire format we target:
//   signatures: short_vec<[u8;64]>
//   message:
//     header (3 bytes): num_required_signatures, num_readonly_signed, num_readonly_unsigned
//     account_keys: short_vec<[u8;32]>
//     recent_blockhash: [u8;32]
//     instructions: short_vec<CompiledInstruction>
//   CompiledInstruction:
//     program_id_index: u8
//     accounts: short_vec<u8>
//     data: short_vec<u8>
//
// The System Program transfer instruction layout is:
//   tag: u32 LE = 2
//   lamports: u64 LE
import { getSecretKeyBytes, signMessage } from './aekoTestKeypair';

const SYSTEM_PROGRAM_ID = new Uint8Array(32); // all-zero pubkey == System Program
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('A required public key is missing.');
  }
  const bytes = [0];
  for (const char of value.trim()) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base58 character "${char}" in pubkey.`);
    }
    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < value.length && value[i] === '1'; i += 1) bytes.push(0);
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) {
    throw new Error(`Expected 32-byte pubkey, got ${decoded.length}.`);
  }
  return decoded;
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodeShortVec(n) {
  // Compact-u16 / shortvec — 7 bits per byte, MSB = continuation.
  const out = [];
  let remaining = n >>> 0;
  while (true) {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) next |= 0x80;
    out.push(next);
    if (remaining === 0) break;
  }
  return Uint8Array.from(out);
}

function encodeU32LE(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}

function encodeU64LE(value) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(value), true);
  return b;
}

function encodeBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Build, sign, and base64-encode a legacy single-instruction transfer.
 *
 * @param {object} args
 * @param {{address:string,secretKeyB64:string}} args.fromWallet  Sender (also fee payer).
 * @param {string} args.toAddress                                 Recipient base58 pubkey.
 * @param {number} args.lamports                                  Amount in lamports.
 * @param {string} args.recentBlockhash                           Fresh blockhash from RPC.
 * @returns {string}                                              Base64-encoded signed tx.
 */
export function buildSignedTransfer({ fromWallet, toAddress, lamports, recentBlockhash }) {
  const fromBytes = decodeBase58(fromWallet.address);
  const toBytes = decodeBase58(toAddress);
  const blockhashBytes = decodeBase58(recentBlockhash);

  // Account ordering: signer-writable first (fee payer), then writable, then
  // readonly. For this single instruction: from (signer+writable), to
  // (writable), system_program (readonly). The validator rejects the tx if
  // the header counts don't match the actual ordering, so this is rigid.
  const accountKeys = [fromBytes, toBytes, SYSTEM_PROGRAM_ID];
  const header = Uint8Array.from([
    1, // num_required_signatures
    0, // num_readonly_signed
    1, // num_readonly_unsigned (system_program only)
  ]);

  // System Program transfer: tag=2 u32 LE, lamports u64 LE.
  const instructionData = concatBytes(encodeU32LE(2), encodeU64LE(lamports));

  const compiledInstruction = concatBytes(
    Uint8Array.from([2]), // program_id_index → index of SYSTEM_PROGRAM_ID in accountKeys
    encodeShortVec(2),
    Uint8Array.from([0, 1]), // from, to indices
    encodeShortVec(instructionData.length),
    instructionData,
  );

  const messageBytes = concatBytes(
    header,
    encodeShortVec(accountKeys.length),
    ...accountKeys,
    blockhashBytes,
    encodeShortVec(1),
    compiledInstruction,
  );

  // Sign the message bytes with the sender's secret key.
  const signature = signMessage(fromWallet, messageBytes);

  const signatureSection = concatBytes(encodeShortVec(1), signature);
  return encodeBase64(concatBytes(signatureSection, messageBytes));
}

// Useful sanity helper for tests / debugging.
export function ensureSecretKeyMatchesAddress(wallet) {
  const sk = getSecretKeyBytes(wallet);
  const derivedPub = sk.slice(32);
  const expected = decodeBase58(wallet.address);
  if (derivedPub.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (derivedPub[i] !== expected[i]) return false;
  }
  return true;
}
