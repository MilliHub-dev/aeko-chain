import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Wallet,
  Plus,
  Trash2,
  Copy,
  Check,
  Droplets,
  Send,
  MessageSquare,
  Heart,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Activity,
  Pause,
  Play,
} from 'lucide-react';
import {
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import {
  aekoToLamports,
  confirmSignature,
  formatAeko,
  getBalance,
  getLatestBlockhash,
  getSlot,
  requestAirdrop,
  sendTransaction,
} from '../utils/aekoRpcClient';
import { buildSignedTransfer } from '../utils/aekoTransfer';
import {
  buildSignedAnchorPostTx,
  buildSignedLikeTx,
  decodeSocialAntiSpamStateAccount,
  decodeSocialMonetizationStateAccount,
  decodeSocialPostsStateAccount,
  decodeSocialRewardsStateAccount,
  decodeSocialStakingStateAccount,
  discoverProgramState,
  discoverSocialPostsStateAccount,
  discoverViaRegistry,
  randomBytes32,
  sha256,
  summarizeEngagements,
  SOCIAL_ANTI_SPAM_PROGRAM_ID,
  SOCIAL_MONETIZATION_PROGRAM_ID,
  SOCIAL_POSTS_PROGRAM_ID,
  SOCIAL_REWARDS_PROGRAM_ID,
  SOCIAL_STAKING_PROGRAM_ID,
} from '../utils/aekoSocial';

const TABS = [
  { key: 'wallets', label: 'Wallets', icon: Wallet },
  { key: 'tx', label: 'Airdrop & Transfer', icon: Send },
  { key: 'programs', label: 'Programs', icon: Activity },
  { key: 'social', label: 'Mini Feed', icon: MessageSquare },
];

const MAX_POST_LEN = 280;

const COPY_RESET_MS = 1500;
const BALANCE_POLL_MS = 6000;

// ---------- shared sub-components ----------

function Toast({ kind = 'info', children, onDismiss }) {
  const palette = {
    info: 'border-white/15 bg-black/40 text-white',
    success: 'border-green-400/30 bg-green-500/10 text-green-100',
    error: 'border-red-400/30 bg-red-500/10 text-red-100',
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className={`mt-3 rounded-lg border px-3 py-2 text-sm ${palette} flex items-start gap-2`}
    >
      <span className="flex-1 break-all">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-white"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), COPY_RESET_MS);
        } catch {
          // Clipboard API can fail in non-secure contexts; surface nothing
          // rather than break the flow.
        }
      }}
      aria-label={label}
      className="inline-flex items-center justify-center min-w-[44px] min-h-[28px] gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

function Field({ label, hint, htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <div className="text-xs font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-aeko-accent ml-0.5">*</span>}
      </div>
      {children}
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
    </label>
  );
}

function PrimaryButton({ children, disabled, loading, onClick, type = 'button', danger }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-medium transition
        ${
          danger
            ? 'bg-red-500/15 border border-red-400/40 text-red-100 hover:bg-red-500/25'
            : 'bg-aeko-accent text-black hover:brightness-110'
        }
        disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3 min-h-[44px] rounded-xl text-sm text-gray-300 border border-white/15 bg-white/5 hover:bg-white/10 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// ---------- Wallets tab ----------

function WalletsTab({ wallets, setWallets, balances, refreshBalance, rpcUrl }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(() => {
    setError(null);
    setBusy(true);
    try {
      const w = generateTestWallet(newName);
      const next = [...wallets, w];
      setWallets(next);
      saveWallets(next);
      setNewName('');
      refreshBalance(w.address);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [newName, wallets, setWallets, refreshBalance]);

  const remove = useCallback(
    (id) => {
      // No native confirm() prompt — we substitute an inline two-step click
      // pattern below via a dedicated state, so this stays predictable for
      // keyboard users. (See `RemoveButton`.)
      const next = wallets.filter((w) => w.id !== id);
      setWallets(next);
      saveWallets(next);
    },
    [wallets, setWallets],
  );

  return (
    <div>
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 mb-6 flex gap-3">
        <AlertTriangle className="text-amber-300 shrink-0 mt-0.5" size={18} />
        <div className="text-xs leading-relaxed text-amber-100">
          Test wallets only. Keys are stored unencrypted in your browser's
          localStorage and are visible to any script on this origin. Never
          import a mainnet key here.
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Plus size={16} className="text-aeko-accent" />
          New wallet
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Alice (optional name)"
            className="flex-1 min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-aeko-accent"
          />
          <PrimaryButton onClick={create} loading={busy}>
            Generate keypair
          </PrimaryButton>
        </div>
        {error && (
          <Toast kind="error" onDismiss={() => setError(null)}>
            {error}
          </Toast>
        )}
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-gray-400">
          No test wallets yet. Generate one above to start requesting airdrops.
        </div>
      ) : (
        <ul className="space-y-3">
          {wallets.map((w) => (
            <WalletRow
              key={w.id}
              wallet={w}
              balance={balances[w.address]}
              onRefresh={() => refreshBalance(w.address)}
              onRemove={() => remove(w.id)}
              rpcUrl={rpcUrl}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WalletRow({ wallet, balance, onRefresh, onRemove, rpcUrl }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const explorerHost = useMemo(() => {
    try {
      return new URL(rpcUrl).host.replace('rpc.', 'gossip.');
    } catch {
      return '';
    }
  }, [rpcUrl]);

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{wallet.name}</div>
          <div className="font-mono text-xs text-gray-400 break-all mt-0.5">{wallet.address}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CopyButton value={wallet.address} label={shortAddress(wallet.address)} />
          {explorerHost && (
            <a
              href={`https://${explorerHost}/explorer/account/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[28px] gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition"
              aria-label="Open in explorer"
            >
              <ExternalLink size={12} />
              <span>Explorer</span>
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-gray-200">
          {balance == null ? <span className="text-gray-500">—</span> : formatAeko(balance)}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition min-h-[28px] px-2"
          aria-label="Refresh balance"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
        <div className="flex-1" />
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-200">Confirm delete?</span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
              className="inline-flex items-center gap-1 text-xs text-red-200 hover:text-red-100 rounded-md px-2 py-1 border border-red-400/40 bg-red-500/15 min-h-[28px]"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-gray-400 hover:text-white min-h-[28px] px-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete wallet"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-200 transition min-h-[28px] px-2"
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

// ---------- Airdrop & Transfer tab ----------

function AirdropTransferTab({ wallets, balances, refreshBalance, rpcUrl }) {
  const [airdropWallet, setAirdropWallet] = useState(wallets[0]?.id || '');
  const [airdropAmount, setAirdropAmount] = useState('1');
  const [airdropBusy, setAirdropBusy] = useState(false);
  const [airdropResult, setAirdropResult] = useState(null);

  const [fromWalletId, setFromWalletId] = useState(wallets[0]?.id || '');
  const [toAddress, setToAddress] = useState(wallets[1]?.address || '');
  const [transferAmount, setTransferAmount] = useState('0.1');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferResult, setTransferResult] = useState(null);

  // Keep selections valid as the wallets list changes underneath us.
  useEffect(() => {
    if (!wallets.find((w) => w.id === airdropWallet)) {
      setAirdropWallet(wallets[0]?.id || '');
    }
    if (!wallets.find((w) => w.id === fromWalletId)) {
      setFromWalletId(wallets[0]?.id || '');
    }
  }, [wallets, airdropWallet, fromWalletId]);

  const fromWallet = wallets.find((w) => w.id === fromWalletId);

  const explorerHost = useMemo(() => {
    try {
      return new URL(rpcUrl).host.replace('rpc.', 'gossip.');
    } catch {
      return '';
    }
  }, [rpcUrl]);

  const handleAirdrop = useCallback(async () => {
    setAirdropResult(null);
    const target = wallets.find((w) => w.id === airdropWallet);
    if (!target) {
      setAirdropResult({ kind: 'error', message: 'Pick a wallet first.' });
      return;
    }
    const amount = Number(airdropAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAirdropResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    setAirdropBusy(true);
    try {
      const sig = await requestAirdrop(rpcUrl, target.address, aekoToLamports(amount));
      await confirmSignature(rpcUrl, sig);
      await refreshBalance(target.address);
      setAirdropResult({ kind: 'success', message: `Airdrop confirmed.`, signature: sig });
    } catch (e) {
      setAirdropResult({ kind: 'error', message: e.message || String(e) });
    } finally {
      setAirdropBusy(false);
    }
  }, [airdropWallet, airdropAmount, wallets, rpcUrl, refreshBalance]);

  const handleTransfer = useCallback(async () => {
    setTransferResult(null);
    if (!fromWallet) {
      setTransferResult({ kind: 'error', message: 'Select a source wallet.' });
      return;
    }
    if (!toAddress.trim()) {
      setTransferResult({ kind: 'error', message: 'Enter a recipient address.' });
      return;
    }
    const amount = Number(transferAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    setTransferBusy(true);
    try {
      const blockhash = await getLatestBlockhash(rpcUrl);
      if (!blockhash) throw new Error('Could not fetch a recent blockhash.');
      const tx = buildSignedTransfer({
        fromWallet,
        toAddress: toAddress.trim(),
        lamports: aekoToLamports(amount),
        recentBlockhash: blockhash,
      });
      const sig = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, sig);
      await refreshBalance(fromWallet.address);
      await refreshBalance(toAddress.trim());
      setTransferResult({ kind: 'success', message: 'Transfer confirmed.', signature: sig });
    } catch (e) {
      setTransferResult({ kind: 'error', message: e.message || String(e) });
    } finally {
      setTransferBusy(false);
    }
  }, [fromWallet, toAddress, transferAmount, rpcUrl, refreshBalance]);

  if (wallets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-gray-400">
        Create at least one wallet on the <strong className="text-white">Wallets</strong> tab to
        request an airdrop or send a transfer.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="text-aeko-accent" size={18} />
          <h3 className="text-base font-semibold text-white">Request airdrop</h3>
        </div>

        <div className="space-y-4">
          <Field label="Wallet" htmlFor="ad-wallet" required>
            <select
              id="ad-wallet"
              value={airdropWallet}
              onChange={(e) => setAirdropWallet(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white focus:outline-none focus:border-aeko-accent"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id} className="bg-black">
                  {w.name} — {shortAddress(w.address)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (AEKO)" htmlFor="ad-amount" hint="Whole AEKO units, e.g. 1, 5, 100." required>
            <input
              id="ad-amount"
              type="number"
              min="0.000000001"
              step="0.1"
              value={airdropAmount}
              onChange={(e) => setAirdropAmount(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white focus:outline-none focus:border-aeko-accent"
            />
          </Field>
          <PrimaryButton onClick={handleAirdrop} loading={airdropBusy}>
            <Droplets size={14} />
            Request airdrop
          </PrimaryButton>
        </div>

        {airdropResult && (
          <Toast kind={airdropResult.kind} onDismiss={() => setAirdropResult(null)}>
            <div>{airdropResult.message}</div>
            {airdropResult.signature && (
              <div className="font-mono text-[11px] mt-1 text-gray-300 break-all">
                {airdropResult.signature}
              </div>
            )}
          </Toast>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Send className="text-aeko-accent" size={18} />
          <h3 className="text-base font-semibold text-white">Transfer between wallets</h3>
        </div>

        <div className="space-y-4">
          <Field label="From" htmlFor="tr-from" required>
            <select
              id="tr-from"
              value={fromWalletId}
              onChange={(e) => setFromWalletId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white focus:outline-none focus:border-aeko-accent"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id} className="bg-black">
                  {w.name} — {formatAeko(balances[w.address] || 0)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="To address"
            htmlFor="tr-to"
            hint="Paste any AEKO base58 address, or pick a saved wallet below."
            required
          >
            <input
              id="tr-to"
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="Recipient pubkey"
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white font-mono placeholder:text-gray-500 focus:outline-none focus:border-aeko-accent"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {wallets
                .filter((w) => w.id !== fromWalletId)
                .map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setToAddress(w.address)}
                    className="text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition min-h-[28px]"
                  >
                    {w.name}
                  </button>
                ))}
            </div>
          </Field>
          <Field label="Amount (AEKO)" htmlFor="tr-amount" required>
            <input
              id="tr-amount"
              type="number"
              min="0.000000001"
              step="0.1"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white focus:outline-none focus:border-aeko-accent"
            />
          </Field>
          <PrimaryButton onClick={handleTransfer} loading={transferBusy}>
            <Send size={14} />
            Sign & send
          </PrimaryButton>
        </div>

        {transferResult && (
          <Toast kind={transferResult.kind} onDismiss={() => setTransferResult(null)}>
            <div>{transferResult.message}</div>
            {transferResult.signature && explorerHost && (
              <a
                href={`https://${explorerHost}/explorer/tx/${transferResult.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[11px] text-aeko-accent hover:underline font-mono"
              >
                {shortAddress(transferResult.signature)}
                <ExternalLink size={10} />
              </a>
            )}
          </Toast>
        )}
      </section>
    </div>
  );
}

// ---------- Programs tab (live SocialFi inspector) ----------
//
// Five program cards, each driven by getProgramAccounts + a Borsh decoder.
// The tab polls every PROGRAMS_POLL_MS while open, with a pause toggle and
// a last-sync indicator. Compared with the old "re-probe" registry, every
// card surfaces real chain state — post counts, active stake positions,
// monetization volume, anti-spam mode, etc. — and the values stream in
// without manual refreshes.

const PROGRAMS_POLL_MS = 10_000;

function formatLamports(n) {
  if (n == null) return '—';
  return `${(Number(n) / 1_000_000_000).toLocaleString('en-US', {
    maximumFractionDigits: 4,
  })} AEKO`;
}

function MetricGrid({ items }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
      {items.map(({ label, value, hint }) => (
        <div key={label} className="min-w-0">
          <dt className="text-gray-500 truncate">{label}</dt>
          <dd
            className="font-mono text-white truncate tabular-nums"
            title={hint || (typeof value === 'string' ? value : undefined)}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBadge({ status }) {
  const palette =
    {
      loading: { dot: 'bg-gray-400', label: 'syncing', tone: 'text-gray-400' },
      bootstrapped: { dot: 'bg-green-400', label: 'bootstrapped', tone: 'text-green-300' },
      missing: { dot: 'bg-amber-400', label: 'not bootstrapped', tone: 'text-amber-300' },
      error: { dot: 'bg-red-400', label: 'unreachable', tone: 'text-red-300' },
    }[status] || { dot: 'bg-gray-500', label: status, tone: 'text-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${palette.tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
      {palette.label}
    </span>
  );
}

function ProgramCard({ program, slice, onJumpToFeed, explorerHost }) {
  const status = slice?.status || 'loading';
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{program.name}</div>
          <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{program.blurb}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-3 text-[11px] text-gray-500">program id</div>
      <div className="flex items-center gap-1.5">
        <code className="font-mono text-[11px] text-gray-300 truncate" title={program.programId}>
          {shortAddress(program.programId)}
        </code>
        <CopyButton value={program.programId} label="Copy" />
        {explorerHost && (
          <a
            href={`https://${explorerHost}/explorer/account/${program.programId}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${program.name} on explorer`}
            className="inline-flex items-center justify-center min-w-[28px] min-h-[28px] gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10 hover:text-white transition"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      {status === 'bootstrapped' && slice.stateAccount && (
        <>
          <div className="mt-2 text-[11px] text-gray-500">state account</div>
          <div className="flex items-center gap-1.5">
            <code className="font-mono text-[11px] text-gray-300 truncate" title={slice.stateAccount}>
              {shortAddress(slice.stateAccount)}
            </code>
            <CopyButton value={slice.stateAccount} label="Copy" />
          </div>
          <MetricGrid items={program.metrics(slice.decoded)} />
        </>
      )}

      {status === 'missing' && (
        <div className="mt-3 text-[11px] text-gray-400 leading-relaxed inline-flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin shrink-0" />
          <span>Initializing — bootstrap finalizes within ~30s of a fresh deploy.</span>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-3 text-[11px] text-red-200/90 leading-relaxed break-words">
          {slice.message}
        </div>
      )}

      {status === 'loading' && (
        <div className="mt-3 h-12 rounded-md bg-white/[0.03] animate-pulse" aria-hidden="true" />
      )}

      <div className="mt-auto pt-3 flex items-center gap-3">
        {program.key === 'posts' && status === 'bootstrapped' && onJumpToFeed && (
          <button
            type="button"
            onClick={onJumpToFeed}
            className="text-[11px] text-aeko-accent hover:underline inline-flex items-center gap-1"
          >
            Open mini feed
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </li>
  );
}

const PROGRAM_DEFS_FACTORY = () => [
  {
    key: 'posts',
    registryKey: 'posts',
    name: 'social-posts',
    programId: SOCIAL_POSTS_PROGRAM_ID,
    blurb: 'Anchors user posts and engagement proofs on chain.',
    decode: decodeSocialPostsStateAccount,
    metrics: (s) => [
      { label: 'posts', value: s.posts.length.toLocaleString() },
      { label: 'engagements', value: s.engagementProofs.length.toLocaleString() },
      { label: 'posting', value: s.config.postingEnabled ? 'enabled' : 'disabled' },
      { label: 'engagement', value: s.config.engagementEnabled ? 'enabled' : 'disabled' },
      { label: 'authority', value: shortAddress(s.config.authority), hint: s.config.authority },
      { label: 'max uri', value: `${s.config.maxContentUriLen} chars` },
    ],
  },
  {
    key: 'rewards',
    registryKey: 'rewards',
    name: 'social-rewards',
    programId: SOCIAL_REWARDS_PROGRAM_ID,
    blurb: 'Distributes creator + engagement rewards.',
    decode: decodeSocialRewardsStateAccount,
    metrics: (s) => [
      { label: 'creators', value: s.counts.creators.toLocaleString() },
      { label: 'settled epochs', value: s.counts.settlements.toLocaleString() },
      { label: 'claimable', value: formatLamports(s.totals.totalClaimable) },
      { label: 'rewards', value: s.config.rewardsEnabled ? 'enabled' : 'disabled' },
      { label: 'treasury', value: shortAddress(s.config.treasury), hint: s.config.treasury },
      { label: 'min claim', value: formatLamports(s.config.minClaimAmount) },
    ],
  },
  {
    key: 'staking',
    registryKey: 'staking',
    name: 'social-staking',
    programId: SOCIAL_STAKING_PROGRAM_ID,
    blurb: 'Stake AEKO behind creators; cooldown + slashable.',
    decode: decodeSocialStakingStateAccount,
    metrics: (s) => [
      { label: 'positions', value: s.counts.positions.toLocaleString() },
      { label: 'active', value: s.counts.activePositions.toLocaleString() },
      { label: 'total staked', value: formatLamports(s.totals.totalStaked) },
      { label: 'staking', value: s.config.stakingEnabled ? 'enabled' : 'disabled' },
      { label: 'cooldown', value: `${s.config.cooldownEpochs} epochs` },
      { label: 'min stake', value: formatLamports(s.config.minStakeAmount) },
    ],
  },
  {
    key: 'antiSpam',
    registryKey: 'antiSpam',
    name: 'social-anti-spam',
    programId: SOCIAL_ANTI_SPAM_PROGRAM_ID,
    blurb: 'Reputation, throttling, slash signals.',
    decode: decodeSocialAntiSpamStateAccount,
    metrics: (s) => [
      { label: 'mode', value: s.config.mode },
      { label: 'profiles', value: s.counts.profiles.toLocaleString() },
      { label: 'gated', value: s.counts.gatedProfiles.toLocaleString() },
      { label: 'slashes', value: s.counts.totalSlashes.toLocaleString() },
      { label: 'min reputation', value: s.config.minPostReputation },
      { label: 'slash bps', value: `${s.config.slashBps} bps` },
    ],
  },
  {
    key: 'monetization',
    registryKey: 'monetization',
    name: 'social-monetization',
    programId: SOCIAL_MONETIZATION_PROGRAM_ID,
    blurb: 'Tips, subscriptions, paid-content unlocks.',
    decode: decodeSocialMonetizationStateAccount,
    metrics: (s) => [
      { label: 'tips', value: s.counts.tips.toLocaleString() },
      { label: 'tip volume', value: formatLamports(s.totals.tipsTotal) },
      { label: 'active subs', value: s.counts.activeSubscriptions.toLocaleString() },
      { label: 'unlocks', value: s.counts.unlocks.toLocaleString() },
      { label: 'platform fee', value: `${(s.config.platformFeeBps / 100).toFixed(2)}%` },
      {
        label: 'treasury',
        value: shortAddress(s.config.treasury),
        hint: s.config.treasury,
      },
    ],
  },
];

function ProgramsTab({ rpcUrl, explorerApiUrl, onJumpToFeed }) {
  const programs = useMemo(() => PROGRAM_DEFS_FACTORY(), []);
  const [slices, setSlices] = useState(() =>
    programs.reduce((acc, p) => ({ ...acc, [p.key]: { status: 'loading' } }), {}),
  );
  const [paused, setPaused] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const explorerHost = useMemo(() => {
    try {
      return new URL(rpcUrl).host.replace('rpc.', 'gossip.');
    } catch {
      return '';
    }
  }, [rpcUrl]);

  const probeOne = useCallback(
    async (program) => {
      try {
        // Registry first (operator-published, single HTTP call). Falls
        // back to getProgramAccounts only if the registry has no entry
        // for this program — which is fine for local dev clusters.
        let hit = null;
        if (explorerApiUrl) {
          hit = await discoverViaRegistry({
            rpcUrl,
            explorerApiUrl,
            programKey: program.registryKey,
            decode: program.decode,
          });
        }
        if (!hit) {
          hit = await discoverProgramState({
            rpcUrl,
            programId: program.programId,
            decode: program.decode,
          });
        }
        if (!hit) {
          setSlices((s) => ({ ...s, [program.key]: { status: 'missing' } }));
          return;
        }
        setSlices((s) => ({
          ...s,
          [program.key]: {
            status: 'bootstrapped',
            stateAccount: hit.address,
            decoded: hit.decoded,
            lamports: hit.lamports,
          },
        }));
      } catch (e) {
        setSlices((s) => ({
          ...s,
          [program.key]: { status: 'error', message: e.message || String(e) },
        }));
      }
    },
    [rpcUrl, explorerApiUrl],
  );

  const probeAll = useCallback(async () => {
    setSyncing(true);
    try {
      await Promise.all(programs.map(probeOne));
      setLastSync(Date.now());
    } finally {
      setSyncing(false);
    }
  }, [programs, probeOne]);

  // Initial probe + poll loop.
  useEffect(() => {
    probeAll();
  }, [probeAll]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(probeAll, PROGRAMS_POLL_MS);
    return () => clearInterval(id);
  }, [paused, probeAll]);

  // Ticking clock so "Synced Ns ago" stays current without re-probing.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const syncedAgoSec = lastSync ? Math.max(0, Math.floor((now - lastSync) / 1000)) : null;

  const bootstrappedCount = Object.values(slices).filter((s) => s.status === 'bootstrapped').length;

  return (
    <div className="space-y-5">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <Activity className="text-aeko-accent" size={14} />
          <span>
            <span className="text-white tabular-nums">{bootstrappedCount}</span>
            <span className="text-gray-500"> / {programs.length} bootstrapped</span>
          </span>
          <span className="text-gray-600">·</span>
          <span aria-live="polite">
            {syncing ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> syncing
              </span>
            ) : syncedAgoSec == null ? (
              'awaiting first sync'
            ) : (
              <>synced {syncedAgoSec}s ago</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg border border-white/15 bg-white/5 text-[11px] text-gray-300 hover:bg-white/10 hover:text-white transition"
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          </button>
          <button
            type="button"
            onClick={probeAll}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-lg border border-white/15 bg-white/5 text-[11px] text-gray-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Refresh now
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {programs.map((p) => (
          <ProgramCard
            key={p.key}
            program={p}
            slice={slices[p.key]}
            onJumpToFeed={onJumpToFeed}
            explorerHost={explorerHost}
          />
        ))}
      </ul>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        Each card reads <code className="font-mono">getProgramAccounts</code> on its program ID and
        decodes the returned account with the same Borsh schema the validator uses. Auto-refresh
        polls every {PROGRAMS_POLL_MS / 1000}s — pause it if you want a stable snapshot.
      </p>
    </div>
  );
}

// ---------- Mini SocialFi feed tab ----------
//
// This tab is a real client of the `social-posts` native builtin. It:
//   1. Discovers the state account on chain via getProgramAccounts (no env
//      paste-in required as long as the operator ran social-bootstrap once).
//   2. Polls that state account, decodes the Borsh `SocialPostsStateAccount`
//      blob, and renders the timeline of `PostAnchor` entries.
//   3. Builds + signs AnchorPost / RecordEngagement(Like) instructions
//      browser-side so each compose / like is a genuine on-chain tx from the
//      selected test wallet (it is the signer AND the fee payer).
//
// Everything below talks ONLY to the validator RPC — the explorer-backend
// is not involved, so this works even when api.aeko.online is unhealthy.

function relativeTime(unixSeconds) {
  if (!unixSeconds) return '';
  const diff = Math.floor(Date.now() / 1000) - Number(unixSeconds);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Avatar = first 2 chars of base58 address, deterministic hue from address.
function AvatarDot({ address, size = 36 }) {
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < address.length; i += 1) h = (h * 31 + address.charCodeAt(i)) % 360;
    return h;
  }, [address]);
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold text-black"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 70%, 65%)`,
        fontSize: size * 0.36,
      }}
      aria-hidden="true"
    >
      {address.slice(0, 2)}
    </div>
  );
}

function MiniFeedTab({ wallets, balances, refreshBalance, rpcUrl, explorerApiUrl }) {
  const [discovery, setDiscovery] = useState({ status: 'loading' });
  const [state, setState] = useState(null);
  const [poll, setPoll] = useState({ refreshing: false, error: null, lastSync: null });

  const [composeWalletId, setComposeWalletId] = useState(wallets[0]?.id || '');
  const [composeBody, setComposeBody] = useState('');
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeToast, setComposeToast] = useState(null);

  const [likeBusyByPost, setLikeBusyByPost] = useState({});
  const pollTimer = useRef(null);

  // Keep compose selector valid as wallets change.
  useEffect(() => {
    if (!wallets.find((w) => w.id === composeWalletId)) {
      setComposeWalletId(wallets[0]?.id || '');
    }
  }, [wallets, composeWalletId]);

  const composeWallet = wallets.find((w) => w.id === composeWalletId);
  const composeBalance = composeWallet ? balances[composeWallet.address] : null;

  const refreshFeed = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setPoll((p) => ({ ...p, refreshing: true, error: null }));
      try {
        const { address, decoded } = await discoverSocialPostsStateAccount(
          rpcUrl,
          explorerApiUrl,
        );
        setDiscovery({ status: 'ok', stateAccount: address });
        setState(decoded);
        setPoll({ refreshing: false, error: null, lastSync: Date.now() });
      } catch (e) {
        if (!silent) setPoll((p) => ({ ...p, refreshing: false, error: e.message || String(e) }));
        setDiscovery((d) => (d.status === 'ok' ? d : { status: 'error', message: e.message || String(e) }));
      }
    },
    [rpcUrl, explorerApiUrl],
  );

  useEffect(() => {
    refreshFeed();
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => refreshFeed({ silent: true }), 8000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refreshFeed]);

  const handlePost = useCallback(async () => {
    setComposeToast(null);
    if (!composeWallet) {
      setComposeToast({ kind: 'error', message: 'Pick a wallet first.' });
      return;
    }
    const body = composeBody.trim();
    if (!body) {
      setComposeToast({ kind: 'error', message: 'Write something to anchor.' });
      return;
    }
    if (body.length > MAX_POST_LEN) {
      setComposeToast({ kind: 'error', message: `Posts are capped at ${MAX_POST_LEN} chars.` });
      return;
    }
    if (discovery.status !== 'ok') {
      setComposeToast({ kind: 'error', message: 'Feed state account not discovered yet.' });
      return;
    }
    if (composeBalance == null || composeBalance < 5000) {
      setComposeToast({
        kind: 'error',
        message: 'This wallet needs ~5000 lamports for fees. Run an airdrop first.',
      });
      return;
    }

    setComposeBusy(true);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      if (!recentBlockhash) throw new Error('No blockhash from RPC.');
      const contentHash = await sha256(body);
      const metadataHash = await sha256('{}');
      const postId = randomBytes32();
      const tx = buildSignedAnchorPostTx({
        creatorWallet: composeWallet,
        stateAccount: discovery.stateAccount,
        recentBlockhash,
        postId,
        contentHash,
        metadataHash,
        contentUri: body,
        postKind: 'original',
        createdAtUnix: Math.floor(Date.now() / 1000),
        visibility: 'public',
      });
      const sig = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, sig);
      setComposeBody('');
      setComposeToast({ kind: 'success', message: 'Anchored on chain.', signature: sig });
      await refreshBalance(composeWallet.address);
      refreshFeed({ silent: true });
    } catch (e) {
      setComposeToast({ kind: 'error', message: e.message || String(e) });
    } finally {
      setComposeBusy(false);
    }
  }, [composeWallet, composeBody, composeBalance, discovery, rpcUrl, refreshBalance, refreshFeed]);

  const handleLike = useCallback(
    async (post) => {
      if (!composeWallet) {
        setComposeToast({ kind: 'error', message: 'Pick a wallet first (used as the liker).' });
        return;
      }
      if (discovery.status !== 'ok') return;
      if (composeBalance == null || composeBalance < 5000) {
        setComposeToast({
          kind: 'error',
          message: 'This wallet needs ~5000 lamports for fees. Run an airdrop first.',
        });
        return;
      }
      setLikeBusyByPost((m) => ({ ...m, [post.postId]: true }));
      try {
        const recentBlockhash = await getLatestBlockhash(rpcUrl);
        if (!recentBlockhash) throw new Error('No blockhash from RPC.');
        const tx = buildSignedLikeTx({
          actorWallet: composeWallet,
          stateAccount: discovery.stateAccount,
          recentBlockhash,
          targetPostId: post.postId,
          targetCreator: post.creator,
          unixTimestamp: Math.floor(Date.now() / 1000),
        });
        const sig = await sendTransaction(rpcUrl, tx);
        await confirmSignature(rpcUrl, sig);
        await refreshBalance(composeWallet.address);
        refreshFeed({ silent: true });
      } catch (e) {
        setComposeToast({ kind: 'error', message: e.message || String(e) });
      } finally {
        setLikeBusyByPost((m) => {
          const next = { ...m };
          delete next[post.postId];
          return next;
        });
      }
    },
    [composeWallet, composeBalance, discovery, rpcUrl, refreshBalance, refreshFeed],
  );

  const posts = state?.posts || [];
  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => b.createdAtUnix - a.createdAtUnix),
    [posts],
  );

  const { likeCountByPost, likedByActorAndPost } = useMemo(
    () => summarizeEngagements(state?.engagementProofs || []),
    [state],
  );

  if (wallets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-gray-400">
        Create at least one wallet on the <strong className="text-white">Wallets</strong> tab to
        post to the on-chain feed.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* State / discovery status row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-2 text-gray-400">
          {discovery.status === 'loading' && (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>discovering state account…</span>
            </>
          )}
          {discovery.status === 'ok' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span>feed state</span>
              <code className="font-mono text-gray-300 truncate max-w-[180px]">
                {shortAddress(discovery.stateAccount)}
              </code>
              <CopyButton value={discovery.stateAccount} label="Copy" />
            </>
          )}
          {discovery.status === 'error' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-red-200">{discovery.message}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => refreshFeed()}
          disabled={poll.refreshing}
          aria-label="Refresh feed"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition min-h-[28px] px-2 disabled:opacity-50"
        >
          <RefreshCw size={12} className={poll.refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Compose */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {composeWallet ? (
            <AvatarDot address={composeWallet.address} />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/10" />
          )}
          <div className="flex-1 min-w-0">
            <label htmlFor="compose-body" className="sr-only">
              Compose post
            </label>
            <textarea
              id="compose-body"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value.slice(0, MAX_POST_LEN))}
              placeholder="What's happening on AEKO?"
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-aeko-accent"
              disabled={composeBusy}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <label htmlFor="compose-wallet" className="text-[11px] text-gray-400 shrink-0">
                  Posting as
                </label>
                <select
                  id="compose-wallet"
                  value={composeWalletId}
                  onChange={(e) => setComposeWalletId(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-white/15 bg-black/30 px-2 text-xs text-white focus:outline-none focus:border-aeko-accent max-w-[200px] truncate"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id} className="bg-black">
                      {w.name} — {shortAddress(w.address)}
                    </option>
                  ))}
                </select>
                {composeWallet && (
                  <span className="text-[11px] text-gray-500 truncate">
                    {composeBalance == null ? '—' : formatAeko(composeBalance)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] tabular-nums ${
                    composeBody.length > MAX_POST_LEN - 20 ? 'text-amber-300' : 'text-gray-500'
                  }`}
                >
                  {composeBody.length}/{MAX_POST_LEN}
                </span>
                <PrimaryButton
                  onClick={handlePost}
                  loading={composeBusy}
                  disabled={!composeBody.trim() || discovery.status !== 'ok'}
                >
                  Anchor post
                </PrimaryButton>
              </div>
            </div>
            {composeToast && (
              <Toast kind={composeToast.kind} onDismiss={() => setComposeToast(null)}>
                <div>{composeToast.message}</div>
                {composeToast.signature && (
                  <div className="font-mono text-[11px] mt-1 text-gray-300 break-all">
                    {composeToast.signature}
                  </div>
                )}
              </Toast>
            )}
          </div>
        </div>
      </section>

      {/* Feed */}
      {discovery.status === 'loading' && (
        <ul className="space-y-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 animate-pulse h-24"
            />
          ))}
        </ul>
      )}

      {discovery.status === 'error' && (
        (() => {
          // The "no state account on chain" error is normal for the first ~30s
          // after a fresh deploy — bootstrap is in flight. Treat it as a soft
          // loading state instead of a red panic banner. Anything else is a
          // genuine RPC/connectivity error and we DO want to surface it.
          const isBootstrapping = /no social-posts state account/i.test(
            discovery.message || '',
          );
          if (isBootstrapping) {
            return (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-aeko-accent shrink-0" />
                <div className="text-sm text-gray-300 leading-relaxed">
                  <div className="font-medium text-white">Initializing on-chain feed…</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    The bootstrap service creates the state account in the background. This pane
                    will populate within ~30 seconds.
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="font-medium mb-1">Couldn't read the feed.</div>
              <div className="text-xs leading-relaxed break-words">{discovery.message}</div>
            </div>
          );
        })()
      )}

      {discovery.status === 'ok' && sortedPosts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
          <MessageSquare className="text-aeko-accent mx-auto mb-3" size={22} />
          <div className="text-sm text-gray-300 font-medium">No posts yet</div>
          <div className="text-xs text-gray-500 mt-1">
            Anchor the first one with the compose box above.
          </div>
        </div>
      )}

      {discovery.status === 'ok' && sortedPosts.length > 0 && (
        <ul className="space-y-3">
          {sortedPosts.map((post) => {
            const likes = likeCountByPost.get(post.postId) || 0;
            const youLiked = composeWallet
              ? likedByActorAndPost.has(`${composeWallet.address}:${post.postId}`)
              : false;
            const liking = Boolean(likeBusyByPost[post.postId]);
            return (
              <li
                key={post.postId}
                className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition p-4"
              >
                <div className="flex items-start gap-3">
                  <AvatarDot address={post.creator} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-white truncate">
                        {shortAddress(post.creator)}
                      </span>
                      <span className="text-gray-600">·</span>
                      <span
                        className="text-gray-500 tabular-nums"
                        title={new Date(post.createdAtUnix * 1000).toISOString()}
                      >
                        {relativeTime(post.createdAtUnix)}
                      </span>
                      {post.moderationState && post.moderationState !== 'active' && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-300 border border-amber-400/30 rounded px-1.5 py-0.5">
                          {post.moderationState}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-white whitespace-pre-wrap break-words">
                      {post.contentUri}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                      <button
                        type="button"
                        onClick={() => handleLike(post)}
                        disabled={liking || !composeWallet}
                        aria-pressed={youLiked}
                        aria-label={youLiked ? 'You liked this post' : 'Like this post'}
                        className={`inline-flex items-center gap-1.5 min-h-[28px] px-2 -ml-2 rounded-md transition ${
                          youLiked
                            ? 'text-pink-300 hover:bg-pink-500/10'
                            : 'hover:bg-white/5 hover:text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {liking ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Heart
                            size={13}
                            className={youLiked ? 'fill-pink-400 stroke-pink-300' : ''}
                          />
                        )}
                        <span className="tabular-nums">{likes}</span>
                      </button>
                      <span className="text-gray-600 font-mono truncate" title={post.postId}>
                        post {post.postId.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
        Posts are anchored as Borsh-encoded <code className="font-mono">AnchorPost</code>{' '}
        instructions to the <code className="font-mono">social-posts</code> builtin (
        <code className="font-mono">{SOCIAL_POSTS_PROGRAM_ID.slice(0, 18)}…</code>). Likes use{' '}
        <code className="font-mono">RecordEngagement</code> on the same program. Every action is a
        real on-chain transaction from the selected test wallet.
      </p>
    </div>
  );
}


// ---------- modal shell ----------

export default function FaucetTestModal({ open, onClose, rpcUrl, network, explorerApiUrl }) {
  const [tab, setTab] = useState('wallets');
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [chainHealth, setChainHealth] = useState({ status: 'idle' });

  useEffect(() => {
    if (!open) return;
    setWallets(loadWallets());
  }, [open]);

  // Refresh a single wallet's balance.
  const refreshBalance = useCallback(
    async (address) => {
      if (!address) return;
      try {
        const lamports = await getBalance(rpcUrl, address);
        setBalances((prev) => ({ ...prev, [address]: lamports }));
      } catch {
        setBalances((prev) => ({ ...prev, [address]: null }));
      }
    },
    [rpcUrl],
  );

  // Poll balances while open, every BALANCE_POLL_MS. Single fetch on tab/list
  // change is via refreshBalance() from the action sites.
  useEffect(() => {
    if (!open) return undefined;
    const tick = async () => {
      await Promise.all(wallets.map((w) => refreshBalance(w.address)));
    };
    tick();
    const id = setInterval(tick, BALANCE_POLL_MS);
    return () => clearInterval(id);
  }, [open, wallets, refreshBalance]);

  // Chain health probe on open (and when RPC changes). Shown in the header
  // so users immediately know whether the testnet RPC is reachable at all
  // — relevant because the explorer-backend has been flaky and surfaced
  // a non-JSON "Bad Gateway" error to users; this one talks directly to
  // the validator RPC.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setChainHealth({ status: 'loading' });
    (async () => {
      try {
        const slot = await getSlot(rpcUrl);
        if (!cancelled) setChainHealth({ status: 'ok', slot });
      } catch (e) {
        if (!cancelled) setChainHealth({ status: 'error', message: e.message || String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rpcUrl]);

  // Esc to close (keyboard escape route).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="faucet-modal-title"
        >
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close test console"
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm cursor-default"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-white/10">
              <div className="min-w-0">
                <h2 id="faucet-modal-title" className="text-base sm:text-lg font-semibold text-white truncate">
                  AEKO test console
                </h2>
                <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    {chainHealth.status === 'ok' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span>{network} · slot {chainHealth.slot.toLocaleString()}</span>
                      </>
                    ) : chainHealth.status === 'loading' ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        <span>connecting…</span>
                      </>
                    ) : chainHealth.status === 'error' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <span className="truncate max-w-[260px]">RPC unreachable</span>
                      </>
                    ) : null}
                  </span>
                  <span className="text-gray-600">·</span>
                  <span className="font-mono truncate max-w-[200px] sm:max-w-[280px]">{rpcUrl}</span>
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

            <nav className="flex border-b border-white/10 px-2 sm:px-4" aria-label="Test console tabs">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 min-h-[44px] text-sm transition ${
                      active ? 'text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{t.label}</span>
                    {active && (
                      <motion.span
                        layoutId="faucet-modal-tab"
                        className="absolute left-2 right-2 bottom-0 h-[2px] bg-aeko-accent rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              {chainHealth.status === 'error' && (
                <Toast kind="error">
                  Could not reach the validator at {rpcUrl}. {chainHealth.message}
                </Toast>
              )}
              {tab === 'wallets' && (
                <WalletsTab
                  wallets={wallets}
                  setWallets={setWallets}
                  balances={balances}
                  refreshBalance={refreshBalance}
                  rpcUrl={rpcUrl}
                />
              )}
              {tab === 'tx' && (
                <AirdropTransferTab
                  wallets={wallets}
                  balances={balances}
                  refreshBalance={refreshBalance}
                  rpcUrl={rpcUrl}
                />
              )}
              {tab === 'programs' && (
                <ProgramsTab
                  rpcUrl={rpcUrl}
                  explorerApiUrl={explorerApiUrl}
                  onJumpToFeed={() => setTab('social')}
                />
              )}
              {tab === 'social' && (
                <MiniFeedTab
                  wallets={wallets}
                  balances={balances}
                  refreshBalance={refreshBalance}
                  rpcUrl={rpcUrl}
                  explorerApiUrl={explorerApiUrl}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
