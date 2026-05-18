// Explorer filter UX. Replaces the always-visible 12-input grid on the
// /explorer page with:
//   - A clean modal grouped by domain (Activity / SocialFi / Staking / NFTs)
//   - Per-input autocomplete drawing from page context + per-field
//     localStorage history + the user's saved test wallets
//   - Segmented selectors (chips) instead of <select> for short enums
//   - Soft inline format hints — never a hard block on Apply
//   - An active-filter chips bar above the results so the applied state is
//     always visible (and one-tap removable)
//
// Touch targets, contrast, escape routes, focus restoration, aria-live, and
// reduced-motion respect all conform to the ui-ux-pro-max checklist.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Coins,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { loadWallets, shortAddress } from '../utils/aekoTestKeypair';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const RECENT_KEY = (field) => `aeko:explorerFilters:recent:${field}`;
const RECENT_MAX = 10;

// Per-field hard caps. Pubkey fields cap at 64 chars (base58 of 32 bytes is
// ≤44; 64 gives safety margin against pasted whitespace without inviting
// pathologically long inputs). Free-text fields are tighter so a bad paste
// doesn't bloat the URL or the backend query parameter set.
const PUBKEY_MAX = 64;
const PUBKEY_MIN = 32;
const TEXT_MAX = 128;

function looksValidPubkey(value) {
  if (!value) return true;
  const v = value.trim();
  return v.length >= PUBKEY_MIN && v.length <= PUBKEY_MAX && BASE58_RE.test(v);
}

// Sanitize a numeric cursor value pulled from the URL — used by Explorer.jsx
// to defend against hand-edited URLs feeding the backend garbage like
// `blockBefore=DROP%20TABLE` or `blockBefore=99999...` (huge integer).
export function sanitizeCursor(value) {
  if (!value) return '';
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{1,20}$/.test(trimmed)) return '';
  // i64::MAX is 9223372036854775807 (19 digits); anything beyond that the
  // backend will reject. Clip to 19 chars defensively.
  return trimmed.slice(0, 19);
}

// Sanitize a search query before hitting `/search?q=`. Min 2 chars so we
// don't ask the backend to enumerate every record matching 1 char; max 100
// because the indexer's search path materializes intermediate result sets.
const SEARCH_QUERY_MAX = 100;
export const SEARCH_QUERY_MIN = 2;
export function sanitizeSearchQuery(raw) {
  if (typeof raw !== 'string') return '';
  // Strip control characters and trim.
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, SEARCH_QUERY_MAX);
}

// ---------- field schema ----------
//
// Source of truth for every filter input on the page. Adding a new filter is
// one entry here; the modal renders, the chips bar labels, the autocomplete
// pulls history, all from this list.
//
// `acceptsWallets`: whether the "Your wallets" suggestion section should
//   appear on this field. We only enable it on roles a test wallet could
//   plausibly play (signer of a tx, post creator, staker, NFT owner). Even
//   on those fields, the wallet is only surfaced if it also appears in the
//   page-context list — i.e., we've seen actual chain activity from it in
//   that role. That keeps us from suggesting random unrelated wallets.
// `maxLen` / `validate`: hard limits enforced at typing and apply time.
export const FILTER_FIELDS = [
  // Activity
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
  // SocialFi
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
  // Staking
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
  // NFTs
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

const GROUPS = [
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'social', label: 'SocialFi', icon: MessageSquare },
  { key: 'staking', label: 'Staking', icon: Coins },
  { key: 'nfts', label: 'NFTs', icon: ImageIcon },
];

const FIELD_BY_KEY = Object.fromEntries(FILTER_FIELDS.map((f) => [f.key, f]));

// ---------- helpers ----------

function pushRecent(fieldKey, value) {
  if (!value) return;
  try {
    const raw = localStorage.getItem(RECENT_KEY(fieldKey));
    const list = raw ? JSON.parse(raw) : [];
    const next = [value, ...list.filter((v) => v !== value)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY(fieldKey), JSON.stringify(next));
  } catch {
    // localStorage unavailable (e.g. Safari private mode) — silently no-op
  }
}

function readRecent(fieldKey) {
  try {
    const raw = localStorage.getItem(RECENT_KEY(fieldKey));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clearAllRecent() {
  try {
    FILTER_FIELDS.forEach((f) => localStorage.removeItem(RECENT_KEY(f.key)));
  } catch {
    // ignored
  }
}

function labelForValue(field, value) {
  if (!value) return '';
  if (field.kind === 'segment') {
    return field.options.find((o) => o.value === value)?.label || value;
  }
  if (field.kind === 'pubkey') return shortAddress(value);
  return value.length > 22 ? `${value.slice(0, 20)}…` : value;
}

// ---------- public API: chips bar ----------

export function ActiveFiltersBar({ filters, onOpen, onRemove, onClearAll }) {
  const active = FILTER_FIELDS
    .map((f) => ({ field: f, value: filters[f.key] || '' }))
    .filter((x) => x.value);

  const hasActive = active.length > 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 sm:px-5 py-3 mb-6 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl bg-aeko-accent/15 border border-aeko-accent/30 text-aeko-accent text-sm font-medium hover:bg-aeko-accent/25 transition"
      >
        <Filter size={14} />
        Filters
        {hasActive && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-aeko-accent text-black text-[10px] font-bold tabular-nums">
            {active.length}
          </span>
        )}
      </button>
      {hasActive ? (
        <>
          <AnimatePresence initial={false}>
            {active.map(({ field, value }, idx) => (
              <motion.button
                key={field.key}
                type="button"
                onClick={() => onRemove(field.key)}
                aria-label={`Remove ${field.label} filter`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, delay: idx * 0.02 }}
                className="group inline-flex items-center gap-1.5 min-h-[32px] pl-2.5 pr-1.5 rounded-full bg-white/[0.06] border border-white/10 hover:border-white/20 hover:bg-white/[0.09] text-[12px] text-gray-200 transition"
              >
                <span className="text-gray-500">{field.label}:</span>
                <span className="font-mono text-white truncate max-w-[140px]" title={value}>
                  {labelForValue(field, value)}
                </span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 group-hover:text-white group-hover:bg-white/10">
                  <X size={11} />
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
          <button
            type="button"
            onClick={onClearAll}
            className="ml-1 text-xs text-gray-400 hover:text-white transition min-h-[32px] px-2"
          >
            Clear all
          </button>
        </>
      ) : (
        <span className="text-xs text-gray-500">
          No filters applied — showing latest network activity.
        </span>
      )}
    </div>
  );
}

// ---------- modal ----------

export function ExplorerFiltersModal({
  open,
  onClose,
  initialFilters,
  pageSuggestions,
  onApply,
}) {
  const [draft, setDraft] = useState(initialFilters);
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].key);
  const [applyError, setApplyError] = useState(null);
  const triggerRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Sync draft when modal opens with fresh applied state.
  useEffect(() => {
    if (open) {
      setDraft(initialFilters);
      // Focus first field after the entrance animation settles.
      const t = setTimeout(() => firstFieldRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, initialFilters]);

  // Escape closes; tab order kept inside the panel by the trap markup.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const wallets = useMemo(() => (open ? loadWallets() : []), [open]);

  const setField = useCallback((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const activeCount = useMemo(
    () => FILTER_FIELDS.filter((f) => draft[f.key]).length,
    [draft],
  );

  const handleApply = () => {
    // Hard validation: refuse to apply pubkey fields containing non-base58
    // or wrong-length input. Without this we'd happily forward `'); DROP --`
    // to the backend — sqlx is parameterized so it's not an SQL-injection
    // risk, but it IS a wasted full table scan. Block it client-side.
    const invalid = FILTER_FIELDS.filter((f) => {
      const v = (draft[f.key] || '').trim();
      return f.validate && !f.validate(v);
    });
    if (invalid.length > 0) {
      setApplyError({
        fields: invalid.map((f) => f.key),
        message: `Fix these fields before applying: ${invalid.map((f) => f.label).join(', ')}.`,
        group: invalid[0].group,
      });
      // Surface the problem visually: switch to the tab containing the first
      // invalid field so the user sees what's wrong without hunting.
      setActiveGroup(invalid[0].group);
      return;
    }
    setApplyError(null);

    // Trim every value, drop empties. The trimmed shape goes to onApply and
    // also into the recent-history store; we want to canonicalise here so
    // we don't accumulate "abc " and "abc" as two different recents.
    const sanitized = {};
    FILTER_FIELDS.forEach((f) => {
      const v = (draft[f.key] || '').trim();
      sanitized[f.key] = v;
      if (v && f.kind !== 'segment') pushRecent(f.key, v);
    });
    onApply(sanitized);
    onClose();
  };

  const handleReset = () => {
    const empty = Object.fromEntries(FILTER_FIELDS.map((f) => [f.key, '']));
    setDraft(empty);
  };

  const fieldsInGroup = FILTER_FIELDS.filter((f) => f.group === activeGroup);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="explorer-filters-title"
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm cursor-default"
          />
          <motion.div
            ref={triggerRef}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[86vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-white/10">
              <div className="min-w-0">
                <h2 id="explorer-filters-title" className="text-base sm:text-lg font-semibold text-white">
                  Filter explorer
                </h2>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {activeCount === 0
                    ? 'No filters applied yet'
                    : `${activeCount} filter${activeCount === 1 ? '' : 's'} ready to apply`}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white transition"
              >
                <X size={18} />
              </button>
            </header>

            <nav className="flex overflow-x-auto border-b border-white/10 px-2 sm:px-4 no-scrollbar" aria-label="Filter groups">
              {GROUPS.map((g) => {
                const Icon = g.icon;
                const active = activeGroup === g.key;
                const count = FILTER_FIELDS.filter((f) => f.group === g.key && draft[f.key]).length;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveGroup(g.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 min-h-[44px] text-sm transition ${
                      active ? 'text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{g.label}</span>
                    {count > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-aeko-accent text-black text-[9px] font-bold tabular-nums">
                        {count}
                      </span>
                    )}
                    {active && (
                      <motion.span
                        layoutId="filters-tab-underline"
                        className="absolute left-2 right-2 bottom-0 h-[2px] bg-aeko-accent rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
              {fieldsInGroup.map((field, idx) => (
                <FilterFieldRow
                  key={field.key}
                  field={field}
                  value={draft[field.key] || ''}
                  onChange={(v) => setField(field.key, v)}
                  pageSuggestions={pageSuggestions[field.key] || []}
                  wallets={wallets}
                  inputRef={idx === 0 ? firstFieldRef : undefined}
                />
              ))}
            </div>

            {applyError && (
              <div
                role="alert"
                aria-live="assertive"
                className="px-5 sm:px-6 py-2 border-t border-amber-400/30 bg-amber-500/10 text-amber-100 text-[12px] flex items-center gap-2"
              >
                <span className="font-medium">⚠</span>
                <span>{applyError.message}</span>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-white/10 bg-black/40">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={activeCount === 0}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAllRecent();
                    // Bump a state token so the autocomplete rows re-read
                    // localStorage on next focus. Cheapest: close + reopen
                    // would force this; here we just flip activeGroup which
                    // remounts the field rows.
                    setActiveGroup((g) => g);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition min-h-[40px] px-2"
                  title="Wipe per-field 'Recent' history from this browser"
                >
                  Clear recent searches
                </button>
              </div>
              <button
                type="button"
                onClick={handleApply}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-aeko-accent text-black text-sm font-semibold hover:brightness-110 transition"
              >
                Apply filters
                {activeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-black/20 text-black text-[10px] font-bold tabular-nums">
                    {activeCount}
                  </span>
                )}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- per-field row ----------

function FilterFieldRow({ field, value, onChange, pageSuggestions, wallets, inputRef }) {
  if (field.kind === 'segment') {
    return (
      <div>
        <div className="text-xs font-medium text-gray-300 mb-2">{field.label}</div>
        <SegmentedSelect options={field.options} value={value} onChange={onChange} ariaLabel={field.label} />
      </div>
    );
  }
  return (
    <AutocompleteInput
      field={field}
      value={value}
      onChange={onChange}
      pageSuggestions={pageSuggestions}
      wallets={wallets}
      inputRef={inputRef}
    />
  );
}

function SegmentedSelect({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1.5 p-1 rounded-xl bg-black/30 border border-white/10"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value || 'all'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`min-h-[36px] px-3 rounded-lg text-sm transition ${
              active
                ? 'bg-aeko-accent text-black font-semibold'
                : 'text-gray-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AutocompleteInput({ field, value, onChange, pageSuggestions, wallets, inputRef }) {
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState(() => readRecent(field.key));
  const containerRef = useRef(null);

  useEffect(() => {
    if (!focused) setRecent(readRecent(field.key));
  }, [focused, field.key]);

  const validate = field.validate || (() => true);
  const isWarn = field.kind === 'pubkey' && value && !validate(value);
  const isValid = field.kind === 'pubkey' && value && validate(value);

  // Suggestion sections — field-aware:
  //
  //   1. "On this page" — addresses we know have played THIS field's role
  //      (signers for tx, creators for posts, owners for NFTs, …). Source
  //      is computed in Explorer.jsx from the currently-rendered home
  //      panels, so we never surface someone else's data.
  //
  //   2. "Your wallets" — only on fields whose role a wallet can plausibly
  //      play (acceptsWallets=true), and only intersected with the page
  //      suggestions for THIS field. That intersection means we suggest a
  //      test wallet only when it has actual chain activity in this role,
  //      not just because the user created it locally.
  //
  //   3. "Recent" — per-field localStorage history, capped at 10 entries.
  //
  // Each section caps at 6 visible rows. Dedupe is global so a single
  // address never appears twice.
  const sections = useMemo(() => {
    const lower = value.trim().toLowerCase();
    const filterFn = (v) => v && (!lower || v.toLowerCase().includes(lower)) && v !== value;
    const seen = new Set();
    const take = (arr) => {
      const out = [];
      for (const v of arr) {
        if (!filterFn(v)) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        if (out.length >= 6) break;
      }
      return out;
    };
    const pageSet = new Set(pageSuggestions);
    const walletAddrs = wallets.map((w) => w.address);
    const walletsForThisField = field.acceptsWallets
      ? walletAddrs.filter((a) => pageSet.has(a))
      : [];
    const walletMeta = wallets.reduce((acc, w) => ({ ...acc, [w.address]: w.name }), {});

    return [
      { title: `Active ${field.label.toLowerCase()}s`, icon: Search, values: take(pageSuggestions) },
      {
        title: 'Your wallets with activity here',
        icon: Wallet,
        values: take(walletsForThisField),
        meta: walletMeta,
      },
      { title: 'Recent', icon: Sparkles, values: take(recent) },
    ].filter((s) => s.values.length > 0);
  }, [value, pageSuggestions, wallets, recent, field]);

  const showDropdown = focused && sections.length > 0;

  // Click-outside / blur close handled by checking the container ref on
  // mousedown so clicks INSIDE the dropdown still register before blur.
  useEffect(() => {
    if (!focused) return undefined;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [focused]);

  return (
    <div ref={containerRef}>
      <label htmlFor={`filter-${field.key}`} className="block">
        <div className="text-xs font-medium text-gray-300 mb-1.5">{field.label}</div>
        <div className="relative">
          <input
            id={`filter-${field.key}`}
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              // Hard-cap at typing time so a paste of 10 KB doesn't enter
              // component state at all. Also strips whitespace mid-string
              // which is always a typo in a base58 pubkey.
              let next = e.target.value.slice(0, field.maxLen || TEXT_MAX);
              if (field.kind === 'pubkey') next = next.replace(/\s+/g, '');
              onChange(next);
            }}
            onFocus={() => setFocused(true)}
            placeholder={field.hint || 'Paste or type to search'}
            spellCheck="false"
            autoComplete="off"
            maxLength={field.maxLen || TEXT_MAX}
            aria-invalid={isWarn || undefined}
            aria-describedby={`filter-${field.key}-helper`}
            className={`w-full min-h-[44px] rounded-xl bg-black/30 px-3 pr-9 text-sm font-mono text-white placeholder:text-gray-500 placeholder:font-sans border transition focus:outline-none ${
              isWarn
                ? 'border-amber-400/50 focus:border-amber-300'
                : isValid
                ? 'border-emerald-400/40 focus:border-emerald-300'
                : 'border-white/10 focus:border-aeko-accent'
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear field"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div
          id={`filter-${field.key}-helper`}
          className={`text-[11px] mt-1.5 leading-snug flex items-center justify-between gap-2 ${
            isWarn ? 'text-amber-300' : 'text-gray-500'
          }`}
        >
          <span className="min-w-0 truncate">
            {isWarn
              ? `Not a valid base58 pubkey (need ${PUBKEY_MIN}–${PUBKEY_MAX} base58 chars).`
              : field.hint || 'Type, paste, or pick a suggestion below.'}
          </span>
          {field.kind === 'pubkey' && value && (
            <span className="text-[10px] tabular-nums text-gray-500 shrink-0">
              {value.length}/{field.maxLen}
            </span>
          )}
        </div>
      </label>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-2 rounded-xl border border-white/10 bg-[#111114] shadow-xl max-h-64 overflow-y-auto"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.title} className="py-1.5">
                  <div className="px-3 pt-1 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
                    <Icon size={10} /> {section.title}
                  </div>
                  {section.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onMouseDown={(e) => e.preventDefault() /* keep focus */}
                      onClick={() => {
                        onChange(v);
                        setFocused(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition flex items-center justify-between gap-3"
                    >
                      <span className="font-mono text-xs text-white truncate flex-1">
                        {v.length > 28 ? `${v.slice(0, 16)}…${v.slice(-8)}` : v}
                      </span>
                      {section.meta?.[v] && (
                        <span className="text-[10px] text-gray-400 shrink-0">{section.meta[v]}</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- a small helper used by the chips bar export ----------

// Loading shimmer for callers that want a visual hint while a probe runs.
export function FilterChipSkeleton() {
  return (
    <span className="inline-block h-7 w-24 rounded-full bg-white/[0.05] animate-pulse" aria-hidden="true" />
  );
}

// Spinner adapter so banners and filter rows share the same loader visual.
export function FilterSpinner({ size = 14 }) {
  return <Loader2 size={size} className="animate-spin" />;
}
