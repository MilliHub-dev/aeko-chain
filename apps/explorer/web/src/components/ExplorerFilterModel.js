const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export const PUBKEY_MAX = 64;
export const PUBKEY_MIN = 32;
export const TEXT_MAX = 128;

function looksValidPubkey(value) {
  if (!value) return true;
  const v = value.trim();
  return v.length >= PUBKEY_MIN && v.length <= PUBKEY_MAX && BASE58_RE.test(v);
}

export function sanitizeCursor(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{1,20}$/.test(trimmed)) return '';
  return trimmed.slice(0, 19);
}

const SEARCH_QUERY_MAX = 100;
export const SEARCH_QUERY_MIN = 2;

export function sanitizeSearchQuery(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, SEARCH_QUERY_MAX);
}

export const FILTER_FIELDS = [
  {
    key: 'txAddress',
    label: 'Tx address',
    group: 'activity',
    kind: 'pubkey',
    hint: 'Wallet, program, or signer',
    acceptsWallets: true,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'txType',
    label: 'Tx program',
    group: 'activity',
    kind: 'text',
    hint: 'Program name or pubkey',
    acceptsWallets: false,
    maxLen: TEXT_MAX,
    validate: () => true,
  },
  {
    key: 'txStatus',
    label: 'Tx status',
    group: 'activity',
    kind: 'segment',
    options: [
      { value: '', label: 'All' },
      { value: 'success', label: 'Success' },
      { value: 'failed', label: 'Failed' },
    ],
  },
  {
    key: 'postCreator',
    label: 'Post creator',
    group: 'social',
    kind: 'pubkey',
    acceptsWallets: true,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'postKind',
    label: 'Post kind',
    group: 'social',
    kind: 'segment',
    options: [
      { value: '', label: 'All' },
      { value: 'original', label: 'Original' },
      { value: 'reply', label: 'Reply' },
      { value: 'repost', label: 'Repost' },
      { value: 'quote', label: 'Quote' },
    ],
  },
  {
    key: 'postVisibility',
    label: 'Visibility',
    group: 'social',
    kind: 'segment',
    options: [
      { value: '', label: 'All' },
      { value: 'public', label: 'Public' },
      { value: 'followers-only', label: 'Followers' },
      { value: 'permissioned', label: 'Gated' },
      { value: 'paid', label: 'Paid' },
    ],
  },
  {
    key: 'stakeWallet',
    label: 'Stake wallet',
    group: 'staking',
    kind: 'pubkey',
    acceptsWallets: true,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'stakeCreator',
    label: 'Stake creator',
    group: 'staking',
    kind: 'pubkey',
    acceptsWallets: false,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'stakeState',
    label: 'Stake state',
    group: 'staking',
    kind: 'segment',
    options: [
      { value: '', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'cooling-down', label: 'Cooldown' },
      { value: 'closed', label: 'Closed' },
      { value: 'slashed', label: 'Slashed' },
    ],
  },
  {
    key: 'nftCollection',
    label: 'NFT collection',
    group: 'nfts',
    kind: 'pubkey',
    acceptsWallets: false,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'nftOwner',
    label: 'NFT owner',
    group: 'nfts',
    kind: 'pubkey',
    acceptsWallets: true,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
  {
    key: 'nftCreator',
    label: 'NFT creator',
    group: 'nfts',
    kind: 'pubkey',
    acceptsWallets: false,
    maxLen: PUBKEY_MAX,
    validate: looksValidPubkey,
  },
];
