import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSignedAnchorPostTx,
  decodeSocialPostsStateAccount,
  randomBytes32,
  sha256,
} from './aekoSocial.js';
import { encodeBase58, generateTestWallet } from './aekoTestKeypair.js';

function readShortVec(bytes, cursor) {
  let value = 0;
  let shift = 0;
  while (true) {
    const byte = bytes[cursor.offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
  }
}

function decodeAnchorTransaction(base64) {
  const tx = Uint8Array.from(Buffer.from(base64, 'base64'));
  const cursor = { offset: 0 };
  const signatureCount = readShortVec(tx, cursor);
  cursor.offset += signatureCount * 64;

  const header = tx.slice(cursor.offset, cursor.offset + 3);
  cursor.offset += 3;
  const accountCount = readShortVec(tx, cursor);
  cursor.offset += accountCount * 32;
  cursor.offset += 32; // recent blockhash
  const instructionCount = readShortVec(tx, cursor);
  assert.equal(instructionCount, 1);
  const programIdIndex = tx[cursor.offset++];
  const instructionAccountCount = readShortVec(tx, cursor);
  const accounts = Array.from(
    tx.slice(cursor.offset, cursor.offset + instructionAccountCount),
  );

  return { signatureCount, header: Array.from(header), accountCount, programIdIndex, accounts };
}

function makeMinimalPaddedPostsState({ trailingGarbage = false } = {}) {
  const serialized = new Uint8Array(1 + 32 + 1 + 1 + 2 + 4 + 4);
  let offset = 0;
  serialized[offset++] = 1; // initialized
  serialized.fill(7, offset, offset + 32); // authority
  offset += 32;
  serialized[offset++] = 1; // posting enabled
  serialized[offset++] = 1; // engagement enabled
  new DataView(serialized.buffer).setUint16(offset, 280, true);
  offset += 2;
  new DataView(serialized.buffer).setUint32(offset, 0, true); // empty posts Vec
  offset += 4;
  new DataView(serialized.buffer).setUint32(offset, 0, true); // empty proofs Vec

  const padded = new Uint8Array(serialized.length + 32);
  padded.set(serialized);
  if (trailingGarbage) padded[padded.length - 1] = 9;
  return Buffer.from(padded).toString('base64');
}

test('AnchorPost browser transaction supplies the anti-spam state account required by the Rust processor', async () => {
  const wallet = generateTestWallet('contract-test');
  const postsState = encodeBase58(new Uint8Array(32).fill(21));
  const antiSpamState = encodeBase58(new Uint8Array(32).fill(22));
  const recentBlockhash = encodeBase58(new Uint8Array(32).fill(23));
  const content = 'wire contract test';

  const transaction = buildSignedAnchorPostTx({
    creatorWallet: wallet,
    stateAccount: postsState,
    antiSpamStateAccount: antiSpamState,
    recentBlockhash,
    postId: randomBytes32(),
    contentHash: await sha256(content),
    metadataHash: await sha256('{}'),
    contentUri: content,
    createdAtUnix: 1_700_000_000,
  });

  const decoded = decodeAnchorTransaction(transaction);
  assert.equal(decoded.signatureCount, 1);
  assert.deepEqual(decoded.header, [1, 0, 1]);
  assert.equal(decoded.accountCount, 4);
  assert.equal(decoded.programIdIndex, 3);
  assert.deepEqual(decoded.accounts, [1, 0, 2]);
});

test('padded Social Posts Borsh decoder preserves legitimate trailing zero-valued fields', () => {
  const decoded = decodeSocialPostsStateAccount(makeMinimalPaddedPostsState());
  assert.equal(decoded.isInitialized, true);
  assert.equal(decoded.config.maxContentUriLen, 280);
  assert.deepEqual(decoded.posts, []);
  assert.deepEqual(decoded.engagementProofs, []);
});

test('padded Social Posts Borsh decoder rejects non-zero unread trailing data', () => {
  assert.throws(
    () => decodeSocialPostsStateAccount(makeMinimalPaddedPostsState({ trailingGarbage: true })),
    /non-zero trailing data/,
  );
});
