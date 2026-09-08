import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDownToLine,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Send,
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

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white"
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
      className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-aeko-accent hover:underline"
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
      className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-gray-300 hover:text-aeko-accent"
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
      className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
        ok
          ? 'border-green-400/25 bg-green-500/10 text-green-100'
          : 'border-red-400/25 bg-red-500/10 text-red-100'
      }`}
    >
      <div>{result.message}</div>
      {result.signature && (
        <div className="mt-1 max-w-full overflow-hidden">
          <TxLink signature={result.signature} explorerUrl={explorerUrl} />
        </div>
      )}
    </div>
  );
}

function AccountsWorkspace({ rpcUrl, explorerUrl, wallets, setWallets, balances, refreshBalance }) {
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState(wallets[0]?.id || '');
  const [airdropAmount, setAirdropAmount] = useState('1');
  const [recipient, setRecipient] = useState(wallets[1]?.address || '');
  const [transferAmount, setTransferAmount] = useState('0.1');
  const [busy, setBusy] = useState('');
  const [airdropResult, setAirdropResult] = useState(null);
  const [transferResult, setTransferResult] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    if (!wallets.some((wallet) => wallet.id === selectedId)) {
      setSelectedId(wallets[0]?.id || '');
    }
  }, [wallets, selectedId]);

  const selected = wallets.find((wallet) => wallet.id === selectedId);

  const persist = useCallback(
    (next) => {
      setWallets(next);
      saveWallets(next);
    },
    [setWallets],
  );

  const createWallet = () => {
    const wallet = generateTestWallet(name);
    persist([...wallets, wallet]);
    setName('');
    setSelectedId(wallet.id);
  };

  const runAirdrop = async () => {
    if (!selected) return;
    const amount = Number(airdropAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAirdropResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    setBusy('airdrop');
    setAirdropResult(null);
    try {
      const signature = await requestAirdrop(rpcUrl, selected.address, aekoToLamports(amount));
      await confirmSignature(rpcUrl, signature);
      await refreshBalance(selected.address);
      setAirdropResult({ kind: 'success', message: `Funded ${selected.name}.`, signature });
      setActivity((items) => [
        { kind: 'Airdrop', amount: `${amount} AEKO`, signature, at: Date.now() },
        ...items,
      ].slice(0, 8));
    } catch (error) {
      setAirdropResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy('');
    }
  };

  const runTransfer = async () => {
    if (!selected) return;
    const amount = Number(transferAmount);
    if (!recipient.trim() || !Number.isFinite(amount) || amount <= 0) {
      setTransferResult({ kind: 'error', message: 'Enter a valid recipient and positive amount.' });
      return;
    }
    setBusy('transfer');
    setTransferResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const tx = buildSignedTransfer({
        fromWallet: selected,
        toAddress: recipient.trim(),
        lamports: aekoToLamports(amount),
        recentBlockhash,
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      await Promise.all([refreshBalance(selected.address), refreshBalance(recipient.trim())]);
      setTransferResult({ kind: 'success', message: 'Transfer confirmed.', signature });
      setActivity((items) => [
        { kind: 'Transfer', amount: `${amount} AEKO`, signature, at: Date.now() },
        ...items,
      ].slice(0, 8));
    } catch (error) {
      setTransferResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Testnet accounts</h3>
              <p className="mt-1 text-xs text-gray-500">Local browser keypairs. Never use these wallets for mainnet funds.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Wallet name"
                className="h-10 w-36 rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-aeko-accent"
              />
              <button type="button" onClick={createWallet} className="h-10 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black">
                New wallet
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {wallets.map((wallet) => (
              <button
                type="button"
                key={wallet.id}
                onClick={() => setSelectedId(wallet.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  selectedId === wallet.id
                    ? 'border-aeko-accent/50 bg-aeko-accent/10'
                    : 'border-white/10 bg-black/20 hover:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{wallet.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-gray-500">{shortAddress(wallet.address)}</div>
                  </div>
                  <WalletCards size={15} className="shrink-0 text-gray-500" />
                </div>
                <div className="mt-3 text-sm font-medium text-gray-200">
                  {balances[wallet.address] == null ? 'Balance unavailable' : formatAeko(balances[wallet.address])}
                </div>
              </button>
            ))}
            {wallets.length === 0 && (
              <div className="sm:col-span-2 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-gray-500">
                Create a test wallet to fund it, transfer AEKO, and sign SocialFi actions.
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <AccountLink address={selected.address} explorerUrl={explorerUrl} />
              <CopyButton value={selected.address} />
              <button
                type="button"
                onClick={() => refreshBalance(selected.address)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-gray-400 hover:text-white"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => persist(wallets.filter((wallet) => wallet.id !== selected.id))}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowDownToLine size={16} className="text-aeko-accent" /> Fund wallet</div>
            <input
              type="number"
              min="0.000000001"
              value={airdropAmount}
              onChange={(event) => setAirdropAmount(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-aeko-accent"
            />
            <button disabled={!selected || busy === 'airdrop'} type="button" onClick={runAirdrop} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-aeko-accent text-sm font-semibold text-black disabled:opacity-40">
              {busy === 'airdrop' && <Loader2 size={14} className="animate-spin" />} Request airdrop
            </button>
            <ResultBanner result={airdropResult} explorerUrl={explorerUrl} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Send size={16} className="text-aeko-accent" /> Send AEKO</div>
            <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-xs outline-none focus:border-aeko-accent" />
            <div className="mt-2 flex flex-wrap gap-1">
              {wallets.filter((wallet) => wallet.id !== selectedId).map((wallet) => (
                <button key={wallet.id} type="button" onClick={() => setRecipient(wallet.address)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 hover:text-white">{wallet.name}</button>
              ))}
            </div>
            <input type="number" min="0.000000001" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-aeko-accent" />
            <button disabled={!selected || busy === 'transfer'} type="button" onClick={runTransfer} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-40">
              {busy === 'transfer' && <Loader2 size={14} className="animate-spin" />} Sign & send
            </button>
            <ResultBanner result={transferResult} explorerUrl={explorerUrl} />
          </div>
        </section>
      </div>

      <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">Session transactions</h3>
        <p className="mt-1 text-xs text-gray-500">Every signature links directly to Aeko Scan.</p>
        <div className="mt-4 space-y-2">
          {activity.map((item) => (
            <div key={`${item.signature}-${item.at}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium text-white">{item.kind}</span><span className="text-gray-500">{item.amount}</span></div>
              <div className="mt-1"><TxLink signature={item.signature} explorerUrl={explorerUrl} compact /></div>
            </div>
          ))}
          {activity.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-gray-500">Transactions created in this console appear here.</div>}
        </div>
      </aside>
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
    const listener = (event) => event.key === 'Escape' && onClose();
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
