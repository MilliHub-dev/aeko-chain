const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SYSTEM_PROGRAM_ID_BYTES = new Uint8Array(32);
const TOKEN_721_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));

function decodeBase58(value) {
  if (!value || typeof value !== 'string') {
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

  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) {
    throw new Error(`Expected a 32-byte public key, received ${decoded.length} bytes.`);
  }
  return decoded;
}

function encodeBase64(bytes) {
  let raw = '';
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw);
}

function concatBytes(...parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

function encodeShortVec(value) {
  const bytes = [];
  let remaining = value >>> 0;
  while (true) {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) {
      next |= 0x80;
    }
    bytes.push(next);
    if (remaining === 0) {
      break;
    }
  }
  return Uint8Array.from(bytes);
}

function encodeU16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function encodeU32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function encodeU64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function encodeString(value) {
  const encoded = new TextEncoder().encode(value);
  return concatBytes(encodeU32(encoded.length), encoded);
}

function encodeBincodeString(value) {
  const encoded = new TextEncoder().encode(value);
  return concatBytes(encodeU64(encoded.length), encoded);
}

function encodeOptionString(value) {
  if (!value) {
    return Uint8Array.from([0]);
  }
  return concatBytes(Uint8Array.from([1]), encodeString(value));
}

function encodeMetadataAttribute(attribute) {
  return concatBytes(encodeString(attribute.traitType), encodeString(attribute.value));
}

function encodeMetadata(metadata) {
  const attributes = metadata.attributes || [];
  return concatBytes(
    encodeString(metadata.name),
    encodeOptionString(metadata.description || null),
    encodeString(metadata.uri),
    encodeOptionString(metadata.imageUri || null),
    encodeU32(attributes.length),
    ...attributes.map(encodeMetadataAttribute),
  );
}

function encodeInstructionData(action, args) {
  switch (action) {
    case 'initializeCollection':
      return concatBytes(
        Uint8Array.from([0]),
        encodeString(args.name),
        encodeString(args.symbol),
        encodeOptionString(args.baseUri || null),
      );
    case 'mint':
      return concatBytes(
        Uint8Array.from([1]),
        encodeU64(args.tokenId),
        decodeBase58(args.owner),
        decodeBase58(args.creator),
        encodeU16(args.royaltyBps),
        encodeMetadata(args.metadata),
      );
    case 'freeze':
      return Uint8Array.from([2]);
    case 'thaw':
      return Uint8Array.from([3]);
    case 'transfer':
      return concatBytes(Uint8Array.from([4]), decodeBase58(args.newOwner));
    case 'update':
      return concatBytes(Uint8Array.from([5]), encodeMetadata(args.metadata));
    default:
      throw new Error(`Unsupported AEKO-721 action "${action}".`);
  }
}

function compileInstruction({ action, collection, token, authority, owner, recipient, tokenId, royaltyBps, metadata }) {
  if (action === 'initializeCollection') {
    return {
      programId: TOKEN_721_PROGRAM_ID_BYTES,
      accounts: [
        { pubkey: decodeBase58(collection), isSigner: false, isWritable: true },
        { pubkey: decodeBase58(authority), isSigner: true, isWritable: false },
      ],
      data: encodeInstructionData(action, {
        name: metadata.name,
        symbol: metadata.symbol,
        baseUri: metadata.baseUri || null,
      }),
    };
  }

  if (action === 'mint') {
    return {
      programId: TOKEN_721_PROGRAM_ID_BYTES,
      accounts: [
        { pubkey: decodeBase58(collection), isSigner: false, isWritable: true },
        { pubkey: decodeBase58(token), isSigner: false, isWritable: true },
        { pubkey: decodeBase58(authority), isSigner: true, isWritable: false },
      ],
      data: encodeInstructionData(action, {
        tokenId,
        owner,
        creator: authority,
        royaltyBps,
        metadata,
      }),
    };
  }

  if (action === 'freeze' || action === 'thaw') {
    return {
      programId: TOKEN_721_PROGRAM_ID_BYTES,
      accounts: [
        { pubkey: decodeBase58(token), isSigner: false, isWritable: true },
        { pubkey: decodeBase58(authority), isSigner: true, isWritable: false },
      ],
      data: encodeInstructionData(action, {}),
    };
  }

  if (action === 'transfer') {
    return {
      programId: TOKEN_721_PROGRAM_ID_BYTES,
      accounts: [
        { pubkey: decodeBase58(token), isSigner: false, isWritable: true },
        { pubkey: decodeBase58(owner), isSigner: true, isWritable: false },
      ],
      data: encodeInstructionData(action, {
        newOwner: recipient,
      }),
    };
  }

  return {
    programId: TOKEN_721_PROGRAM_ID_BYTES,
    accounts: [
      { pubkey: decodeBase58(token), isSigner: false, isWritable: true },
      { pubkey: decodeBase58(authority), isSigner: true, isWritable: false },
    ],
    data: encodeInstructionData(action, { metadata }),
  };
}

function buildCreateAccountWithSeedInstruction({
  payer,
  createdAccount,
  base,
  seed,
  lamports,
  space,
  ownerProgram,
}) {
  return {
    programId: SYSTEM_PROGRAM_ID_BYTES,
    accounts: [
      { pubkey: decodeBase58(payer), isSigner: true, isWritable: true },
      { pubkey: decodeBase58(createdAccount), isSigner: false, isWritable: true },
      { pubkey: decodeBase58(base), isSigner: true, isWritable: false },
    ],
    data: concatBytes(
      encodeU32(3),
      decodeBase58(base),
      encodeBincodeString(seed),
      encodeU64(lamports),
      encodeU64(space),
      decodeBase58(ownerProgram),
    ),
  };
}

function buildLegacyMessage({ payer, recentBlockhash, instructions }) {
  const payerBytes = decodeBase58(payer);
  const blockhashBytes = decodeBase58(recentBlockhash);
  const metas = new Map();

  const track = (pubkeyBytes, flags) => {
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
  instructions.forEach((instruction) => {
    instruction.accounts.forEach((account) => track(account.pubkey, account));
    track(instruction.programId, { isSigner: false, isWritable: false });
  });

  const payerKey = Array.from(payerBytes).join(',');
  const payerMeta = metas.get(payerKey);
  metas.delete(payerKey);

  const ordered = [
    payerMeta,
    ...Array.from(metas.values()).filter((meta) => meta.isSigner && meta.isWritable),
    ...Array.from(metas.values()).filter((meta) => meta.isSigner && !meta.isWritable),
    ...Array.from(metas.values()).filter((meta) => !meta.isSigner && meta.isWritable),
    ...Array.from(metas.values()).filter((meta) => !meta.isSigner && !meta.isWritable),
  ];

  const accountIndex = new Map(
    ordered.map((meta, index) => [Array.from(meta.pubkey).join(','), index]),
  );

  const header = Uint8Array.from([
    ordered.filter((meta) => meta.isSigner).length,
    ordered.filter((meta) => !meta.isSigner && !meta.isWritable).length,
    ordered.filter((meta) => meta.isSigner && !meta.isWritable).length,
  ]);

  const compiledInstructions = instructions.map((instruction) =>
    concatBytes(
      Uint8Array.from([
        accountIndex.get(Array.from(instruction.programId).join(',')),
      ]),
      encodeShortVec(instruction.accounts.length),
      Uint8Array.from(
        instruction.accounts.map((account) => accountIndex.get(Array.from(account.pubkey).join(','))),
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

function buildPreparedTransaction({ payer, recentBlockhash, instructions }) {
  const { messageBytes, numSigners } = buildLegacyMessage({
    payer,
    recentBlockhash,
    instructions,
  });

  const signatureSection = concatBytes(
    encodeShortVec(numSigners),
    ...Array.from({ length: numSigners }, () => new Uint8Array(64)),
  );

  return encodeBase64(concatBytes(signatureSection, messageBytes));
}

export function buildPreparedToken721Transaction({
  payer,
  recentBlockhash,
  action,
  collection,
  token,
  authority,
  owner,
  recipient,
  tokenId,
  royaltyBps,
  metadata,
}) {
  return buildPreparedTransaction({
    payer,
    recentBlockhash,
    instructions: [
      compileInstruction({
        action,
        collection,
        token,
        authority,
        owner,
        recipient,
        tokenId,
        royaltyBps,
        metadata,
      }),
    ],
  });
}

export function estimateCollectionAccountSpace({ name, symbol, baseUri }) {
  return (
    32 +
    4 + new TextEncoder().encode(name).length +
    4 + new TextEncoder().encode(symbol).length +
    1 + (baseUri ? 4 + new TextEncoder().encode(baseUri).length : 0) +
    8 +
    1
  );
}

export function estimateTokenAccountSpace({ metadata }) {
  const descriptionLength = metadata.description ? new TextEncoder().encode(metadata.description).length : 0;
  const imageUriLength = metadata.imageUri ? new TextEncoder().encode(metadata.imageUri).length : 0;
  const attributesLength = (metadata.attributes || []).reduce((sum, attribute) => {
    return (
      sum +
      4 + new TextEncoder().encode(attribute.traitType).length +
      4 + new TextEncoder().encode(attribute.value).length
    );
  }, 0);

  return (
    32 +
    8 +
    32 +
    32 +
    2 +
    4 + new TextEncoder().encode(metadata.name).length +
    1 + (metadata.description ? 4 + descriptionLength : 0) +
    4 + new TextEncoder().encode(metadata.uri).length +
    1 + (metadata.imageUri ? 4 + imageUriLength : 0) +
    4 + attributesLength +
    1 +
    1
  );
}

function encodeBase58(bytes) {
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

export function token721ProgramId() {
  return encodeBase58(TOKEN_721_PROGRAM_ID_BYTES);
}

export async function deriveToken721AddressWithSeed(base, seed) {
  const derived = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      concatBytes(
        decodeBase58(base),
        new TextEncoder().encode(seed),
        TOKEN_721_PROGRAM_ID_BYTES,
      ),
    ),
  );
  return encodeBase58(derived);
}

export function buildPreparedCollectionSetupTransaction({
  payer,
  recentBlockhash,
  base,
  collectionAddress,
  collectionSeed,
  lamports,
  space,
  authority,
  name,
  symbol,
  baseUri,
}) {
  return buildPreparedTransaction({
    payer,
    recentBlockhash,
    instructions: [
      buildCreateAccountWithSeedInstruction({
        payer,
        createdAccount: collectionAddress,
        base,
        seed: collectionSeed,
        lamports,
        space,
        ownerProgram: token721ProgramId(),
      }),
      compileInstruction({
        action: 'initializeCollection',
        collection: collectionAddress,
        authority,
        metadata: { name, symbol, baseUri },
      }),
    ],
  });
}

export function buildPreparedMintWithAccountSetupTransaction({
  payer,
  recentBlockhash,
  base,
  tokenAddress,
  tokenSeed,
  lamports,
  space,
  collection,
  authority,
  owner,
  tokenId,
  royaltyBps,
  metadata,
}) {
  return buildPreparedTransaction({
    payer,
    recentBlockhash,
    instructions: [
      buildCreateAccountWithSeedInstruction({
        payer,
        createdAccount: tokenAddress,
        base,
        seed: tokenSeed,
        lamports,
        space,
        ownerProgram: token721ProgramId(),
      }),
      compileInstruction({
        action: 'mint',
        collection,
        token: tokenAddress,
        authority,
        owner,
        tokenId,
        royaltyBps,
        metadata,
      }),
    ],
  });
}
