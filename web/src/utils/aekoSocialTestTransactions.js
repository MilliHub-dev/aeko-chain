// Signed browser transactions used only by the Explorer SocialFi test page.
// They intentionally exercise the native program account contracts directly.
// Test wallets are the existing localStorage-only testnet wallets; never use
// these helpers as a production custody implementation.
import { signMessage } from './aekoTestKeypair';
import {
  SOCIAL_ANTI_SPAM_PROGRAM_ID,
  SOCIAL_MONETIZATION_PROGRAM_ID,
  SOCIAL_POSTS_PROGRAM_ID,
  SOCIAL_STAKING_PROGRAM_ID,
} from './aekoSocial';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value) {
  if (!value || typeof value !== 'string') throw new Error('Missing base58 public key.');
  const bytes = [0];
  for (const char of value.trim()) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base58 character "${char}".`);
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
  for (let i = 0; i < value.length && value[i] === '1'; i += 1) bytes.push(0);
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) throw new Error(`Expected a 32-byte public key, got ${decoded.length}.`);
  return decoded;
}

function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) encoded += BASE58_ALPHABET[digits[i]];
  return encoded;
}

function concat(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function shortVec(value) {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) next |= 0x80;
    bytes.push(next);
  } while (remaining);
  return Uint8Array.from(bytes);
}

function u32LE(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Number(value), true);
  return bytes;
}

function u64LE(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function i64LE(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}

function stringBytes(value) {
  const bytes = new TextEncoder().encode(value);
  return concat(u32LE(bytes.length), bytes);
}

function random32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256(value) {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

function keyString(bytes) {
  return Array.from(bytes).join(',');
}

function buildAndSign({ wallet, recentBlockhash, programId, accounts, data }) {
  const payer = decodeBase58(wallet.address);
  const program = decodeBase58(programId);
  const blockhash = decodeBase58(recentBlockhash);
  const metas = new Map();

  const track = (pubkey, isSigner, isWritable) => {
    const key = keyString(pubkey);
    const current = metas.get(key);
    if (current) {
      current.isSigner ||= isSigner;
      current.isWritable ||= isWritable;
      return;
    }
    metas.set(key, { pubkey, isSigner, isWritable });
  };

  track(payer, true, true);
  for (const account of accounts) {
    track(decodeBase58(account.address), Boolean(account.isSigner), Boolean(account.isWritable));
  }
  track(program, false, false);

  const payerKey = keyString(payer);
  const payerMeta = metas.get(payerKey);
  metas.delete(payerKey);
  const rest = Array.from(metas.values());
  const ordered = [
    payerMeta,
    ...rest.filter((meta) => meta.isSigner && meta.isWritable),
    ...rest.filter((meta) => meta.isSigner && !meta.isWritable),
    ...rest.filter((meta) => !meta.isSigner && meta.isWritable),
    ...rest.filter((meta) => !meta.isSigner && !meta.isWritable),
  ].filter(Boolean);
  if (ordered.length > 255) throw new Error('Transaction has too many account keys.');

  const index = new Map(ordered.map((meta, position) => [keyString(meta.pubkey), position]));
  const numRequiredSignatures = ordered.filter((meta) => meta.isSigner).length;
  const numReadonlySigned = ordered.filter((meta) => meta.isSigner && !meta.isWritable).length;
  const numReadonlyUnsigned = ordered.filter((meta) => !meta.isSigner && !meta.isWritable).length;
  const header = Uint8Array.from([
    numRequiredSignatures,
    numReadonlySigned,
    numReadonlyUnsigned,
  ]);

  const instructionAccounts = accounts.map((account) => {
    const accountIndex = index.get(keyString(decodeBase58(account.address)));
    if (accountIndex == null) throw new Error(`Missing message account ${account.address}.`);
    return accountIndex;
  });
  const programIdIndex = index.get(keyString(program));
  if (programIdIndex == null) throw new Error('Program id missing from message.');

  const compiledInstruction = concat(
    Uint8Array.from([programIdIndex]),
    shortVec(instructionAccounts.length),
    Uint8Array.from(instructionAccounts),
    shortVec(data.length),
    data,
  );
  const message = concat(
    header,
    shortVec(ordered.length),
    ...ordered.map((meta) => meta.pubkey),
    blockhash,
    shortVec(1),
    compiledInstruction,
  );
  if (numRequiredSignatures !== 1) {
    throw new Error('SocialFi browser tests only support one test-wallet signer.');
  }
  const signature = signMessage(wallet, message);
  return base64(concat(shortVec(1), signature, message));
}

function antiSpamAccount(antiSpamState) {
  if (!antiSpamState) return [];
  return [{ address: antiSpamState, isSigner: false, isWritable: false }];
}

export async function buildSocialPostTestTx({
  wallet,
  postsState,
  antiSpamState,
  recentBlockhash,
  contentUri,
}) {
  const postId = random32();
  const creator = decodeBase58(wallet.address);
  const createdAt = Math.floor(Date.now() / 1000);
  const contentHash = await sha256(contentUri);
  const metadataHash = await sha256('aeko-social-test');
  const data = concat(
    Uint8Array.from([1]), // AnchorPost
    postId,
    creator,
    contentHash,
    metadataHash,
    stringBytes(contentUri),
    Uint8Array.from([0]), // parent_post_id=None
    Uint8Array.from([0]), // PostKind::Original
    i64LE(createdAt),
    Uint8Array.from([0]), // edited_at_unix=None
    Uint8Array.from([0]), // VisibilityClass::Public
    Uint8Array.from([0]), // ModerationState::Active
    Uint8Array.from([0]), // signature_ref=None
  );
  return {
    id: encodeBase58(postId),
    transaction: buildAndSign({
      wallet,
      recentBlockhash,
      programId: SOCIAL_POSTS_PROGRAM_ID,
      accounts: [
        { address: postsState, isSigner: false, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        ...antiSpamAccount(antiSpamState),
      ],
      data,
    }),
  };
}

export function buildSocialLikeTestTx({
  wallet,
  postsState,
  antiSpamState,
  recentBlockhash,
  postId,
  postIdHex,
  targetCreator,
}) {
  const proofId = random32();
  const replayGuard = random32();
  // postIdHex is kept as a compatibility alias for the pre-base58 E2E caller.
  // Both values now carry the canonical base58 Explorer identifier.
  const targetPostId = decodeBase58(postId || postIdHex);
  const data = concat(
    Uint8Array.from([4]), // RecordEngagement
    proofId,
    decodeBase58(wallet.address),
    Uint8Array.from([1]),
    targetPostId,
    decodeBase58(targetCreator),
    Uint8Array.from([0]), // Like
    u32LE(1),
    u64LE(0), // runtime stamps canonical slot
    i64LE(Math.floor(Date.now() / 1000)), // runtime stamps canonical timestamp
    replayGuard,
  );
  return {
    id: encodeBase58(proofId),
    transaction: buildAndSign({
      wallet,
      recentBlockhash,
      programId: SOCIAL_POSTS_PROGRAM_ID,
      accounts: [
        { address: postsState, isSigner: false, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
        ...antiSpamAccount(antiSpamState),
      ],
      data,
    }),
  };
}

export function buildSocialStakeTestTx({
  wallet,
  stakingState,
  recentBlockhash,
  creator,
  amount,
  currentEpoch,
}) {
  const positionId = random32();
  const data = concat(
    Uint8Array.from([1]), // OpenPosition
    positionId,
    decodeBase58(wallet.address),
    decodeBase58(creator),
    u64LE(amount),
    u64LE(currentEpoch),
    Uint8Array.from([0]), // unlock_epoch=None
    u64LE(0),
    u64LE(0),
    Uint8Array.from([0]), // SocialStakeState::Active
  );
  return {
    id: encodeBase58(positionId),
    transaction: buildAndSign({
      wallet,
      recentBlockhash,
      programId: SOCIAL_STAKING_PROGRAM_ID,
      accounts: [
        { address: stakingState, isSigner: false, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
      ],
      data,
    }),
  };
}

export function buildSocialTipTestTx({
  wallet,
  monetizationState,
  recentBlockhash,
  creator,
  amount,
}) {
  const tipId = random32();
  const data = concat(
    Uint8Array.from([1]), // SendCreatorTip
    tipId,
    decodeBase58(creator),
    decodeBase58(wallet.address),
    u64LE(amount),
    i64LE(Math.floor(Date.now() / 1000)),
  );
  return {
    id: encodeBase58(tipId),
    transaction: buildAndSign({
      wallet,
      recentBlockhash,
      programId: SOCIAL_MONETIZATION_PROGRAM_ID,
      accounts: [
        { address: monetizationState, isSigner: false, isWritable: true },
        { address: wallet.address, isSigner: true, isWritable: true },
      ],
      data,
    }),
  };
}

export const SOCIAL_TEST_PROGRAMS = {
  posts: SOCIAL_POSTS_PROGRAM_ID,
  antiSpam: SOCIAL_ANTI_SPAM_PROGRAM_ID,
  staking: SOCIAL_STAKING_PROGRAM_ID,
  monetization: SOCIAL_MONETIZATION_PROGRAM_ID,
};
