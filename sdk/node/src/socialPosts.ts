import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

export type PublicKeyString = string;

const SOCIAL_POSTS_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(17));
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type SocialPostKind = 'original' | 'reply' | 'repost' | 'quote';
export type SocialVisibilityClass = 'public' | 'followersOnly' | 'permissioned' | 'paid';

export interface CanonicalPostPayloadInput {
  version?: number;
  postId: string;
  creator: PublicKeyString;
  contentHash: string;
  metadataHash: string;
  contentUri: string;
  parentPostId?: string | null;
  postKind: SocialPostKind;
  createdAtUnix: number;
  visibility: SocialVisibilityClass;
}

export interface VerifiedPostEnvelopeInput {
  signer: PublicKeyString;
  payload: string | Uint8Array;
  signature: string | Uint8Array;
  signatureEncoding?: 'base64' | 'hex' | 'base58';
}

export interface AnchorPostTransactionInput {
  payer: PublicKeyString;
  recentBlockhash: PublicKeyString;
  stateAccount: PublicKeyString;
  creator: PublicKeyString;
  postId: string;
  contentHash: string;
  metadataHash: string;
  contentUri: string;
  parentPostId?: string | null;
  postKind: SocialPostKind;
  createdAtUnix: number;
  visibility: SocialVisibilityClass;
  signatureRef?: string | null;
}

export interface PostHashBundle {
  contentHashHex: string;
  contentHashBase58: string;
  metadataHashHex: string;
  metadataHashBase58: string;
  payloadHashHex: string;
  payloadHashBase58: string;
  payloadBytes: Uint8Array;
}

export function socialPostsProgramId(): PublicKeyString {
  return encodeBase58(SOCIAL_POSTS_PROGRAM_ID_BYTES);
}

export function buildCanonicalPostPayload(input: CanonicalPostPayloadInput): string {
  return JSON.stringify({
    version: input.version ?? 1,
    postId: input.postId,
    creator: input.creator,
    contentHash: input.contentHash,
    metadataHash: input.metadataHash,
    contentUri: input.contentUri,
    parentPostId: input.parentPostId ?? null,
    postKind: input.postKind,
    createdAtUnix: input.createdAtUnix,
    visibility: input.visibility,
  });
}

export function serializeCanonicalPostPayload(input: CanonicalPostPayloadInput): Uint8Array {
  return new TextEncoder().encode(buildCanonicalPostPayload(input));
}

export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hasher = createHash('sha256');
  hasher.update(typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input));
  return new Uint8Array(hasher.digest());
}

export function sha256Hex(input: string | Uint8Array): string {
  return Buffer.from(sha256Bytes(input)).toString('hex');
}

export function buildPostHashBundle(input: {
  content: string | Uint8Array;
  metadata: string | Uint8Array;
  canonicalPayload: CanonicalPostPayloadInput;
}): PostHashBundle {
  const payloadBytes = serializeCanonicalPostPayload(input.canonicalPayload);
  const contentHash = sha256Bytes(input.content);
  const metadataHash = sha256Bytes(input.metadata);
  const payloadHash = sha256Bytes(payloadBytes);

  return {
    contentHashHex: Buffer.from(contentHash).toString('hex'),
    contentHashBase58: encodeBase58(contentHash),
    metadataHashHex: Buffer.from(metadataHash).toString('hex'),
    metadataHashBase58: encodeBase58(metadataHash),
    payloadHashHex: Buffer.from(payloadHash).toString('hex'),
    payloadHashBase58: encodeBase58(payloadHash),
    payloadBytes,
  };
}

export function verifyPostSignature(input: VerifiedPostEnvelopeInput): boolean {
  const signatureBytes = normalizeSignatureBytes(input.signature, input.signatureEncoding ?? 'base64');
  const payloadBytes =
    typeof input.payload === 'string' ? Buffer.from(input.payload, 'utf8') : Buffer.from(input.payload);
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(decodeBase58(input.signer))]),
    format: 'der',
    type: 'spki',
  });

  return verifySignature(null, payloadBytes, publicKey, signatureBytes);
}

export function buildPreparedAnchorPostTransaction(input: AnchorPostTransactionInput): string {
  const instructionData = concatBytes(
    Uint8Array.from([1]),
    encodeFixed32(input.postId),
    encodePubkey(input.creator),
    encodeFixed32(input.contentHash),
    encodeFixed32(input.metadataHash),
    encodeString(input.contentUri),
    encodeOptionFixed32(input.parentPostId),
    encodePostKind(input.postKind),
    encodeI64(input.createdAtUnix),
    Uint8Array.from([0]),
    encodeVisibilityClass(input.visibility),
    Uint8Array.from([0]),
    encodeOptionFixed32(input.signatureRef),
  );

  return buildPreparedTransaction({
    payer: input.payer,
    recentBlockhash: input.recentBlockhash,
    instructions: [
      {
        programId: SOCIAL_POSTS_PROGRAM_ID_BYTES,
        accounts: [
          { pubkey: encodePubkey(input.stateAccount), isSigner: false, isWritable: true },
          { pubkey: encodePubkey(input.creator), isSigner: true, isWritable: false },
        ],
        data: instructionData,
      },
    ],
  });
}

function normalizeSignatureBytes(
  signature: string | Uint8Array,
  encoding: 'base64' | 'hex' | 'base58',
): Uint8Array {
  if (signature instanceof Uint8Array) {
    return signature;
  }

  if (encoding === 'hex') {
    return new Uint8Array(Buffer.from(signature, 'hex'));
  }

  if (encoding === 'base58') {
    return decodeBase58(signature);
  }

  return new Uint8Array(Buffer.from(signature, 'base64'));
}

function encodePubkey(value: PublicKeyString): Uint8Array {
  return decodeBase58(value);
}

function encodeFixed32(value: string): Uint8Array {
  const bytes = decodeBase58(value);
  if (bytes.length !== 32) {
    throw new Error('Expected a 32-byte base58 value.');
  }
  return bytes;
}

function encodeOptionFixed32(value?: string | null): Uint8Array {
  if (!value) {
    return Uint8Array.from([0]);
  }
  return concatBytes(Uint8Array.from([1]), encodeFixed32(value));
}

function encodeString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concatBytes(encodeU32(encoded.length), encoded);
}

function encodeU32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function encodeI64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}

function encodePostKind(value: SocialPostKind): Uint8Array {
  switch (value) {
    case 'original':
      return Uint8Array.from([0]);
    case 'reply':
      return Uint8Array.from([1]);
    case 'repost':
      return Uint8Array.from([2]);
    case 'quote':
      return Uint8Array.from([3]);
  }
}

function encodeVisibilityClass(value: SocialVisibilityClass): Uint8Array {
  switch (value) {
    case 'public':
      return Uint8Array.from([0]);
    case 'followersOnly':
      return Uint8Array.from([1]);
    case 'permissioned':
      return Uint8Array.from([2]);
    case 'paid':
      return Uint8Array.from([3]);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function encodeShortVec(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (true) {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) next |= 0x80;
    bytes.push(next);
    if (remaining === 0) break;
  }
  return Uint8Array.from(bytes);
}

function buildLegacyMessage(input: {
  payer: PublicKeyString;
  recentBlockhash: PublicKeyString;
  instructions: Array<{
    programId: Uint8Array;
    accounts: Array<{ pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>;
    data: Uint8Array;
  }>;
}) {
  const payerBytes = decodeBase58(input.payer);
  const blockhashBytes = decodeBase58(input.recentBlockhash);
  const metas = new Map<string, { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>();

  const track = (
    pubkeyBytes: Uint8Array,
    flags: { isSigner: boolean; isWritable: boolean },
  ) => {
    const key = Array.from(pubkeyBytes).join(',');
    const current = metas.get(key);
    if (current) {
      current.isSigner ||= flags.isSigner;
      current.isWritable ||= flags.isWritable;
      return;
    }
    metas.set(key, { pubkey: pubkeyBytes, isSigner: flags.isSigner, isWritable: flags.isWritable });
  };

  track(payerBytes, { isSigner: true, isWritable: true });
  input.instructions.forEach((instruction) => {
    instruction.accounts.forEach((account) => track(account.pubkey, account));
    track(instruction.programId, { isSigner: false, isWritable: false });
  });

  const payerKey = Array.from(payerBytes).join(',');
  const payerMeta = metas.get(payerKey);
  metas.delete(payerKey);

  const remaining = Array.from(metas.values());
  const ordered = [
    payerMeta,
    ...remaining.filter((meta) => meta.isSigner && meta.isWritable),
    ...remaining.filter((meta) => meta.isSigner && !meta.isWritable),
    ...remaining.filter((meta) => !meta.isSigner && meta.isWritable),
    ...remaining.filter((meta) => !meta.isSigner && !meta.isWritable),
  ].filter(Boolean) as Array<{ pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>;

  const accountIndex = new Map(ordered.map((meta, index) => [Array.from(meta.pubkey).join(','), index]));

  const header = Uint8Array.from([
    ordered.filter((meta) => meta.isSigner).length,
    ordered.filter((meta) => !meta.isSigner && !meta.isWritable).length,
    ordered.filter((meta) => meta.isSigner && !meta.isWritable).length,
  ]);

  const compiledInstructions = input.instructions.map((instruction) =>
    concatBytes(
      Uint8Array.from([accountIndex.get(Array.from(instruction.programId).join(',')) ?? 0]),
      encodeShortVec(instruction.accounts.length),
      Uint8Array.from(
        instruction.accounts.map(
          (account) => accountIndex.get(Array.from(account.pubkey).join(',')) ?? 0,
        ),
      ),
      encodeShortVec(instruction.data.length),
      instruction.data,
    ),
  );

  return {
    messageBytes: concatBytes(
      header,
      encodeShortVec(ordered.length),
      ...ordered.map((meta) => meta.pubkey),
      blockhashBytes,
      encodeShortVec(compiledInstructions.length),
      ...compiledInstructions,
    ),
    numSigners: ordered.filter((meta) => meta.isSigner).length,
  };
}

function buildPreparedTransaction(input: {
  payer: PublicKeyString;
  recentBlockhash: PublicKeyString;
  instructions: Array<{
    programId: Uint8Array;
    accounts: Array<{ pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>;
    data: Uint8Array;
  }>;
}): string {
  const { messageBytes, numSigners } = buildLegacyMessage(input);
  const signatureSection = concatBytes(
    encodeShortVec(numSigners),
    ...Array.from({ length: numSigners }, () => new Uint8Array(64)),
  );
  return encodeBase64(concatBytes(signatureSection, messageBytes));
}

function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return '';

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) {
    encoded += '1';
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    encoded += BASE58_ALPHABET[digits[i]];
  }
  return encoded;
}

function decodeBase58(value: string): Uint8Array {
  if (!value.trim()) {
    throw new Error('A required public key is missing.');
  }

  const bytes = [0];
  for (const char of value.trim()) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base58 character "${char}" in public key.`);
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

  for (let i = 0; i < value.length && value[i] === '1'; i += 1) {
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}
