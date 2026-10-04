import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import nacl from 'tweetnacl';
import { generateTestWallet, getSecretKeyBytes } from './aekoTestKeypair.js';
import {
  SYSTEM_PROGRAM_ID,
  buildSignedLegacyTransaction,
  createSystemAccountInstruction,
  decodeBase58,
  encodeBase58,
  generateEphemeralSigner,
} from './aekoTransaction.js';

function decodeBase64(value) {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

test('base58 public keys roundtrip exactly', () => {
  for (const value of [
    SYSTEM_PROGRAM_ID,
    'BPFLoaderUpgradeab1e11111111111111111111111',
    'SysvarRent111111111111111111111111111111111',
  ]) {
    assert.equal(encodeBase58(decodeBase58(value)), value);
  }
});

test('legacy transaction signs fee payer and created account in canonical signer order', () => {
  const payer = generateTestWallet('payer');
  const program = generateEphemeralSigner();
  const recentBlockhash = encodeBase58(new Uint8Array(32).fill(7));
  const instruction = createSystemAccountInstruction({
    from: payer.address,
    newAccount: program.address,
    lamports: 12345,
    space: 36,
    owner: SYSTEM_PROGRAM_ID,
  });

  const encoded = buildSignedLegacyTransaction({
    feePayer: payer,
    recentBlockhash,
    instructions: [instruction],
    additionalSigners: [program],
  });
  const bytes = decodeBase64(encoded);

  assert.equal(bytes[0], 2, 'two signatures should be serialized');
  const firstSignature = bytes.slice(1, 65);
  const secondSignature = bytes.slice(65, 129);
  const message = bytes.slice(129);

  const payerPublicKey = getSecretKeyBytes(payer).slice(32);
  assert.equal(nacl.sign.detached.verify(message, firstSignature, payerPublicKey), true);
  assert.equal(nacl.sign.detached.verify(message, secondSignature, decodeBase58(program.address)), true);
  assert.equal(message[0], 2, 'message header should require two signatures');
});

test('system create-account instruction uses the canonical 52-byte wire payload', () => {
  const payer = generateTestWallet('payer');
  const program = generateEphemeralSigner();
  const instruction = createSystemAccountInstruction({
    from: payer.address,
    newAccount: program.address,
    lamports: 1,
    space: 36,
    owner: SYSTEM_PROGRAM_ID,
  });
  assert.equal(instruction.data.length, 52);
  assert.deepEqual(Array.from(instruction.data.slice(0, 4)), [0, 0, 0, 0]);
});
