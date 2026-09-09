import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenStakeTx, buildTipTx } from './aekoSocialActions.js';
import { encodeBase58, generateTestWallet } from './aekoTestKeypair.js';

function shortVec(bytes, start) {
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

function encodeKey(fill) {
  return encodeBase58(Uint8Array.from({ length: 32 }, () => fill));
}

function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const char of value) {
    let carry = alphabet.indexOf(char);
    assert.notEqual(carry, -1);
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index] * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length && value[index] === '1'; index += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse()).slice(-32);
}

function inspectTransaction(base64) {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const signatures = shortVec(bytes, 0);
  let offset = signatures.offset + signatures.value * 64;
  const requiredSignatures = bytes[offset];
  const readonlySigned = bytes[offset + 1];
  const readonlyUnsigned = bytes[offset + 2];
  offset += 3;
  const accountCount = shortVec(bytes, offset);
  offset = accountCount.offset;
  const accounts = [];
  for (let index = 0; index < accountCount.value; index += 1) {
    accounts.push(bytes.slice(offset, offset + 32));
    offset += 32;
  }
  const unsignedCount = accountCount.value - requiredSignatures;
  const writableUnsignedCount = unsignedCount - readonlyUnsigned;
  const writableSignedCount = requiredSignatures - readonlySigned;
  return {
    requiredSignatures,
    accounts,
    isSigner: (index) => index < requiredSignatures,
    isWritable: (index) => index < writableSignedCount
      || (index >= requiredSignatures && index < requiredSignatures + writableUnsignedCount),
  };
}

function accountIndex(message, address) {
  const expected = Buffer.from(decodeBase58(address));
  return message.accounts.findIndex((account) => Buffer.from(account).equals(expected));
}

test('open stake signs with owned wallet and makes state and principal vault writable', () => {
  const wallet = generateTestWallet('stake contract');
  const stakingState = encodeKey(31);
  const stakeVault = encodeKey(32);
  const creator = encodeKey(33);
  const recentBlockhash = encodeKey(34);
  const built = buildOpenStakeTx({
    wallet,
    stakingState,
    stakeVault,
    recentBlockhash,
    creator,
    amount: 10_000_000,
    currentEpoch: 7,
  });
  const message = inspectTransaction(built.transaction);
  assert.equal(message.requiredSignatures, 1);
  const walletIndex = accountIndex(message, wallet.address);
  const stateIndex = accountIndex(message, stakingState);
  const vaultIndex = accountIndex(message, stakeVault);
  assert.notEqual(walletIndex, -1);
  assert.notEqual(stateIndex, -1);
  assert.notEqual(vaultIndex, -1);
  assert.equal(message.isSigner(walletIndex), true);
  assert.equal(message.isWritable(walletIndex), true);
  assert.equal(message.isWritable(stateIndex), true);
  assert.equal(message.isWritable(vaultIndex), true);
});

test('tip signs with sender and makes monetization state and treasury writable', () => {
  const wallet = generateTestWallet('tip contract');
  const monetizationState = encodeKey(41);
  const treasury = encodeKey(42);
  const creator = encodeKey(43);
  const recentBlockhash = encodeKey(44);
  const built = buildTipTx({
    wallet,
    monetizationState,
    treasury,
    recentBlockhash,
    creator,
    amount: 10_000_000,
  });
  const message = inspectTransaction(built.transaction);
  const walletIndex = accountIndex(message, wallet.address);
  const stateIndex = accountIndex(message, monetizationState);
  const treasuryIndex = accountIndex(message, treasury);
  assert.equal(message.requiredSignatures, 1);
  assert.equal(message.isSigner(walletIndex), true);
  assert.equal(message.isWritable(walletIndex), true);
  assert.equal(message.isWritable(stateIndex), true);
  assert.equal(message.isWritable(treasuryIndex), true);
});
