import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPreparedCancelListingTransaction,
  buildPreparedListNftTransaction,
  buildPreparedMintWithAccountSetupTransaction,
} from '../dist/index.js';

// Distinct 32-byte keys so account de-duplication never merges them.
const key = (fill) =>
  encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => (fill * 31 + i) % 256));

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}

/**
 * Reads the legacy message header out of a prepared transaction:
 * shortvec signature count, 64 bytes per signature, then the message.
 */
function headerOf(encoded) {
  const tx = Buffer.from(encoded, 'base64');
  let pos = 0;
  let numSigners = 0;
  let shift = 0;
  let byte;
  do {
    byte = tx[pos++];
    numSigners |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  const message = tx.subarray(pos + numSigners * 64);
  return { numSigners, header: Array.from(message.subarray(0, 3)) };
}

const PAYER = key(1);
const BLOCKHASH = key(2);

// The runtime reads the header as
//   [numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts]
// and rejects any message whose readonly-signed count is not below the signer
// count ("Transaction failed to sanitize accounts offsets correctly"). A
// single-signer message with read-only accounts must therefore be [1, 0, n].

test('ListNft: one signer, no read-only signers, program id read-only', () => {
  const { numSigners, header } = headerOf(
    buildPreparedListNftTransaction({
      payer: PAYER,
      recentBlockhash: BLOCKHASH,
      listingAccount: key(3),
      tokenAccount: key(4),
      seller: PAYER,
      collection: key(5),
      creator: key(6),
      priceLamports: 1_000_000_000n,
      royaltyBps: 500,
      expiresAtSlot: null,
    }),
  );
  assert.equal(numSigners, 1);
  assert.equal(header[0], 1, 'one required signature');
  assert.equal(header[1], 0, 'the fee payer is writable, so no read-only signers');
  assert.ok(header[2] >= 1, 'the program id is a read-only unsigned account');
  assert.ok(header[1] < header[0], 'readonly signed accounts must be fewer than signers');
});

test('CancelListing: header is [1, 0, n]', () => {
  const { header } = headerOf(
    buildPreparedCancelListingTransaction({
      payer: PAYER,
      recentBlockhash: BLOCKHASH,
      listingAccount: key(3),
      seller: PAYER,
    }),
  );
  assert.equal(header[0], 1);
  assert.equal(header[1], 0);
  assert.ok(header[2] >= 1);
});

test('MintWithAccountSetup: two instructions still yield a sane header', () => {
  const { header } = headerOf(
    buildPreparedMintWithAccountSetupTransaction({
      payer: PAYER,
      recentBlockhash: BLOCKHASH,
      tokenAddress: key(7),
      base: PAYER,
      tokenSeed: 'post:test',
      lamports: 2_000_000n,
      space: 512,
      collection: key(8),
      authority: PAYER,
      owner: PAYER,
      tokenId: 42,
      royaltyBps: 250,
      metadata: { name: 'Test', symbol: 'AEKO', uri: 'ipfs://test', attributes: [] },
    }),
  );
  assert.equal(header[0], 1);
  assert.equal(header[1], 0);
  // System program and token-721 program are both read-only and unsigned.
  assert.ok(header[2] >= 2);
});
