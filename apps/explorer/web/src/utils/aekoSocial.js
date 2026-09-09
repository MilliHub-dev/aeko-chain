// Browser-side client for the AEKO `social-posts` native builtin.
//
// Lets the /faucet test console post directly on-chain and read back the
// resulting feed without touching the explorer-backend. State-account
// discovery uses getProgramAccounts so the modal works on any chain where
// `social-bootstrap` has run, without an env paste-in step.
//
// Wire format:
//   Instructions are Borsh-encoded `SocialPostsInstruction` enums.
//   Variant index (1 byte) + variant body. Variants:
//     0 InitializeState | 1 AnchorPost   | 2 EditPost
//     3 ModeratePost   | 4 RecordEngagement | 5 ReadPostsState
//
//   The state account stores the entire feed inline as
//   `SocialPostsStateAccount { is_initialized, config, posts: Vec<PostAnchor>,
//   engagement_proofs: Vec<EngagementProof> }`. We decode that blob
//   directly to render the timeline.
import { encodeBase58, getSecretKeyBytes, signMessage } from './aekoTestKeypair.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Native builtin program IDs — see programs/social-*/src/lib.rs:12 and
// runtime/src/builtins.rs:115. Each is the 32-byte fill value below, base58.
const SOCIAL_REWARDS_PROGRAM_ID_BYTES = new Uint8Array(32).fill(13);
const SOCIAL_STAKING_PROGRAM_ID_BYTES = new Uint8Array(32).fill(14);
const SOCIAL_MONETIZATION_PROGRAM_ID_BYTES = new Uint8Array(32).fill(15);
const SOCIAL_ANTI_SPAM_PROGRAM_ID_BYTES = new Uint8Array(32).fill(16);
const SOCIAL_POSTS_PROGRAM_ID_BYTES = new Uint8Array(32).fill(17);

export const SOCIAL_POSTS_PROGRAM_ID = encodeBase58(SOCIAL_POSTS_PROGRAM_ID_BYTES);
export const SOCIAL_REWARDS_PROGRAM_ID = encodeBase58(SOCIAL_REWARDS_PROGRAM_ID_BYTES);
export const SOCIAL_STAKING_PROGRAM_ID = encodeBase58(SOCIAL_STAKING_PROGRAM_ID_BYTES);
export const SOCIAL_ANTI_SPAM_PROGRAM_ID = encodeBase58(SOCIAL_ANTI_SPAM_PROGRAM_ID_BYTES);
export const SOCIAL_MONETIZATION_PROGRAM_ID = encodeBase58(SOCIAL_MONETIZATION_PROGRAM_ID_BYTES);

const POST_KIND_TAG = { original: 0, reply: 1, repost: 2, quote: 3 };
const POST_KIND_NAME = ['original', 'reply', 'repost', 'quote'];
const VISIBILITY_TAG = { public: 0, followersOnly: 1, permissioned: 2, paid: 3 };
const VISIBILITY_NAME = ['public', 'followersOnly', 'permissioned', 'paid'];
const MODERATION_NAME = ['active', 'reducedReach', 'hiddenByApp', 'lockedByProtocol'];
const ENGAGEMENT_TAG = { like: 0, comment: 1, repost: 2, quote: 3, share: 4, save: 5 };
const ENGAGEMENT_NAME = ['like', 'comment', 'repost', 'quote', 'share', 'save'];

// ---------- byte helpers ----------

function decodeBase58(value) {
  if (!value) throw new Error('Missing base58 value.');
  const bytes = [0];
  for (const c of value.trim()) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid base58 char "${c}".`);
    let carry = idx;
    for (let i = 0; i < bytes.length; i += 1) {
      const v = bytes[i] * 58 + carry;
      bytes[i] = v & 0xff;
      carry = v >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < value.length && value[i] === '1'; i += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u16LE(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32LE(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64LE(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

function i64LE(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
  return b;
}

function encodeBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeShortVec(n) {
  const out = [];
  let rem = n >>> 0;
  while (true) {
    let next = rem & 0x7f;
    rem >>>= 7;
    if (rem > 0) next |= 0x80;
    out.push(next);
    if (rem === 0) break;
  }
  return Uint8Array.from(out);
}

function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// ---------- Borsh decoder ----------

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.off = 0;
  }
  readFixed(n) {
    const slice = this.bytes.slice(this.off, this.off + n);
    if (slice.length !== n) throw new Error(`Borsh underrun at ${this.off}, wanted ${n}`);
    this.off += n;
    return slice;
  }
  readU8() {
    return this.readFixed(1)[0];
  }
  readBool() {
    return this.readU8() === 1;
  }
  readU16() {
    return new DataView(this.readFixed(2).buffer).getUint16(0, true);
  }
  readU32() {
    return new DataView(this.readFixed(4).buffer).getUint32(0, true);
  }
  readU64() {
    return new DataView(this.readFixed(8).buffer).getBigUint64(0, true);
  }
  readI64() {
    return new DataView(this.readFixed(8).buffer).getBigInt64(0, true);
  }
  readU128() {
    const bytes = this.readFixed(16);
    const lo = new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
    const hi = new DataView(bytes.buffer, bytes.byteOffset + 8, 8).getBigUint64(0, true);
    return (hi << 64n) | lo;
  }
  readPubkey() {
    return encodeBase58(this.readFixed(32));
  }
  readFixed32Hex() {
    return bytesToHex(this.readFixed(32));
  }
  readString() {
    const len = this.readU32();
    const buf = this.readFixed(len);
    return new TextDecoder('utf-8').decode(buf);
  }
  readOption(inner) {
    return this.readU8() === 1 ? inner(this) : null;
  }
  assertZeroPadding() {
    for (let i = this.off; i < this.bytes.length; i += 1) {
      if (this.bytes[i] !== 0) {
        throw new Error(`Borsh state has non-zero trailing data at byte ${i}`);
      }
    }
  }
}

function decodePostAnchor(r) {
  return {
    postId: r.readFixed32Hex(),
    creator: r.readPubkey(),
    contentHash: r.readFixed32Hex(),
    metadataHash: r.readFixed32Hex(),
    contentUri: r.readString(),
    parentPostId: r.readOption((x) => x.readFixed32Hex()),
    postKind: POST_KIND_NAME[r.readU8()] || 'unknown',
    createdAtUnix: Number(r.readI64()),
    editedAtUnix: r.readOption((x) => Number(x.readI64())),
    visibility: VISIBILITY_NAME[r.readU8()] || 'unknown',
    moderationState: MODERATION_NAME[r.readU8()] || 'unknown',
    signatureRef: r.readOption((x) => x.readFixed32Hex()),
  };
}

function decodeEngagementProof(r) {
  return {
    proofId: r.readFixed32Hex(),
    actor: r.readPubkey(),
    targetPostId: r.readOption((x) => x.readFixed32Hex()),
    targetCreator: r.readPubkey(),
    actionKind: ENGAGEMENT_NAME[r.readU8()] || 'unknown',
    actionWeight: r.readU32(),
    slot: Number(r.readU64()),
    unixTimestamp: Number(r.readI64()),
    replayGuard: r.readFixed32Hex(),
  };
}

export function decodeSocialPostsStateAccount(base64Data) {
  const r = new Reader(decodeBase64(base64Data));
  const isInitialized = r.readBool();
  const config = {
    authority: r.readPubkey(),
    postingEnabled: r.readBool(),
    engagementEnabled: r.readBool(),
    maxContentUriLen: r.readU16(),
  };
  const postsLen = r.readU32();
  const posts = [];
  for (let i = 0; i < postsLen; i += 1) posts.push(decodePostAnchor(r));
  const proofsLen = r.readU32();
  const engagementProofs = [];
  for (let i = 0; i < proofsLen; i += 1) engagementProofs.push(decodeEngagementProof(r));
  r.assertZeroPadding();
  return { isInitialized, config, posts, engagementProofs };
}

// ---------- discovery ----------
//
// State accounts are created by `social-bootstrap` with a random keypair
// persisted on the validator host. The browser has two ways to find them:
//
//   1. Hit the explorer-backend registry endpoint (/registry/social) which
//      returns the pubkeys the OPERATOR pasted into Coolify after seeing
//      them in the bootstrap log. Fast, one HTTP call, doesn't depend on
//      the validator at all. This is the production path.
//
//   2. Fall back to getProgramAccounts on the validator RPC. Works on a
//      local cluster but the public production RPC throttles or disables
//      this method to prevent DoS — which is why the Mini Feed got stuck
//      on "Initializing" even though bootstrap had succeeded.

let cachedRegistry = null;
let cachedRegistryAt = 0;
const REGISTRY_TTL_MS = 60_000;

export async function fetchSocialRegistry(explorerApiUrl) {
  if (!explorerApiUrl) return null;
  const now = Date.now();
  if (cachedRegistry && now - cachedRegistryAt < REGISTRY_TTL_MS) {
    return cachedRegistry;
  }
  try {
    const res = await fetch(`${explorerApiUrl}/registry/social`);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    const body = await res.json();
    cachedRegistry = body?.data || null;
    cachedRegistryAt = now;
    return cachedRegistry;
  } catch {
    return null;
  }
}

export async function discoverViaRegistry({ rpcUrl, explorerApiUrl, programKey, decode }) {
  const registry = await fetchSocialRegistry(explorerApiUrl);
  const address = registry?.[programKey];
  if (!address) return null;
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [address, { commitment: 'confirmed', encoding: 'base64' }],
    }),
  });
  if (!r.ok) return null;
  const body = await r.json();
  const info = body?.result?.value;
  if (!info?.data?.[0]) return null;
  try {
    const decoded = decode(info.data[0]);
    if (!decoded.isInitialized) return null;
    return { address, decoded, lamports: info.lamports };
  } catch {
    return null;
  }
}

export async function discoverProgramState({ rpcUrl, programId, decode, pickBest }) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [programId, { commitment: 'confirmed', encoding: 'base64' }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`getProgramAccounts failed: ${res.status} ${txt.slice(0, 120)}`);
  }
  const body = await res.json();
  if (body.error) throw new Error(`RPC error: ${body.error.message || JSON.stringify(body.error)}`);
  const accounts = body.result || [];
  if (accounts.length === 0) return null;
  let best = null;
  for (const entry of accounts) {
    try {
      const decoded = decode(entry.account.data[0]);
      if (!decoded.isInitialized) continue;
      const candidate = { address: entry.pubkey, decoded, lamports: entry.account.lamports };
      if (!best || (pickBest ? pickBest(candidate, best) : false)) best = candidate;
      else if (!best) best = candidate;
    } catch {
      // unreadable — skip
    }
  }
  return best;
}

export async function discoverSocialPostsStateAccount(rpcUrl, explorerApiUrl) {
  if (explorerApiUrl) {
    const fromRegistry = await discoverViaRegistry({
      rpcUrl,
      explorerApiUrl,
      programKey: 'posts',
      decode: decodeSocialPostsStateAccount,
    });
    if (fromRegistry) return fromRegistry;
  }
  const hit = await discoverProgramState({
    rpcUrl,
    programId: SOCIAL_POSTS_PROGRAM_ID,
    decode: decodeSocialPostsStateAccount,
    pickBest: (a, b) => a.decoded.posts.length > b.decoded.posts.length,
  });
  if (!hit) {
    throw new Error(
      'No social-posts state account on chain. Set AEKO_SOCIAL_POSTS_STATE on the explorer-backend (operator-published registry) or run `aeko-social-bootstrap`.',
    );
  }
  return hit;
}

// ---------- random / hashing helpers ----------

export function randomBytes32() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b;
}

export async function sha256(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

// ---------- transaction builders ----------

function buildLegacyMessage({ payerBytes, recentBlockhashBytes, accountKeys, instructions, header }) {
  const compiled = instructions.map((ix) =>
    concat(
      Uint8Array.from([ix.programIdIndex]),
      encodeShortVec(ix.accounts.length),
      Uint8Array.from(ix.accounts),
      encodeShortVec(ix.data.length),
      ix.data,
    ),
  );
  return concat(
    header,
    encodeShortVec(accountKeys.length),
    ...accountKeys,
    recentBlockhashBytes,
    encodeShortVec(compiled.length),
    ...compiled,
  );
}

// Build, sign, and base64-encode an AnchorPost transaction.
// Program contract: [posts_state(writable), creator(signer), anti_spam_state(writable)].
// `creatorWallet` doubles as fee payer (single-signer flow).
export function buildSignedAnchorPostTx({
  creatorWallet,
  stateAccount,
  antiSpamStateAccount,
  recentBlockhash,
  postId,
  contentHash,
  metadataHash,
  contentUri,
  parentPostId = null,
  postKind = 'original',
  createdAtUnix,
  visibility = 'public',
}) {
  const creatorBytes = decodeBase58(creatorWallet.address);
  const stateBytes = decodeBase58(stateAccount);
  const antiSpamStateBytes = decodeBase58(antiSpamStateAccount);
  const recentBytes = decodeBase58(recentBlockhash);

  const instructionData = concat(
    Uint8Array.from([1]),
    postId,
    creatorBytes,
    contentHash,
    metadataHash,
    encodeStringBytes(contentUri),
    encodeOption32(parentPostId),
    Uint8Array.from([POST_KIND_TAG[postKind] ?? 0]),
    i64LE(createdAtUnix),
    Uint8Array.from([0]),
    Uint8Array.from([VISIBILITY_TAG[visibility] ?? 0]),
    Uint8Array.from([0]),
    Uint8Array.from([0]),
  );

  // Message order preserves signer/writable classification; instruction order
  // below follows the Rust processor contract.
  const accountKeys = [
    creatorBytes,
    stateBytes,
    antiSpamStateBytes,
    SOCIAL_POSTS_PROGRAM_ID_BYTES,
  ];
  const header = Uint8Array.from([
    1,
    0,
    1,
  ]);

  const ix = {
    programIdIndex: 3,
    accounts: [1, 0, 2],
    data: instructionData,
  };

  const messageBytes = buildLegacyMessage({
    payerBytes: creatorBytes,
    recentBlockhashBytes: recentBytes,
    accountKeys,
    instructions: [ix],
    header,
  });

  const signature = signMessage(creatorWallet, messageBytes);
  void getSecretKeyBytes;
  return encodeBase64(concat(encodeShortVec(1), signature, messageBytes));
}

export function buildSignedLikeTx({
  actorWallet,
  stateAccount,
  recentBlockhash,
  targetPostId,
  targetCreator,
  unixTimestamp,
}) {
  const actorBytes = decodeBase58(actorWallet.address);
  const stateBytes = decodeBase58(stateAccount);
  const recentBytes = decodeBase58(recentBlockhash);
  const targetCreatorBytes = decodeBase58(targetCreator);

  const proofId = randomBytes32();
  const replayGuard = randomBytes32();

  const instructionData = concat(
    Uint8Array.from([4]),
    proofId,
    actorBytes,
    encodeOption32(targetPostId),
    targetCreatorBytes,
    Uint8Array.from([ENGAGEMENT_TAG.like]),
    u32LE(1),
    u64LE(0),
    i64LE(unixTimestamp),
    replayGuard,
  );

  const accountKeys = [actorBytes, stateBytes, SOCIAL_POSTS_PROGRAM_ID_BYTES];
  const header = Uint8Array.from([1, 0, 1]);
  const ix = {
    programIdIndex: 2,
    accounts: [1, 0],
    data: instructionData,
  };

  const messageBytes = buildLegacyMessage({
    payerBytes: actorBytes,
    recentBlockhashBytes: recentBytes,
    accountKeys,
    instructions: [ix],
    header,
  });

  const signature = signMessage(actorWallet, messageBytes);
  return encodeBase64(concat(encodeShortVec(1), signature, messageBytes));
}

// ---------- small encoders ----------

function encodeStringBytes(value) {
  const buf = new TextEncoder().encode(value);
  return concat(u32LE(buf.length), buf);
}

function encodeOption32(value) {
  if (value == null) return Uint8Array.from([0]);
  let bytes;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  } else {
    throw new Error('Expected 32-byte Uint8Array or 64-char hex.');
  }
  if (bytes.length !== 32) throw new Error('Expected 32 bytes.');
  return concat(Uint8Array.from([1]), bytes);
}

// ---------- engagement aggregation ----------

export function summarizeEngagements(engagementProofs) {
  const likeCountByPost = new Map();
  const likedByActorAndPost = new Set();
  for (const p of engagementProofs) {
    if (p.actionKind !== 'like' || !p.targetPostId) continue;
    likeCountByPost.set(p.targetPostId, (likeCountByPost.get(p.targetPostId) || 0) + 1);
    likedByActorAndPost.add(`${p.actor}:${p.targetPostId}`);
  }
  return { likeCountByPost, likedByActorAndPost };
}

// ---------- decoders for the other 4 SocialFi state accounts ----------

// Borsh state accounts are fixed-size and zero padded. Do not trim trailing
// zeros before parsing: zero bytes may be part of legitimate serialized Borsh
// values (for example an empty Vec length). Parse the prefix, then validate
// that every unread byte is padding.
function makeReader(base64Data) {
  return new Reader(decodeBase64(base64Data));
}

const STAKE_STATE_NAME = ['active', 'coolingDown', 'closed', 'slashed'];
const ANTI_SPAM_MODE_NAME = ['observeOnly', 'gateByReputation', 'gateByStake', 'penaltyEnabled'];
const SUBSCRIPTION_STATE_NAME = ['active', 'expired', 'canceled'];

export function decodeSocialRewardsStateAccount(base64Data) {
  const r = makeReader(base64Data);
  const isInitialized = r.readBool();
  const config = {
    authority: r.readPubkey(),
    treasury: r.readPubkey(),
    rewardVault: r.readPubkey(),
    settlementAuthority: r.readPubkey(),
    minClaimAmount: Number(r.readU64()),
    rewardsEnabled: r.readBool(),
  };
  const creatorsLen = r.readU32();
  let totalEarned = 0n;
  let totalClaimable = 0n;
  for (let i = 0; i < creatorsLen; i += 1) {
    r.readPubkey();
    totalEarned += r.readU128();
    r.readU128();
    totalClaimable += BigInt(r.readU64());
    r.readU64();
  }
  const epochsLen = r.readU32();
  for (let i = 0; i < epochsLen; i += 1) {
    r.readU64();
    r.readPubkey();
    r.readU128();
    r.readU64();
    r.readU64();
    r.readU16();
  }
  const settlementsLen = r.readU32();
  for (let i = 0; i < settlementsLen; i += 1) {
    r.readU64();
    r.readU64();
    r.readU128();
    r.readU32();
  }
  r.assertZeroPadding();
  return {
    isInitialized,
    config,
    counts: { creators: creatorsLen, epochs: epochsLen, settlements: settlementsLen },
    totals: {
      totalEarned: Number(totalEarned),
      totalClaimable: Number(totalClaimable),
    },
  };
}

export function decodeSocialStakingStateAccount(base64Data) {
  const r = makeReader(base64Data);
  const isInitialized = r.readBool();
  const config = {
    authority: r.readPubkey(),
    stakeVault: r.readPubkey(),
    rewardVault: r.readPubkey(),
    minStakeAmount: Number(r.readU64()),
    cooldownEpochs: Number(r.readU64()),
    stakingEnabled: r.readBool(),
  };
  const positionsLen = r.readU32();
  let activePositions = 0;
  let totalStaked = 0n;
  for (let i = 0; i < positionsLen; i += 1) {
    r.readFixed(32);
    r.readPubkey();
    r.readPubkey();
    totalStaked += BigInt(r.readU64());
    r.readU64();
    r.readOption((x) => x.readU64());
    r.readU64();
    r.readU64();
    const stateIdx = r.readU8();
    if (stateIdx === 0) activePositions += 1;
  }
  const yieldsLen = r.readU32();
  for (let i = 0; i < yieldsLen; i += 1) {
    r.readU64();
    r.readFixed(32);
    r.readPubkey();
    r.readPubkey();
    r.readU64();
  }
  r.assertZeroPadding();
  return {
    isInitialized,
    config,
    counts: { positions: positionsLen, activePositions, yieldRecords: yieldsLen },
    totals: { totalStaked: Number(totalStaked) },
  };
}

export function decodeSocialAntiSpamStateAccount(base64Data) {
  const r = makeReader(base64Data);
  const isInitialized = r.readBool();
  const modeIdx = (() => {
    const authority = r.readPubkey();
    const modeByte = r.readU8();
    return { authority, modeByte };
  })();
  const config = {
    authority: modeIdx.authority,
    mode: ANTI_SPAM_MODE_NAME[modeIdx.modeByte] || 'unknown',
    minPostStake: Number(r.readU64()),
    minPostReputation: r.readU16(),
    cooldownEpochs: Number(r.readU64()),
    slashBps: r.readU16(),
  };
  const profilesLen = r.readU32();
  let gatedProfiles = 0;
  let totalSlashes = 0;
  for (let i = 0; i < profilesLen; i += 1) {
    r.readPubkey();
    r.readU32();
    r.readU32();
    r.readU16();
    const gated = r.readOption((x) => x.readU64());
    if (gated != null) gatedProfiles += 1;
    totalSlashes += r.readU16();
    r.readOption((x) => x.readI64());
  }
  r.assertZeroPadding();
  return {
    isInitialized,
    config,
    counts: { profiles: profilesLen, gatedProfiles, totalSlashes },
  };
}

export function decodeSocialMonetizationStateAccount(base64Data) {
  const r = makeReader(base64Data);
  const isInitialized = r.readBool();
  const config = {
    authority: r.readPubkey(),
    treasury: r.readPubkey(),
    platformFeeBps: r.readU16(),
    subscriptionsEnabled: r.readBool(),
    paidContentEnabled: r.readBool(),
  };
  const tipsLen = r.readU32();
  let tipsTotal = 0n;
  for (let i = 0; i < tipsLen; i += 1) {
    r.readFixed(32);
    r.readPubkey();
    r.readPubkey();
    tipsTotal += BigInt(r.readU64());
    r.readI64();
  }
  const subscriptionsLen = r.readU32();
  let activeSubscriptions = 0;
  for (let i = 0; i < subscriptionsLen; i += 1) {
    r.readFixed(32);
    r.readPubkey();
    r.readPubkey();
    r.readU64();
    r.readU64();
    r.readI64();
    r.readI64();
    if (SUBSCRIPTION_STATE_NAME[r.readU8()] === 'active') activeSubscriptions += 1;
  }
  const unlocksLen = r.readU32();
  for (let i = 0; i < unlocksLen; i += 1) {
    r.readFixed(32);
    r.readFixed(32);
    r.readPubkey();
    r.readPubkey();
    r.readU64();
    r.readI64();
  }
  const revenuesLen = r.readU32();
  let totalEarned = 0n;
  for (let i = 0; i < revenuesLen; i += 1) {
    r.readPubkey();
    totalEarned += r.readU128();
    r.readU128();
    r.readU64();
  }
  r.assertZeroPadding();
  return {
    isInitialized,
    config,
    counts: {
      tips: tipsLen,
      subscriptions: subscriptionsLen,
      activeSubscriptions,
      unlocks: unlocksLen,
      revenues: revenuesLen,
    },
    totals: {
      tipsTotal: Number(tipsTotal),
      revenueEarned: Number(totalEarned),
    },
  };
}
