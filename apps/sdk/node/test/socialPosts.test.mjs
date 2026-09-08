import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPreparedAnchorPostTransaction } from '../dist/socialPosts.js';

const PAYER = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';
const STATE = '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR';
const BLOCKHASH = 'CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8';
const POST_ID = 'GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq';
const CONTENT_HASH = 'LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY';
const METADATA_HASH = 'QWmroo4YnnMqYW3cnxWkFdaTxGD3P7vMSzwMHGbUzwF';

test('prepared AnchorPost uses the canonical legacy message header order', () => {
  const encoded = buildPreparedAnchorPostTransaction({
    payer: PAYER,
    recentBlockhash: BLOCKHASH,
    stateAccount: STATE,
    creator: PAYER,
    postId: POST_ID,
    contentHash: CONTENT_HASH,
    metadataHash: METADATA_HASH,
    contentUri: 'https://aeko.social/posts/header-contract',
    postKind: 'original',
    createdAtUnix: 1_700_000_000,
    visibility: 'public',
  });

  const transaction = Buffer.from(encoded, 'base64');
  assert.equal(transaction[0], 1, 'prepared transaction should reserve one signature');

  // Legacy transaction = shortvec signature count + 64-byte signature + message.
  // Message header order is [required signatures, readonly signed, readonly unsigned].
  assert.deepEqual(Array.from(transaction.subarray(65, 68)), [1, 0, 1]);
});
