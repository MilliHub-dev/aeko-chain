import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPreparedCollectionSetupTransaction,
  buildPreparedToken721Transaction,
  token721ProgramId,
} from './nftTransactionBuilder.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes) {
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
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return `${'1'.repeat(zeros)}${digits.reverse().map((digit) => ALPHABET[digit]).join('')}`;
}

function key(fill) {
  return encodeBase58(Uint8Array.from({ length: 32 }, () => fill));
}

function readShortVec(bytes, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (true) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
}

function messageHeader(base64) {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const signatures = readShortVec(bytes, 0);
  const messageOffset = signatures.offset + signatures.value * 64;
  return Array.from(bytes.slice(messageOffset, messageOffset + 3));
}

test('collection setup uses Solana legacy header ordering: signatures, readonly signed, readonly unsigned', () => {
  const authority = key(11);
  const prepared = buildPreparedCollectionSetupTransaction({
    payer: authority,
    recentBlockhash: key(12),
    base: authority,
    collectionAddress: key(13),
    collectionSeed: 'test-collection',
    lamports: 1_000_000,
    space: 512,
    authority,
    name: 'AEKO Test Collection',
    symbol: 'ATC',
    baseUri: 'https://example.test/collection',
  });

  // payer is writable signer; system program and AEKO-721 program are readonly unsigned.
  assert.deepEqual(messageHeader(prepared), [1, 0, 2]);
});

test('single AEKO-721 write keeps the token program in readonly unsigned header count', () => {
  const authority = key(21);
  const prepared = buildPreparedToken721Transaction({
    payer: authority,
    recentBlockhash: key(22),
    action: 'freeze',
    collection: key(23),
    token: key(24),
    authority,
    owner: authority,
    recipient: key(25),
    tokenId: 1,
    royaltyBps: 0,
    metadata: {
      name: 'AEKO Test NFT',
      description: null,
      uri: 'https://example.test/nft/1',
      imageUri: null,
      attributes: [],
    },
  });

  assert.equal(token721ProgramId().length > 0, true);
  // payer/authority is the only signer; AEKO-721 program is the only readonly unsigned key.
  assert.deepEqual(messageHeader(prepared), [1, 0, 1]);
});
