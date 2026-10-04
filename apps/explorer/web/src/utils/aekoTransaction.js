import nacl from 'tweetnacl';
import { signMessage } from './aekoTestKeypair.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const UPGRADEABLE_LOADER_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const RENT_SYSVAR_ID = 'SysvarRent111111111111111111111111111111111';
export const CLOCK_SYSVAR_ID = 'SysvarC1ock11111111111111111111111111111111';

export function decodeBase58(value) {
  if (!value || typeof value !== 'string') throw new Error('Missing base58 value.');
  const input = value.trim();
  const bytes = [];
  for (const char of input) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base58 character "${char}".`);
    let carry = index;
    for (let offset = 0; offset < bytes.length; offset += 1) {
      const next = bytes[offset] * 58 + carry;
      bytes[offset] = next & 0xff;
      carry = next >> 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < input.length && input[index] === '1'; index += 1) {
    bytes.push(0);
  }
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) {
    throw new Error(`Expected a 32-byte public key, got ${decoded.length}.`);
  }
  return decoded;
}

export function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index];
    for (let digit = 0; digit < digits.length; digit += 1) {
      const value = digits[digit] * 256 + carry;
      digits[digit] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return `${'1'.repeat(zeros)}${digits.reverse().map((digit) => ALPHABET[digit]).join('')}`;
}

export function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function encodeShortVec(value) {
  const output = [];
  let remaining = value >>> 0;
  do {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) next |= 0x80;
    output.push(next);
  } while (remaining);
  return Uint8Array.from(output);
}

export function encodeU32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Number(value), true);
  return bytes;
}

export function encodeU64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function keyOf(bytes) {
  return Array.from(bytes).join(',');
}

export function generateEphemeralSigner() {
  const pair = nacl.sign.keyPair();
  return {
    address: encodeBase58(pair.publicKey),
    secretKey: pair.secretKey,
  };
}

export function createSystemAccountInstruction({ from, newAccount, lamports, space, owner }) {
  return {
    programId: SYSTEM_PROGRAM_ID,
    keys: [
      { address: from, isSigner: true, isWritable: true },
      { address: newAccount, isSigner: true, isWritable: true },
    ],
    data: concatBytes(
      encodeU32(0),
      encodeU64(lamports),
      encodeU64(space),
      decodeBase58(owner),
    ),
  };
}

export function buildSignedLegacyTransaction({
  feePayer,
  recentBlockhash,
  instructions,
  additionalSigners = [],
}) {
  if (!feePayer?.address) throw new Error('A fee payer wallet is required.');
  if (!Array.isArray(instructions) || instructions.length === 0) {
    throw new Error('At least one instruction is required.');
  }

  const metas = new Map();
  const merge = (address, isSigner, isWritable) => {
    const bytes = typeof address === 'string' ? decodeBase58(address) : address;
    const id = keyOf(bytes);
    const existing = metas.get(id);
    if (existing) {
      existing.isSigner ||= Boolean(isSigner);
      existing.isWritable ||= Boolean(isWritable);
      return;
    }
    metas.set(id, { bytes, isSigner: Boolean(isSigner), isWritable: Boolean(isWritable) });
  };

  const payerBytes = decodeBase58(feePayer.address);
  merge(payerBytes, true, true);
  for (const instruction of instructions) {
    for (const account of instruction.keys || []) {
      merge(account.address, account.isSigner, account.isWritable);
    }
    merge(instruction.programId, false, false);
  }

  const payerKey = keyOf(payerBytes);
  const payer = metas.get(payerKey);
  metas.delete(payerKey);
  const remaining = Array.from(metas.values());
  const ordered = [
    payer,
    ...remaining.filter((item) => item.isSigner && item.isWritable),
    ...remaining.filter((item) => item.isSigner && !item.isWritable),
    ...remaining.filter((item) => !item.isSigner && item.isWritable),
    ...remaining.filter((item) => !item.isSigner && !item.isWritable),
  ].filter(Boolean);

  if (ordered.length > 256) throw new Error('Transaction contains too many account keys.');
  const requiredSignatures = ordered.filter((item) => item.isSigner).length;
  const readonlySigned = ordered.filter((item) => item.isSigner && !item.isWritable).length;
  const readonlyUnsigned = ordered.filter((item) => !item.isSigner && !item.isWritable).length;
  const indices = new Map(ordered.map((item, index) => [keyOf(item.bytes), index]));

  const compiled = instructions.map((instruction) => {
    const accountIndices = (instruction.keys || []).map((account) => {
      const index = indices.get(keyOf(decodeBase58(account.address)));
      if (index == null) throw new Error(`Instruction account ${account.address} is missing.`);
      return index;
    });
    const programIndex = indices.get(keyOf(decodeBase58(instruction.programId)));
    if (programIndex == null) throw new Error(`Program ${instruction.programId} is missing.`);
    const data = instruction.data || new Uint8Array();
    return concatBytes(
      Uint8Array.from([programIndex]),
      encodeShortVec(accountIndices.length),
      Uint8Array.from(accountIndices),
      encodeShortVec(data.length),
      data,
    );
  });

  const message = concatBytes(
    Uint8Array.from([requiredSignatures, readonlySigned, readonlyUnsigned]),
    encodeShortVec(ordered.length),
    ...ordered.map((item) => item.bytes),
    decodeBase58(recentBlockhash),
    encodeShortVec(compiled.length),
    ...compiled,
  );

  const localSigners = new Map(
    additionalSigners.map((signer) => [signer.address, signer]),
  );
  const signatures = ordered.slice(0, requiredSignatures).map((meta) => {
    const address = encodeBase58(meta.bytes);
    if (address === feePayer.address) return signMessage(feePayer, message);
    const signer = localSigners.get(address);
    if (!signer?.secretKey) {
      throw new Error(`Missing local signer for ${address}.`);
    }
    return nacl.sign.detached(message, signer.secretKey);
  });

  return bytesToBase64(
    concatBytes(encodeShortVec(signatures.length), ...signatures, message),
  );
}
