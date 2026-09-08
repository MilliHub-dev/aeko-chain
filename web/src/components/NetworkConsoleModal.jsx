import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDownToLine,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import { buildSignedTransfer } from '../utils/aekoTransfer';
import {
  buildSignedAnchorPostTx,
  buildSignedLikeTx,
  discoverSocialPostsStateAccount,
  randomBytes32,
  sha256,
  summarizeEngagements,
} from '../utils/aekoSocial';

const TAB_DEFS = [
  { key: 'accounts', label: 'Accounts', icon: WalletCards },
  { key: 'programs', label: 'Programs', icon: Activity },
  { key: 'social', label: 'Social', icon: MessageCircle },
];

const PROGRAM_LABELS = {
  posts: { name: 'Social Posts', capability: 'Live actions available' },
  rewards: { name: 'Creator Rewards', capability: 'Action UI coming soon' },
  staking: { name: 'Creator Staking', capability: 'Action UI coming soon' },
  antiSpam: { name: 'Anti-spam', capability: 'Action UI coming soon' },
  monetization: { name: 'Monetization', capability: 'Action UI coming soon' },
};

const MAX_POST_LEN = 512;
const AEKO_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy address"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <span className="text-[10px] text-green-300">OK</span> : <Copy size={13} />}
    </button>
  );
}

function TxLink({ signature, explorerUrl, compact = false }) {
  if (!signature) return null;
  const href = `${explorerUrl.replace(/\/$/, '')}/explorer/tx/${signature}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-aeko-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
      title={signature}
    >
      <span className="truncate">{compact ? shortAddress(signature) : signature}</span>
      <ExternalLink size={10} className="shrink-0" />
    </a>
  );
}

function AccountLink({ address, explorerUrl }) {
  return (
    <a
      href={`${explorerUrl.replace(/\/$/, '')}/explorer/account/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-gray-300 hover:text-aeko-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
      title={address}
    >
      <span className="truncate">{shortAddress(address)}</span>
      <ExternalLink size={10} className="shrink-0" />
    </a>
  );
}

function ResultBanner({ result, explorerUrl }) {
  if (!result) return null;
  const ok = result.kind === 'success';
  return (
    <div
      className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${
        ok
          ? 'border-green-400/25 bg-green-500/10 text-green-100'
          : 'border-red-400/25 bg-red-500/10 text-red-100'
      }`}
      role="status"
    >
      <div>{result.message}</div>
      {result.signature && (
        <div className="mt-1.5 max-w-full overflow-hidden">
          <TxLink signature={result.signature} explorerUrl={explorerUrl} />
        </div>
      )}
    </div>
  );
}

function WalletChildDialog({ title, subtitle, icon: Icon, onClose, children }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <motion.div
      data-network-child-dialog="true"
      className="fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="presentation"
    >
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.985 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#101114] shadow-2xl sm:max-w-xl sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-child-dialog-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/25 bg-aeko-accent/10 text-aeko-accent">
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <h3 id="wallet-child-dialog-title" className="text-base font-semibold text-white">
                {title}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
      </motion.section>
    </motion.div>
  );
}

function WalletIdentity({ wallet, balance, explorerUrl, compact = false }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/25 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/20 bg-aeko-accent/10 text-sm font-semibold text-aeko-accent">
          {(wallet.name || 'W').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{wallet.name}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <AccountLink address={wallet.address} explorerUrl={explorerUrl} />
            <CopyButton value={wallet.address} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Balance</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-white">
            {balance == null ? 'Unavailable' : formatAeko(balance)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateWalletDialog({ wallets, onPersist, onClose }) {
  const [name, setName] = useState('');

  const createWallet = () => {
    const wallet = generateTestWallet(name);
    onPersist([...wallets, wallet]);
    onClose();
  };

  return (
    <WalletChildDialog
      title="Create test wallet"
      subtitle="Generate a new ed25519 keypair in this browser for AEKO testnet use."
      icon={Plus}
      onClose={onClose}
    >
      <label htmlFor="new-wallet-name" className="text-xs font-medium text-gray-300">
        Wallet name
      </label>
      <input
        id="new-wallet-name"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') createWallet();
        }}
        placeholder="e.g. Creator wallet"
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-base text-white outline-none placeholder:text-gray-600 focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
      />
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-100/80">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <span>This key is stored unencrypted in this browser. Use it only for testnet funds and testing.</span>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm text-gray-400 hover:bg-white/5 hover:text-white">
          Cancel
        </button>
        <button type="button" onClick={createWallet} className="h-11 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black hover:brightness-110">
          Create wallet
        </button>
      </div>
    </WalletChildDialog>
  );
}

function RequestAekoDialog({ wallet, balance, rpcUrl, explorerUrl, refreshBalance, onClose }) {
  const [amount, setAmount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const runAirdrop = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const signature = await requestAirdrop(rpcUrl, wallet.address, aekoToLamports(numericAmount));
      await confirmSignature(rpcUrl, signature);
      await refreshBalance(wallet.address);
      setResult({ kind: 'success', message: `${numericAmount} test AEKO added to ${wallet.name}.`, signature });
    } catch (error) {
      setResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WalletChildDialog
      title="Request test AEKO"
      subtitle="Fund this wallet from the testnet airdrop RPC without changing the active wallet anywhere else."
      icon={ArrowDownToLine}
      onClose={onClose}
    >
      <WalletIdentity wallet={wallet} balance={balance} explorerUrl={explorerUrl} compact />

      <div className="mt-5">
        <label htmlFor="airdrop-amount" className="text-xs font-medium text-gray-300">Amount</label>
        <div className="relative mt-2">
          <input
            id="airdrop-amount"
            type="number"
            min="0.000000001"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 pr-16 text-base tabular-nums text-white outline-none focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">AEKO</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 5, 10, 100].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className="min-h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-400 hover:bg-white/[0.07] hover:text-white"
            >
              {value} AEKO
            </button>
          ))}
        </div>
      </div>

      <ResultBanner result={result} explorerUrl={explorerUrl} />

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm text-gray-400 hover:bg-white/5 hover:text-white">
          Close
        </button>
        <button
          type="button"
          onClick={runAirdrop}
          disabled={busy}
          className="inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Request AEKO
        </button>
      </div>
    </WalletChildDialog>
  );
}

function SendAekoDialog({ wallet, wallets, balances, rpcUrl, explorerUrl, refreshBalance, onClose }) {
  const [recipientInput, setRecipientInput] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [recipientFocused, setRecipientFocused] = useState(false);
  const [amount, setAmount] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const availableWallets = useMemo(
    () => wallets.filter((item) => item.id !== wallet.id),
    [wallets, wallet.id],
  );

  const suggestions = useMemo(() => {
    const query = recipientInput.trim().toLowerCase();
    if (!query) return availableWallets.slice(0, 6);
    return availableWallets
      .filter((item) => item.name.toLowerCase().includes(query) || item.address.toLowerCase().includes(query))
      .slice(0, 6);
  }, [availableWallets, recipientInput]);

  const exactNamedWallet = useMemo(() => {
    const query = recipientInput.trim().toLowerCase();
    if (!query) return null;
    return availableWallets.find((item) => item.name.toLowerCase() === query || item.address.toLowerCase() === query) || null;
  }, [availableWallets, recipientInput]);

  const selectedRecipient =
    availableWallets.find((item) => item.id === selectedRecipientId) || exactNamedWallet;
  const destinationAddress = selectedRecipient?.address || recipientInput.trim();
  const isExternalAddress = !selectedRecipient && AEKO_ADDRESS_PATTERN.test(destinationAddress);
  const recipientValid = Boolean(selectedRecipient || isExternalAddress) && destinationAddress !== wallet.address;
  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const balance = balances[wallet.address];
  const exceedsKnownBalance =
    amountValid && balance != null && aekoToLamports(numericAmount) > Number(balance);

  const chooseRecipient = (recipientWallet) => {
    setSelectedRecipientId(recipientWallet.id);
    setRecipientInput(recipientWallet.name);
    setRecipientFocused(false);
    setResult(null);
  };

  const runTransfer = async () => {
    if (!recipientValid) {
      setResult({ kind: 'error', message: 'Choose a saved wallet or enter a complete AEKO address.' });
      return;
    }
    if (!amountValid) {
      setResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    if (exceedsKnownBalance) {
      setResult({ kind: 'error', message: 'That amount is greater than the wallet balance.' });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      if (!recentBlockhash) throw new Error('Could not fetch a recent blockhash.');
      const tx = buildSignedTransfer({
        fromWallet: wallet,
        toAddress: destinationAddress,
        lamports: aekoToLamports(numericAmount),
        recentBlockhash,
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      await Promise.all([refreshBalance(wallet.address), refreshBalance(destinationAddress)]);
      setResult({
        kind: 'success',
        message: `Sent ${numericAmount} AEKO to ${selectedRecipient?.name || shortAddress(destinationAddress)}.`,
        signature,
      });
    } catch (error) {
      setResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WalletChildDialog
      title={`Send from ${wallet.name}`}
      subtitle="Choose another saved wallet by name, or paste any valid AEKO address."
      icon={Send}
      onClose={onClose}
    >
      <WalletIdentity wallet={wallet} balance={balance} explorerUrl={explorerUrl} compact />

      <div className="mt-5">
        <label htmlFor="send-recipient" className="text-xs font-medium text-gray-300">Recipient</label>
        <div className="relative mt-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              id="send-recipient"
              autoFocus
              autoComplete="off"
              value={recipientInput}
              onFocus={() => setRecipientFocused(true)}
              onBlur={() => window.setTimeout(() => setRecipientFocused(false), 120)}
              onChange={(event) => {
                setRecipientInput(event.target.value);
                setSelectedRecipientId('');
                setResult(null);
              }}
              placeholder="Wallet name or AEKO address"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-base text-white outline-none placeholder:text-gray-600 focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
            />
          </div>

          {recipientFocused && availableWallets.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-xl border border-white/10 bg-[#17181c] p-1 shadow-2xl">
              <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-600">
                Saved wallets
              </div>
              {suggestions.length > 0 ? suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseRecipient(item)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold text-gray-300">
                    {(item.name || 'W').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{item.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-gray-600">{shortAddress(item.address)}</div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                    {balances[item.address] == null ? '—' : formatAeko(balances[item.address])}
                  </span>
                </button>
              )) : (
                <div className="px-3 py-3 text-xs text-gray-500">No saved wallet matches. Continue typing a full address.</div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 min-h-5 text-[11px]">
          {selectedRecipient ? (
            <span className="text-green-300">Sending to saved wallet: {selectedRecipient.name} · {shortAddress(selectedRecipient.address)}</span>
          ) : recipientInput.trim() && isExternalAddress ? (
            <span className="text-aeko-accent">External address recognized · {shortAddress(destinationAddress)}</span>
          ) : recipientInput.trim() ? (
            <span className="text-gray-500">Choose a suggestion, type an exact saved wallet name, or enter a full base58 address.</span>
          ) : (
            <span className="text-gray-600">Saved wallet names appear first so you do not have to work with addresses.</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="send-amount" className="text-xs font-medium text-gray-300">Amount</label>
        <div className="relative mt-2">
          <input
            id="send-amount"
            type="number"
            min="0.000000001"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setResult(null);
            }}
            className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 pr-16 text-base tabular-nums text-white outline-none focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">AEKO</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[0.1, 1, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className="min-h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-400 hover:bg-white/[0.07] hover:text-white"
            >
              {value} AEKO
            </button>
          ))}
        </div>
        {exceedsKnownBalance && <div className="mt-2 text-xs text-red-300">Amount exceeds the known wallet balance.</div>}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs">
        <div className="flex items-center justify-between gap-3 text-gray-500"><span>From</span><span className="font-medium text-gray-200">{wallet.name}</span></div>
        <div className="mt-2 flex items-center justify-between gap-3 text-gray-500"><span>To</span><span className="max-w-[70%] truncate font-medium text-gray-200">{selectedRecipient?.name || (destinationAddress ? shortAddress(destinationAddress) : 'Not selected')}</span></div>
        <div className="mt-2 flex items-center justify-between gap-3 text-gray-500"><span>Network fee</span><span className="text-gray-300">Determined by validator</span></div>
      </div>

      <ResultBanner result={result} explorerUrl={explorerUrl} />

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm text-gray-400 hover:bg-white/5 hover:text-white">Close</button>
        <button
          type="button"
          onClick={runTransfer}
          disabled={busy || !recipientValid || !amountValid || exceedsKnownBalance}
          className="inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Send AEKO
        </button>
      </div>
    </WalletChildDialog>
  );
}

function ManageWalletDialog({ wallet, wallets, balance, explorerUrl, refreshBalance, onPersist, onClose }) {
  const [name, setName] = useState(wallet.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveName = () => {
    const nextName = name.trim();
    if (!nextName) return;
    onPersist(wallets.map((item) => (item.id === wallet.id ? { ...item, name: nextName } : item)));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const removeWallet = () => {
    onPersist(wallets.filter((item) => item.id !== wallet.id));
    onClose();
  };

  return (
    <WalletChildDialog
      title={`Manage ${wallet.name}`}
      subtitle="Rename, inspect, refresh, or remove this browser-local test wallet."
      icon={Settings2}
      onClose={onClose}
    >
      <WalletIdentity wallet={wallet} balance={balance} explorerUrl={explorerUrl} compact />

      <div className="mt-5">
        <label htmlFor="manage-wallet-name" className="text-xs font-medium text-gray-300">Wallet name</label>
        <div className="mt-2 flex gap-2">
          <input
            id="manage-wallet-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-base text-white outline-none focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={!name.trim() || name.trim() === wallet.name}
            className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/20 text-xs">
        <div className="flex items-center justify-between gap-4 px-3 py-3"><dt className="text-gray-500">Created</dt><dd className="text-right text-gray-300">{wallet.createdAt ? new Date(wallet.createdAt).toLocaleString() : 'Unknown'}</dd></div>
        <div className="flex items-center justify-between gap-4 px-3 py-3"><dt className="text-gray-500">Storage</dt><dd className="text-right text-gray-300">This browser only</dd></div>
        <div className="flex items-center justify-between gap-4 px-3 py-3"><dt className="text-gray-500">Key type</dt><dd className="text-right text-gray-300">ed25519 test keypair</dd></div>
      </dl>

      <button
        type="button"
        onClick={() => refreshBalance(wallet.address)}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-300 hover:bg-white/[0.07]"
      >
        <RefreshCw size={13} /> Refresh wallet balance
      </button>

      <div className="mt-6 rounded-xl border border-red-400/15 bg-red-500/[0.05] p-4">
        <div className="text-sm font-medium text-red-100">Remove wallet from this browser</div>
        <p className="mt-1 text-xs leading-relaxed text-red-100/60">Removing it deletes the locally stored secret key. This cannot be undone from the console.</p>
        {confirmDelete ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={removeWallet} className="h-10 rounded-xl bg-red-500 px-4 text-xs font-semibold text-white">Yes, remove wallet</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 rounded-xl px-4 text-xs text-gray-400 hover:bg-white/5 hover:text-white">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-red-400/20 px-3 text-xs text-red-200 hover:bg-red-500/10">
            <Trash2 size={13} /> Remove wallet
          </button>
        )}
      </div>
    </WalletChildDialog>
  );
}

function WalletCard({ wallet, balance, explorerUrl, onAction, onRefresh }) {
  return (
    <article className="group flex min-h-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/15 hover:bg-white/[0.045]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/20 bg-aeko-accent/10 text-sm font-semibold text-aeko-accent">
            {(wallet.name || 'W').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{wallet.name}</div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <AccountLink address={wallet.address} explorerUrl={explorerUrl} />
              <CopyButton value={wallet.address} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRefresh(wallet.address)}
            aria-label={`Refresh ${wallet.name} balance`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="mt-6">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-600">Available test balance</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-white">
            {balance == null ? 'Unavailable' : formatAeko(balance)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${balance == null ? 'bg-gray-600' : Number(balance) > 0 ? 'bg-green-400' : 'bg-amber-400'}`} />
            {balance == null ? 'Balance read failed' : Number(balance) > 0 ? 'Ready to transact' : 'Needs test AEKO'}
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 border-t border-white/10 bg-black/15 p-2">
        <button type="button" onClick={() => onAction('send', wallet)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-gray-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70">
          <Send size={14} className="text-aeko-accent" /> Send
        </button>
        <button type="button" onClick={() => onAction('request', wallet)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-gray-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70">
          <ArrowDownToLine size={14} className="text-aeko-accent" /> Request
        </button>
        <button type="button" onClick={() => onAction('manage', wallet)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-gray-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70">
          <Settings2 size={14} /> Manage
        </button>
      </div>
    </article>
  );
}

function AccountsWorkspace({ rpcUrl, explorerUrl, wallets, setWallets, balances, refreshBalance }) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState(null);

  const persist = useCallback(
    (next) => {
      setWallets(next);
      saveWallets(next);
    },
    [setWallets],
  );

  const filteredWallets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return wallets;
    return wallets.filter((wallet) => wallet.name.toLowerCase().includes(query) || wallet.address.toLowerCase().includes(query));
  }, [wallets, search]);

  const knownBalances = useMemo(
    () => wallets.map((wallet) => balances[wallet.address]).filter((balance) => typeof balance === 'number'),
    [wallets, balances],
  );
  const totalKnownBalance = knownBalances.reduce((sum, balance) => sum + balance, 0);
  const fundedWalletCount = wallets.filter((wallet) => Number(balances[wallet.address] || 0) > 0).length;
  const activeWallet = action ? wallets.find((wallet) => wallet.id === action.walletId) : null;

  const openAction = (type, wallet) => setAction({ type, walletId: wallet.id });
  const closeAction = () => setAction(null);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-aeko-accent/[0.07] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-aeko-accent/20 bg-aeko-accent/[0.07] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-aeko-accent">
              <ShieldCheck size={11} /> Browser-local test wallet center
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">Your AEKO wallets</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
              Each wallet owns its actions. Fund, send, rename, inspect, or remove a wallet without switching global form state.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c0f]"
          >
            <Plus size={15} /> New wallet
          </button>
        </div>

        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-600">Wallets</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-white">{wallets.length}</div>
            <div className="mt-1 text-[11px] text-gray-500">Saved in this browser</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-600">Known balance</div>
            <div className="mt-1 truncate text-xl font-semibold tabular-nums text-white">{knownBalances.length ? formatAeko(totalKnownBalance) : '—'}</div>
            <div className="mt-1 text-[11px] text-gray-500">Across readable wallets</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-600">Ready</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-white">{fundedWalletCount}/{wallets.length || 0}</div>
            <div className="mt-1 text-[11px] text-gray-500">Wallets with test AEKO</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Wallet directory</h4>
            <p className="mt-0.5 text-xs text-gray-500">Wallet names become contacts automatically when you send AEKO.</p>
          </div>
          {wallets.length > 1 && (
            <div className="relative w-full sm:w-72">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find wallet by name or address"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-aeko-accent focus:ring-2 focus:ring-aeko-accent/15"
              />
            </div>
          )}
        </div>
      </section>

      {wallets.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/15 bg-black/15 px-5 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-gray-500">
            <WalletCards size={24} />
          </div>
          <h4 className="mt-4 text-base font-semibold text-white">No test wallets yet</h4>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">Create a wallet, then manage funding and transfers directly from that wallet card.</p>
          <button type="button" onClick={() => setCreateOpen(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black">
            <Plus size={15} /> Create first wallet
          </button>
        </section>
      ) : filteredWallets.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-gray-500">
          No wallet matches “{search}”.
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredWallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              balance={balances[wallet.address]}
              explorerUrl={explorerUrl}
              onAction={openAction}
              onRefresh={refreshBalance}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-gray-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-gray-500" />
        <span>These are disposable testnet wallets stored unencrypted in localStorage. Do not put mainnet assets or production secrets in them.</span>
      </div>

      <AnimatePresence>
        {createOpen && (
          <CreateWalletDialog wallets={wallets} onPersist={persist} onClose={() => setCreateOpen(false)} />
        )}
        {activeWallet && action?.type === 'send' && (
          <SendAekoDialog
            wallet={activeWallet}
            wallets={wallets}
            balances={balances}
            rpcUrl={rpcUrl}
            explorerUrl={explorerUrl}
            refreshBalance={refreshBalance}
            onClose={closeAction}
          />
        )}
        {activeWallet && action?.type === 'request' && (
          <RequestAekoDialog
            wallet={activeWallet}
            balance={balances[activeWallet.address]}
            rpcUrl={rpcUrl}
            explorerUrl={explorerUrl}
            refreshBalance={refreshBalance}
            onClose={closeAction}
          />
        )}
        {activeWallet && action?.type === 'manage' && (
          <ManageWalletDialog
            wallet={activeWallet}
            wallets={wallets}
            balance={balances[activeWallet.address]}
            explorerUrl={explorerUrl}
            refreshBalance={refreshBalance}
            onPersist={persist}
            onClose={closeAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgramsWorkspace({ explorerApiUrl, explorerUrl, onOpenSocial }) {
  const [status, setStatus] = useState({ loading: true, data: null, error: null });

  const refresh = useCallback(async () => {
    setStatus((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch(`${explorerApiUrl.replace(/\/$/, '')}/social/status`);
      if (!response.ok) throw new Error(`Explorer API returned HTTP ${response.status}.`);
      const body = await response.json();
      setStatus({ loading: false, data: body.data, error: null });
    } catch (error) {
      setStatus({ loading: false, data: null, error: error.message || String(error) });
    }
  }, [explorerApiUrl]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const domains = status.data?.domains || {};
  const ready = Object.values(domains).filter((domain) => domain.initialized && domain.ownerMatches && !domain.error).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <div className="text-sm font-semibold text-white">Native SocialFi protocol state</div>
          <div className="mt-1 text-xs text-gray-500">Live verification from Explorer API → validator RPC. No browser-side program scan.</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs ${status.data?.complete ? 'border-green-400/30 bg-green-500/10 text-green-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>{ready}/5 ready</span>
          <button type="button" onClick={refresh} disabled={status.loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><RefreshCw size={12} className={status.loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </div>

      {status.error && <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">{status.error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(PROGRAM_LABELS).map(([key, meta]) => {
          const domain = domains[key];
          const ok = domain?.initialized && domain?.ownerMatches && !domain?.error;
          return (
            <article key={key} className="flex min-h-52 flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="text-sm font-semibold text-white">{meta.name}</h3><div className="mt-1 text-[11px] text-gray-500">{key === 'posts' ? 'Posting, replies, reposts and engagement proofs.' : meta.capability}</div></div>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-green-400' : domain ? 'bg-amber-400' : 'bg-gray-600'}`} />
              </div>
              {domain ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <div><div className="text-gray-600">program</div><AccountLink address={domain.programId} explorerUrl={explorerUrl} /></div>
                    <div><div className="text-gray-600">state</div>{domain.stateAccount ? <AccountLink address={domain.stateAccount} explorerUrl={explorerUrl} /> : <span className="text-amber-300">not published</span>}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(domain.metrics || {}).slice(0, 6).map(([label, value]) => <span key={label} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-gray-400"><span className="text-gray-600">{label}</span> {String(value)}</span>)}
                  </div>
                  {domain.error && <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-100">{domain.error}</div>}
                </>
              ) : <div className="mt-4 h-20 animate-pulse rounded-xl bg-white/[0.03]" />}
              <div className="mt-auto pt-4">
                {key === 'posts' && ok ? (
                  <button type="button" onClick={onOpenSocial} className="text-xs font-medium text-aeko-accent hover:underline">Open Social timeline →</button>
                ) : (
                  <span className="text-[11px] text-gray-600">{key === 'posts' ? 'Waiting for valid bootstrap state' : 'Transactional console coming soon'}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SocialWorkspace({ rpcUrl, explorerApiUrl, explorerUrl, wallets, balances, refreshBalance }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [body, setBody] = useState('');
  const [state, setState] = useState(null);
  const [stateAccount, setStateAccount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [feedMode, setFeedMode] = useState('all');
  const [profileAddress, setProfileAddress] = useState('');
  const [indexStatus, setIndexStatus] = useState(null);

  useEffect(() => {
    if (!wallets.some((wallet) => wallet.id === walletId)) setWalletId(wallets[0]?.id || '');
  }, [wallets, walletId]);

  const wallet = wallets.find((item) => item.id === walletId);

  const refresh = useCallback(async () => {
    try {
      const discovered = await discoverSocialPostsStateAccount(rpcUrl, explorerApiUrl);
      setStateAccount(discovered.address);
      setState(discovered.decoded);
      setError('');
      try {
        const response = await fetch(`${explorerApiUrl.replace(/\/$/, '')}/posts?limit=100`);
        const payload = response.ok ? await response.json() : null;
        setIndexStatus({ ok: response.ok, count: payload?.data?.length ?? null });
      } catch {
        setIndexStatus({ ok: false, count: null });
      }
    } catch (refreshError) {
      setError(refreshError.message || String(refreshError));
    }
  }, [rpcUrl, explorerApiUrl]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const publish = async (kind = 'original', target = null) => {
    if (!wallet || !body.trim() || !stateAccount) return;
    setBusy('publish');
    setResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const content = body.trim();
      const tx = buildSignedAnchorPostTx({
        creatorWallet: wallet,
        stateAccount,
        recentBlockhash,
        postId: randomBytes32(),
        contentHash: await sha256(content),
        metadataHash: await sha256('{}'),
        contentUri: content,
        parentPostId: target?.postId || null,
        postKind: kind,
        createdAtUnix: Math.floor(Date.now() / 1000),
        visibility: 'public',
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      await refreshBalance(wallet.address);
      setBody('');
      setReplyTo(null);
      setResult({ kind: 'success', message: `${kind === 'original' ? 'Post' : kind} confirmed on chain.`, signature });
      await refresh();
    } catch (publishError) {
      setResult({ kind: 'error', message: publishError.message || String(publishError) });
    } finally {
      setBusy('');
    }
  };

  const like = async (post) => {
    if (!wallet || !stateAccount) return;
    setBusy(`like:${post.postId}`);
    setResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const tx = buildSignedLikeTx({
        actorWallet: wallet,
        stateAccount,
        recentBlockhash,
        targetPostId: post.postId,
        targetCreator: post.creator,
        unixTimestamp: Math.floor(Date.now() / 1000),
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      await refreshBalance(wallet.address);
      setResult({ kind: 'success', message: 'Like recorded on chain.', signature });
      await refresh();
    } catch (likeError) {
      setResult({ kind: 'error', message: likeError.message || String(likeError) });
    } finally {
      setBusy('');
    }
  };

  const sorted = useMemo(() => [...(state?.posts || [])].sort((a, b) => b.createdAtUnix - a.createdAtUnix), [state]);
  const engagements = useMemo(() => summarizeEngagements(state?.engagementProofs || []), [state]);
  const visible = useMemo(() => {
    if (feedMode === 'mine' && wallet) return sorted.filter((post) => post.creator === wallet.address);
    if (feedMode === 'profile' && profileAddress) return sorted.filter((post) => post.creator === profileAddress);
    return sorted;
  }, [sorted, feedMode, wallet, profileAddress]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="flex items-center gap-2 text-gray-400"><span className={`h-2 w-2 rounded-full ${stateAccount ? 'bg-green-400' : 'bg-amber-400'}`} />{stateAccount ? <>state <AccountLink address={stateAccount} explorerUrl={explorerUrl} /></> : 'Social Posts state unavailable'}</div>
          <div className="flex items-center gap-2 text-gray-500"><span>Explorer index {indexStatus?.ok ? `${indexStatus.count ?? '—'} posts` : 'degraded'}</span><button type="button" onClick={refresh} className="rounded-lg p-2 hover:bg-white/5 hover:text-white"><RefreshCw size={12} /></button></div>
        </div>

        {error && <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100"><div className="font-medium">Social state is not ready.</div><div className="mt-1 text-xs leading-relaxed">{error}</div><div className="mt-2 text-xs text-amber-200/80">Check Explorer <code>/social/status</code> and the <code>social-bootstrap</code> service. This is not treated as a perpetual 30-second loading state.</div></div>}

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {replyTo && <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400"><span>Replying to {shortAddress(replyTo.creator)}</span><button type="button" onClick={() => setReplyTo(null)}><X size={13} /></button></div>}
          <textarea value={body} onChange={(event) => setBody(event.target.value.slice(0, MAX_POST_LEN))} rows={3} placeholder={replyTo ? 'Write your reply…' : "What's happening on AEKO?"} className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none placeholder:text-gray-600 focus:border-aeko-accent" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select value={walletId} onChange={(event) => setWalletId(event.target.value)} className="h-9 max-w-56 rounded-lg border border-white/10 bg-black/30 px-2 text-xs">
              {wallets.map((item) => <option key={item.id} value={item.id}>{item.name} · {shortAddress(item.address)}</option>)}
            </select>
            {wallet && <span className="text-[11px] text-gray-500">{balances[wallet.address] == null ? '—' : formatAeko(balances[wallet.address])}</span>}
            <span className="ml-auto text-[11px] text-gray-600">{body.length}/{MAX_POST_LEN}</span>
            <button type="button" disabled={!wallet || !body.trim() || !stateAccount || busy === 'publish'} onClick={() => publish(replyTo ? 'reply' : 'original', replyTo)} className="inline-flex h-9 items-center gap-2 rounded-full bg-aeko-accent px-4 text-xs font-semibold text-black disabled:opacity-40">{busy === 'publish' && <Loader2 size={12} className="animate-spin" />}{replyTo ? 'Reply' : 'Post'}</button>
          </div>
          <ResultBanner result={result} explorerUrl={explorerUrl} />
        </section>

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-1">
          {[['all', 'For everyone'], ['mine', 'My posts'], ['profile', 'User feed']].map(([key, label]) => <button key={key} type="button" onClick={() => setFeedMode(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${feedMode === key ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>{label}</button>)}
          {feedMode === 'profile' && <input value={profileAddress} onChange={(event) => setProfileAddress(event.target.value.trim())} placeholder="Wallet address" className="ml-2 min-w-52 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-[11px] outline-none focus:border-aeko-accent" />}
        </div>

        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          {visible.map((post) => {
            const likes = engagements.likeCountByPost.get(post.postId) || 0;
            return (
              <article key={post.postId} className="p-4 transition hover:bg-white/[0.025]">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5"><UserRound size={17} className="text-gray-400" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs"><button type="button" onClick={() => { setProfileAddress(post.creator); setFeedMode('profile'); }} className="font-semibold text-white hover:text-aeko-accent">{shortAddress(post.creator)}</button><span className="text-gray-600">·</span><span className="text-gray-500">{new Date(post.createdAtUnix * 1000).toLocaleString()}</span>{post.postKind !== 'original' && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-gray-500">{post.postKind}</span>}</div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-100">{post.contentUri}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                      <button type="button" onClick={() => setReplyTo(post)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 hover:bg-white/5 hover:text-white"><MessageCircle size={13} /> Reply</button>
                      <button type="button" disabled={busy === `like:${post.postId}` || !wallet} onClick={() => like(post)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 hover:bg-pink-500/10 hover:text-pink-300 disabled:opacity-40">{busy === `like:${post.postId}` ? <Loader2 size={13} className="animate-spin" /> : <Heart size={13} />} {likes}</button>
                      <button type="button" disabled={!wallet || busy === 'publish'} onClick={() => { setBody(`Repost from ${shortAddress(post.creator)}: ${post.contentUri}`.slice(0, MAX_POST_LEN)); setReplyTo(post); }} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 hover:bg-green-500/10 hover:text-green-300"><Repeat2 size={13} /> Quote</button>
                      <span className="ml-auto font-mono text-[10px] text-gray-700">{post.postId.slice(0, 10)}…</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {visible.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No posts in this timeline yet.</div>}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-semibold text-white">Active identity</h3>{wallet ? <><div className="mt-3"><AccountLink address={wallet.address} explorerUrl={explorerUrl} /></div><div className="mt-2 text-xs text-gray-500">{balances[wallet.address] == null ? 'Balance unavailable' : formatAeko(balances[wallet.address])}</div></> : <div className="mt-3 text-xs text-gray-500">Create a wallet in Accounts first.</div>}</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-semibold text-white">On-chain capabilities</h3><ul className="mt-3 space-y-2 text-xs text-gray-500"><li>Original posts</li><li>Replies and quote/repost anchors</li><li>Likes as engagement proofs</li><li>Creator-filtered timelines</li><li>Post editing exists in the protocol but is not exposed here yet.</li><li>Creator delete is not a Social Posts instruction, so the UI does not fake one.</li></ul></div>
      </aside>
    </div>
  );
}

export default function NetworkConsoleModal({
  open,
  onClose,
  tab,
  onTabChange,
  rpcUrl,
  explorerApiUrl,
  explorerUrl,
  network,
}) {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [slot, setSlot] = useState(null);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    if (open) setWallets(loadWallets());
  }, [open]);

  const refreshBalance = useCallback(async (address) => {
    if (!address) return;
    try {
      const balance = await getBalance(rpcUrl, address);
      setBalances((current) => ({ ...current, [address]: balance }));
    } catch {
      setBalances((current) => ({ ...current, [address]: null }));
    }
  }, [rpcUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const tick = async () => {
      try {
        setSlot(await getSlot(rpcUrl));
        setHealthError('');
      } catch (error) {
        setHealthError(error.message || String(error));
      }
      await Promise.all(wallets.map((wallet) => refreshBalance(wallet.address)));
    };
    tick();
    const timer = window.setInterval(tick, 10000);
    return () => window.clearInterval(timer);
  }, [open, rpcUrl, wallets, refreshBalance]);

  useEffect(() => {
    if (!open) return undefined;
    const listener = (event) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-network-child-dialog="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="network-console-title">
          <button type="button" aria-label="Close network console" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b0c0f] shadow-2xl sm:max-w-6xl sm:rounded-3xl">
            <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
              <div className="min-w-0"><h2 id="network-console-title" className="truncate text-lg font-semibold text-white">AEKO Network Console</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500"><span className={`h-1.5 w-1.5 rounded-full ${healthError ? 'bg-red-400' : 'bg-green-400'}`} /><span>{network}</span><span>·</span><span>{slot == null ? 'connecting' : `slot ${slot.toLocaleString()}`}</span><span className="hidden sm:inline">· {rpcUrl}</span></div></div>
              <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </header>

            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-black/20 px-3 py-2 sm:px-5" aria-label="Network console sections">
              {TAB_DEFS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.key;
                return <button key={item.key} type="button" onClick={() => onTabChange(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm transition ${active ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}><Icon size={14} />{item.label}</button>;
              })}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              {healthError && <div className="mb-4 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-100">RPC health check failed: {healthError}</div>}
              {tab === 'accounts' && <AccountsWorkspace rpcUrl={rpcUrl} explorerUrl={explorerUrl} wallets={wallets} setWallets={setWallets} balances={balances} refreshBalance={refreshBalance} />}
              {tab === 'programs' && <ProgramsWorkspace explorerApiUrl={explorerApiUrl} explorerUrl={explorerUrl} onOpenSocial={() => onTabChange('social')} />}
              {tab === 'social' && <SocialWorkspace rpcUrl={rpcUrl} explorerApiUrl={explorerApiUrl} explorerUrl={explorerUrl} wallets={wallets} balances={balances} refreshBalance={refreshBalance} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
