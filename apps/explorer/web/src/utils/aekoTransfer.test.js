import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSignedLegacyTransaction,
  createSystemTransferInstruction,
  encodeBase58,
} from './aekoTransaction.js';
import {
  buildSignedTransfer,
  ensureSecretKeyMatchesAddress,
} from './aekoTransfer.js';
import { generateTestWallet } from './aekoTestKeypair.js';

test('legacy transfer compatibility helper delegates to the canonical transaction builder', () => {
  const sender = generateTestWallet('sender');
  const recipient = generateTestWallet('recipient');
  const recentBlockhash = encodeBase58(new Uint8Array(32).fill(9));
  const lamports = 125000000;

  const actual = buildSignedTransfer({
    fromWallet: sender,
    toAddress: recipient.address,
    lamports,
    recentBlockhash,
  });
  const expected = buildSignedLegacyTransaction({
    feePayer: sender,
    recentBlockhash,
    instructions: [
      createSystemTransferInstruction({
        from: sender.address,
        to: recipient.address,
        lamports,
      }),
    ],
  });

  assert.equal(actual, expected);
  assert.equal(ensureSecretKeyMatchesAddress(sender), true);
});
