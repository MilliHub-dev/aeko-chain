import { signMessage } from './aekoTestKeypair';
import {
  SOCIAL_MONETIZATION_PROGRAM_ID,
  SOCIAL_POSTS_PROGRAM_ID,
  SOCIAL_REWARDS_PROGRAM_ID,
  SOCIAL_STAKING_PROGRAM_ID,
} from './aekoSocial';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ENGAGEMENT = { like: 0, comment: 1, repost: 2, quote: 3, share: 4, save: 5 };

function decode58(value) {
  if (!value) throw new Error('Missing base58 value.');
  const bytes = [0];
  for (const char of String(value).trim()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base58 character ${char}.`);
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
  for (let index = 0; index < value.length && value[index] === '1'; index += 1) bytes.push(0);
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) throw new Error(`Expected a 32-byte key, got ${decoded.length}.`);
  return decoded;
}

function encode58(bytes) {
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

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function shortVec(value) {
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

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Number(value), true);
  return bytes;
}

function u64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function i64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}

function stringBytes(value) {
  const bytes = new TextEncoder().encode(value);
  return concat(u32(bytes.length), bytes);
}

function random32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hash32(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function key(bytes) {
  return Array.from(bytes).join(',');
}

function buildSignedTransaction({ wallet, recentBlockhash, programId, accounts, data }) {
  const payer = decode58(wallet.address);
  const program = decode58(programId);
  const metas = new Map();
  const merge = (address, isSigner, isWritable) => {
    const bytes = typeof address === 'string' ? decode58(address) : address;
    const id = key(bytes);
    const existing = metas.get(id);
    if (existing) {
      existing.isSigner ||= isSigner;
      existing.isWritable ||= isWritable;
    } else {
      metas.set(id, { bytes, isSigner, isWritable });
    }
  };
  merge(payer, true, true);
  accounts.forEach((account) => merge(account.address, Boolean(account.isSigner), Boolean(account.isWritable)));
  merge(program, false, false);

  const payerId = key(payer);
  const payerMeta = metas.get(payerId);
  metas.delete(payerId);
  const remaining = Array.from(metas.values());
  const ordered = [
    payerMeta,
    ...remaining.filter((item) => item.isSigner && item.isWritable),
    ...remaining.filter((item) => item.isSigner && !item.isWritable),
    ...remaining.filter((item) => !item.isSigner && item.isWritable),
    ...remaining.filter((item) => !item.isSigner && !item.isWritable),
  ].filter(Boolean);
  const indices = new Map(ordered.map((item, index) => [key(item.bytes), index]));
  const requiredSignatures = ordered.filter((item) => item.isSigner).length;
  if (requiredSignatures !== 1) throw new Error('AEKO Social test-console actions support one local-wallet signer.');
  const header = Uint8Array.from([
    requiredSignatures,
    ordered.filter((item) => item.isSigner && !item.isWritable).length,
    ordered.filter((item) => !item.isSigner && !item.isWritable).length,
  ]);
  const instructionAccounts = accounts.map((account) => indices.get(key(decode58(account.address))));
  const programIndex = indices.get(key(program));
  const instruction = concat(
    Uint8Array.from([programIndex]),
    shortVec(instructionAccounts.length),
    Uint8Array.from(instructionAccounts),
    shortVec(data.length),
    data,
  );
  const message = concat(
    header,
    shortVec(ordered.length),
    ...ordered.map((item) => item.bytes),
    decode58(recentBlockhash),
    shortVec(1),
    instruction,
  );
  return b64(concat(shortVec(1), signMessage(wallet, message), message));
}

export async function buildEditPostTx({ wallet, postsState, recentBlockhash, postId, contentUri }) {
  const now = Math.floor(Date.now() / 1000);
  const data = concat(
    Uint8Array.from([2]),
    decode58(postId),
    decode58(wallet.address),
    await hash32(contentUri),
    await hash32('aeko-social-edit'),
    stringBytes(contentUri),
    i64(now),
  );
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_POSTS_PROGRAM_ID,
    accounts: [
      { address: postsState, isWritable: true },
      { address: wallet.address, isSigner: true },
    ],
    data,
  });
}

export function buildEngagementTx({ wallet, postsState, antiSpamState, recentBlockhash, post, action }) {
  const actionTag = ENGAGEMENT[action];
  if (actionTag == null) throw new Error(`Unsupported Social engagement ${action}.`);
  const proofId = random32();
  const replayGuard = random32();
  const data = concat(
    Uint8Array.from([4]),
    proofId,
    decode58(wallet.address),
    Uint8Array.from([1]),
    decode58(post.postId),
    decode58(post.creator),
    Uint8Array.from([actionTag]),
    u32(1),
    u64(0),
    i64(Math.floor(Date.now() / 1000)),
    replayGuard,
  );
  return {
    id: encode58(proofId),
    transaction: buildSignedTransaction({
      wallet,
      recentBlockhash,
      programId: SOCIAL_POSTS_PROGRAM_ID,
      accounts: [
        { address: postsState, isWritable: true },
        { address: wallet.address, isSigner: true },
        { address: antiSpamState },
      ],
      data,
    }),
  };
}

export function buildOpenStakeTx({ wallet, stakingState, stakeVault, recentBlockhash, creator, amount, currentEpoch }) {
  const positionId = random32();
  const data = concat(
    Uint8Array.from([1]),
    positionId,
    decode58(wallet.address),
    decode58(creator),
    u64(amount),
    u64(currentEpoch),
    Uint8Array.from([0]),
    u64(0),
    u64(0),
    Uint8Array.from([0]),
  );
  return {
    id: encode58(positionId),
    transaction: buildSignedTransaction({
      wallet,
      recentBlockhash,
      programId: SOCIAL_STAKING_PROGRAM_ID,
      accounts: [
        { address: stakingState, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        { address: stakeVault, isWritable: true },
      ],
      data,
    }),
  };
}

export function buildRequestUnstakeTx({ wallet, stakingState, recentBlockhash, positionId, unlockEpoch }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_STAKING_PROGRAM_ID,
    accounts: [
      { address: stakingState, isWritable: true },
      { address: wallet.address, isSigner: true },
    ],
    data: concat(Uint8Array.from([2]), decode58(positionId), u64(unlockEpoch)),
  });
}

export function buildFinalizeUnstakeTx({ wallet, stakingState, stakeVault, recentBlockhash, positionId, currentEpoch }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_STAKING_PROGRAM_ID,
    accounts: [
      { address: stakingState, isWritable: true },
      { address: wallet.address, isSigner: true, isWritable: true },
      { address: stakeVault, isWritable: true },
    ],
    data: concat(Uint8Array.from([3]), decode58(positionId), u64(currentEpoch)),
  });
}

export function buildClaimStakeYieldTx({ wallet, stakingState, rewardVault, recentBlockhash, positionId, amount }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_STAKING_PROGRAM_ID,
    accounts: [
      { address: stakingState, isWritable: true },
      { address: wallet.address, isSigner: true, isWritable: true },
      { address: rewardVault, isWritable: true },
    ],
    data: concat(Uint8Array.from([5]), decode58(positionId), u64(amount)),
  });
}

export function buildTipTx({ wallet, monetizationState, treasury, recentBlockhash, creator, amount }) {
  const tipId = random32();
  return {
    id: encode58(tipId),
    transaction: buildSignedTransaction({
      wallet,
      recentBlockhash,
      programId: SOCIAL_MONETIZATION_PROGRAM_ID,
      accounts: [
        { address: monetizationState, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        { address: treasury, isWritable: true },
      ],
      data: concat(
        Uint8Array.from([1]), tipId, decode58(creator), decode58(wallet.address),
        u64(amount), i64(Math.floor(Date.now() / 1000)),
      ),
    }),
  };
}

export function buildCreateSubscriptionTx({ wallet, monetizationState, treasury, recentBlockhash, creator, amount, periodSeconds }) {
  const subscriptionId = random32();
  const startedAt = Math.floor(Date.now() / 1000);
  const validUntil = startedAt + Number(periodSeconds);
  return {
    id: encode58(subscriptionId),
    validUntil,
    transaction: buildSignedTransaction({
      wallet,
      recentBlockhash,
      programId: SOCIAL_MONETIZATION_PROGRAM_ID,
      accounts: [
        { address: monetizationState, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        { address: treasury, isWritable: true },
      ],
      data: concat(
        Uint8Array.from([2]), subscriptionId, decode58(creator), decode58(wallet.address),
        u64(amount), u64(periodSeconds), i64(startedAt), i64(validUntil), Uint8Array.from([0]),
      ),
    }),
  };
}

export function buildRenewSubscriptionTx({ wallet, monetizationState, treasury, recentBlockhash, subscriptionId, validUntil }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_MONETIZATION_PROGRAM_ID,
    accounts: [
      { address: monetizationState, isWritable: true },
      { address: wallet.address, isSigner: true, isWritable: true },
      { address: treasury, isWritable: true },
    ],
    data: concat(Uint8Array.from([3]), decode58(subscriptionId), i64(validUntil)),
  });
}

export function buildCancelSubscriptionTx({ wallet, monetizationState, recentBlockhash, subscriptionId }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_MONETIZATION_PROGRAM_ID,
    accounts: [
      { address: monetizationState, isWritable: true },
      { address: wallet.address, isSigner: true },
    ],
    data: concat(Uint8Array.from([4]), decode58(subscriptionId)),
  });
}

export function buildUnlockPaidContentTx({ wallet, monetizationState, treasury, recentBlockhash, post, amount }) {
  const unlockId = random32();
  return {
    id: encode58(unlockId),
    transaction: buildSignedTransaction({
      wallet,
      recentBlockhash,
      programId: SOCIAL_MONETIZATION_PROGRAM_ID,
      accounts: [
        { address: monetizationState, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        { address: treasury, isWritable: true },
      ],
      data: concat(
        Uint8Array.from([5]), unlockId, decode58(post.postId), decode58(post.creator),
        decode58(wallet.address), u64(amount), i64(Math.floor(Date.now() / 1000)),
      ),
    }),
  };
}

export function buildClaimMonetizationTx({ wallet, monetizationState, treasury, recentBlockhash, amount }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_MONETIZATION_PROGRAM_ID,
    accounts: [
      { address: monetizationState, isWritable: true },
      { address: treasury, isWritable: true },
      { address: wallet.address, isWritable: true },
      { address: wallet.address, isSigner: true },
    ],
    data: concat(Uint8Array.from([6]), decode58(wallet.address), u64(amount)),
  });
}

export function buildClaimCreatorRewardTx({ wallet, rewardsState, rewardVault, recentBlockhash, amount }) {
  return buildSignedTransaction({
    wallet,
    recentBlockhash,
    programId: SOCIAL_REWARDS_PROGRAM_ID,
    accounts: [
      { address: rewardsState, isWritable: true },
      { address: rewardVault, isWritable: true },
      { address: wallet.address, isWritable: true },
      { address: wallet.address, isSigner: true },
    ],
    data: concat(Uint8Array.from([3]), decode58(wallet.address), u64(amount)),
  });
}
