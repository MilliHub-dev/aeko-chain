import {
  Activity,
  ArrowDownToLine,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Reply,
  Send,
  Server,
  Trash2,
  UserRound,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aekoToLamports,
  confirmSignature,
  formatAeko,
  getLatestBlockhash,
  requestAirdrop,
  sendTransaction,
} from '../utils/aekoRpcClient';
import { AekoWsClient } from '../utils/aekoWsClient';
import {
  buildSignedAnchorPostTx,
  buildSignedLikeTx,
  randomBytes32,
  sha256,
  summarizeEngagements,
} from '../utils/aekoSocial';
import {
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import { buildSignedTransfer } from '../utils/aekoTransfer';
import {
  fetchConsoleOverview,
  fetchSocialProjection,
  fetchSocialStatus,
  fetchWalletProfile,
} from '../utils/testConsoleApi';

const TABS = [
  { key: 'accounts', label: 'Accounts', icon: WalletCards },
  { key: 'programs', label: 'RPC / API / WS', icon: Activity },
  { key: 'social', label: 'Social', icon: MessageCircle },
];
const MAX_POST_LEN = 512;

function EndpointStatus({ icon, label, status, detail }) {
  const ok = status === 'connected' || status === 'ready';
  const pending = status === 'connecting' || status === 'loading';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-aeko-accent">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">{label}</div>
            <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-400' : pending ? 'bg-amber-400' : 'bg-red-400'}`} />
          </div>
          <div className="mt-1 text-xs capitalize text-gray-400">{status}</div>
          <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-gray-600">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function TxResult({ result, explorerUrl }) {
  if (!result) return null;
  const ok = result.kind === 'success';
  return (
    <div className={`rounded-xl border p-3 text-xs ${ok ? 'border-green-400/25 bg-green-500/10 text-green-100' : 'border-red-400/25 bg-red-500/10 text-red-100'}`}>
      <div>{result.message}</div>
      {result.signature ? (
        <a className="mt-2 inline-flex items-center gap-1 font-mono text-aeko-accent hover:underline" href={`${explorerUrl.replace(/\/$/, '')}/explorer/tx/${result.signature}`} target="_blank" rel="noreferrer">
          {shortAddress(result.signature)} <ExternalLink size={10} />
        </a>
      ) : null}
    </div>
  );
}

function AmountInput({ value, onChange }) {
  return <input type="number" min="0.000000001" value={value} onChange={(event) => onChange(event.target.value)} className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-aeko-accent" />;
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-gray-600">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value == null ? '—' : String(value)}</div></div>;
}

function AccountsWorkspace({
  rpcUrl,
  explorerUrl,
  wallets,
  setWallets,
  balances,
  walletProfiles,
  walletErrors,
  refreshWallet,
}) {
  const [selectedId, setSelectedId] = useState(wallets[0]?.id || '');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [rename, setRename] = useState('');

  const wallet = wallets.find((item) => item.id === selectedId) || wallets[0] || null;
  const profile = wallet ? walletProfiles[wallet.address] : null;
  const profileError = wallet ? walletErrors[wallet.address] : '';

  const persist = useCallback((next) => {
    setWallets(next);
    saveWallets(next);
  }, [setWallets]);

  const createWallet = () => {
    const next = generateTestWallet(name.trim());
    persist([...wallets, next]);
    setSelectedId(next.id);
    setName('');
    void refreshWallet(next.address);
  };

  const renameWallet = () => {
    if (!wallet) return;
    const nextName = rename.trim();
    if (!nextName) return;
    persist(wallets.map((item) => item.id === wallet.id ? { ...item, name: nextName } : item));
    setRename('');
  };

  const runAirdrop = async () => {
    if (!wallet) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setResult({ kind: 'error', message: 'Enter a positive AEKO amount.' });
      return;
    }
    setBusy('airdrop');
    setResult(null);
    try {
      const signature = await requestAirdrop(rpcUrl, wallet.address, aekoToLamports(value));
      await confirmSignature(rpcUrl, signature);
      await refreshWallet(wallet.address);
      setResult({ kind: 'success', message: `Airdrop confirmed for ${wallet.name}.`, signature });
    } catch (error) {
      setResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy('');
    }
  };

  const runTransfer = async () => {
    if (!wallet) return;
    const value = Number(amount);
    if (!recipient.trim() || !Number.isFinite(value) || value <= 0) {
      setResult({ kind: 'error', message: 'Enter a recipient and positive AEKO amount.' });
      return;
    }
    setBusy('send');
    setResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const tx = buildSignedTransfer({
        fromWallet: wallet,
        toAddress: recipient.trim(),
        lamports: aekoToLamports(value),
        recentBlockhash,
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      await Promise.all([refreshWallet(wallet.address), refreshWallet(recipient.trim())]);
      setResult({ kind: 'success', message: 'Transfer confirmed on chain.', signature });
    } catch (error) {
      setResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">Browser-local test wallets</div>
          <div className="mt-1 text-xs leading-relaxed text-gray-500">Keys and signatures stay in this browser. Wallet reads come from the Explorer API, whose account endpoint performs the live validator read and joins indexed PostgreSQL history.</div>
          <div className="mt-4 flex gap-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Wallet name" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-aeko-accent" />
            <button type="button" onClick={createWallet} className="flex h-10 w-10 items-center justify-center rounded-xl bg-aeko-accent text-black"><Plus size={15} /></button>
          </div>
        </div>
        <div className="space-y-2">
          {wallets.map((item) => (
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left ${wallet?.id === item.id ? 'border-aeko-accent/35 bg-aeko-accent/[0.07]' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.05]'}`}>
              <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium text-white">{item.name}</span><span className="text-[10px] text-gray-500">{balances[item.address] == null ? '—' : formatAeko(balances[item.address])}</span></div>
              <div className="mt-1 font-mono text-[10px] text-gray-600">{shortAddress(item.address)}</div>
            </button>
          ))}
          {wallets.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-gray-500">Create a test wallet to begin.</div> : null}
        </div>
      </aside>

      <div className="space-y-4">
        {wallet ? (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="text-lg font-semibold text-white">{wallet.name}</div><div className="mt-1 break-all font-mono text-xs text-gray-500">{wallet.address}</div></div>
                <div className="text-right"><div className="text-[10px] uppercase tracking-[0.16em] text-gray-600">API live balance</div><div className="mt-1 text-xl font-semibold text-white">{balances[wallet.address] == null ? 'Unavailable' : formatAeko(balances[wallet.address])}</div></div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Metric label="Tokens" value={profile?.tokenCount} />
                <Metric label="NFTs" value={profile?.nftCount} />
                <Metric label="Reputation" value={profile?.reputationScore} />
                <Metric label="Recent tx" value={profile?.recentTransactions?.length} />
              </div>
              <div className="mt-4 flex gap-2">
                <input value={rename} onChange={(event) => setRename(event.target.value)} placeholder={`Rename ${wallet.name}`} className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-xs outline-none focus:border-aeko-accent" />
                <button type="button" onClick={renameWallet} disabled={!rename.trim()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-300 disabled:opacity-40"><Pencil size={12} /> Rename</button>
              </div>
              {profileError ? <div className="mt-3 text-xs text-amber-200">Explorer API: {profileError}</div> : null}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><ArrowDownToLine size={14} className="text-aeko-accent" /> Request test AEKO</div>
                <AmountInput value={amount} onChange={setAmount} />
                <button type="button" onClick={runAirdrop} disabled={Boolean(busy)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black disabled:opacity-40">{busy === 'airdrop' ? <Loader2 size={13} className="animate-spin" /> : null} Airdrop</button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Send size={14} className="text-aeko-accent" /> Send AEKO</div>
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-xs outline-none focus:border-aeko-accent" />
                <AmountInput value={amount} onChange={setAmount} />
                <button type="button" onClick={runTransfer} disabled={Boolean(busy)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black disabled:opacity-40">{busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : null} Sign & send</button>
              </div>
            </section>
            <TxResult result={result} explorerUrl={explorerUrl} />
            <button type="button" onClick={() => persist(wallets.filter((item) => item.id !== wallet.id))} className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-400/20 px-3 text-xs text-red-200 hover:bg-red-500/10"><Trash2 size={13} /> Remove local test wallet</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProgramsWorkspace({ rpcUrl, websocketUrl, explorerApiUrl, rpcState, wsState, overview, socialStatus, refresh }) {
  const domains = socialStatus?.domains || {};
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <EndpointStatus icon={<Server size={17} />} label="JSON-RPC" status={rpcState.status} detail={`${rpcUrl} · readiness reported by Explorer API; direct RPC reserved for writes`} />
        <EndpointStatus icon={<Server size={17} />} label="Explorer API" status={overview ? 'ready' : 'error'} detail={explorerApiUrl} />
        <EndpointStatus icon={<Wifi size={17} />} label="WebSocket" status={wsState} detail={websocketUrl} />
      </div>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">End-to-end watermarks</div><div className="mt-1 text-xs text-gray-500">Explorer API reports validator + indexer state; WebSocket streams live slot/change signals.</div></div><button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5"><RefreshCw size={12} /> Refresh API</button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4"><Metric label="Live slot" value={rpcState.slot} /><Metric label="Indexed core" value={overview?.latestIndexedSlot} /><Metric label="Assets" value={overview?.latestAssetSlot} /><Metric label="Social" value={overview?.latestSocialSlot} /></div>
      </section>
      <section>
        <div className="mb-3 text-sm font-semibold text-white">Canonical Social program states</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {['posts', 'rewards', 'staking', 'antiSpam', 'monetization'].map((key) => {
            const domain = domains[key];
            const ok = domain?.initialized && domain?.ownerMatches && !domain?.error;
            return <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold capitalize text-white">{key}</span><span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-400' : 'bg-amber-400'}`} /></div><div className="mt-2 font-mono text-[10px] text-gray-600">{domain?.stateAccount ? shortAddress(domain.stateAccount) : 'state unavailable'}</div>{domain?.metrics ? <div className="mt-2 text-[10px] text-gray-500">{Object.entries(domain.metrics).slice(0, 2).map(([name, value]) => `${name}: ${value}`).join(' · ')}</div> : null}{domain?.error ? <div className="mt-2 text-[10px] text-red-200">{domain.error}</div> : null}</div>;
          })}
        </div>
      </section>
    </div>
  );
}

function SocialWorkspace({ rpcUrl, explorerApiUrl, explorerUrl, wallets, balances, socialPulse, socialStateAccount }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [body, setBody] = useState('');
  const [composer, setComposer] = useState({ kind: 'original', parent: null });
  const [feedCreator, setFeedCreator] = useState('');
  const [projection, setProjection] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const wallet = wallets.find((item) => item.id === walletId) || wallets[0] || null;

  const refresh = useCallback(async () => {
    try {
      const projected = await fetchSocialProjection(explorerApiUrl, { wallet: wallet?.address || '', creator: feedCreator, limit: 50 });
      setProjection(projected);
      setError('');
    } catch (refreshError) {
      setError(refreshError.message || String(refreshError));
    }
  }, [explorerApiUrl, wallet?.address, feedCreator]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const reconcile = socialPulse > 0 ? window.setTimeout(() => { void refresh(); }, 1500) : null;
    return () => {
      window.clearTimeout(initial);
      if (reconcile) window.clearTimeout(reconcile);
    };
  }, [refresh, socialPulse]);

  const publish = async () => {
    if (!wallet || !body.trim() || !socialStateAccount) return;
    setBusy('post');
    setResult(null);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const content = body.trim();
      const tx = buildSignedAnchorPostTx({
        creatorWallet: wallet,
        stateAccount: socialStateAccount,
        recentBlockhash,
        postId: randomBytes32(),
        contentHash: await sha256(content),
        metadataHash: await sha256('{}'),
        contentUri: content,
        parentPostId: composer.parent?.postId || null,
        postKind: composer.kind,
        createdAtUnix: Math.floor(Date.now() / 1000),
        visibility: 'public',
      });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      setBody('');
      setComposer({ kind: 'original', parent: null });
      setResult({ kind: 'success', message: `${composer.kind === 'original' ? 'Post' : composer.kind} confirmed on chain. Waiting for the real Explorer projection if the indexer is behind.`, signature });
      await refresh();
    } catch (publishError) {
      setResult({ kind: 'error', message: publishError.message || String(publishError) });
    } finally {
      setBusy('');
    }
  };

  const like = async (post) => {
    if (!wallet || !socialStateAccount) return;
    setBusy(`like:${post.postId}`);
    try {
      const recentBlockhash = await getLatestBlockhash(rpcUrl);
      const tx = buildSignedLikeTx({ actorWallet: wallet, stateAccount: socialStateAccount, recentBlockhash, targetPostId: post.postId, targetCreator: post.creator, unixTimestamp: Math.floor(Date.now() / 1000) });
      const signature = await sendTransaction(rpcUrl, tx);
      await confirmSignature(rpcUrl, signature);
      setResult({ kind: 'success', message: 'Like confirmed on chain. Explorer projection will update after indexing.', signature });
      await refresh();
    } catch (likeError) {
      setResult({ kind: 'error', message: likeError.message || String(likeError) });
    } finally {
      setBusy('');
    }
  };

  const posts = useMemo(() => [...(projection?.posts?.data || [])].sort((a, b) => (b.createdAtUnix || 0) - (a.createdAtUnix || 0)), [projection]);
  const engagement = useMemo(() => summarizeEngagements(projection?.engagement?.data || []), [projection]);
  const projectionCards = [
    ['Indexed posts', projection?.posts],
    ['Stakes', projection?.stakes],
    ['Rewards', projection?.rewards],
    ['Anti-spam', projection?.antiSpam],
    ['Tips', projection?.tips],
    ['Subscriptions', projection?.subscriptions],
    ['Unlocks', projection?.unlocks],
    ['Revenue', projection?.revenues],
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-3"><select value={wallet?.id || ''} onChange={(event) => setWalletId(event.target.value)} className="h-9 rounded-xl border border-white/10 bg-black/30 px-3 text-xs">{wallets.map((item) => <option key={item.id} value={item.id}>{item.name} · {shortAddress(item.address)}</option>)}</select>{wallet ? <span className="text-[11px] text-gray-500">{balances[wallet.address] == null ? '—' : formatAeko(balances[wallet.address])}</span> : null}<span className="ml-auto text-[10px] text-gray-600">API state · WS {socialStateAccount ? shortAddress(socialStateAccount) : 'state unavailable'}</span></div>
          {composer.parent ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-aeko-accent/20 bg-aeko-accent/[0.05] px-3 py-2 text-xs"><span className="truncate text-gray-300">{composer.kind === 'reply' ? 'Replying to' : 'Quoting'} {shortAddress(composer.parent.creator)} · {String(composer.parent.contentUri || '').slice(0, 90)}</span><button type="button" onClick={() => setComposer({ kind: 'original', parent: null })} className="text-gray-500 hover:text-white"><X size={12} /></button></div> : null}
          <textarea value={body} onChange={(event) => setBody(event.target.value.slice(0, MAX_POST_LEN))} rows={3} placeholder={composer.kind === 'original' ? 'Write a real on-chain AEKO Social post…' : `Write your ${composer.kind}…`} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-aeko-accent" />
          <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-gray-600">{body.length}/{MAX_POST_LEN}</span><div className="flex gap-2"><button type="button" onClick={() => { void refresh(); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-300"><RefreshCw size={12} /> API</button><button type="button" onClick={publish} disabled={!wallet || !body.trim() || !socialStateAccount || Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black disabled:opacity-40">{busy === 'post' ? <Loader2 size={12} className="animate-spin" /> : null} Sign & {composer.kind === 'original' ? 'post' : composer.kind}</button></div></div>
        </section>
        <TxResult result={result} explorerUrl={explorerUrl} />
        {feedCreator ? <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs"><span>Profile feed: <span className="font-mono text-aeko-accent">{shortAddress(feedCreator)}</span></span><button type="button" onClick={() => setFeedCreator('')} className="text-gray-500 hover:text-white">Show all</button></div> : null}
        {error ? <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">{error}</div> : null}
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {posts.map((post) => <article key={post.postId} className="p-4"><div className="flex gap-3"><button type="button" onClick={() => setFeedCreator(post.creator)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:border-aeko-accent/30"><UserRound size={15} /></button><div className="min-w-0 flex-1"><button type="button" onClick={() => setFeedCreator(post.creator)} className="text-left text-[11px] text-gray-500 hover:text-aeko-accent"><span className="font-medium text-white">{shortAddress(post.creator)}</span> · {new Date((post.createdAtUnix || 0) * 1000).toLocaleString()}</button>{post.parentPostId ? <div className="mt-1 font-mono text-[10px] text-gray-600">{post.postKind} → {shortAddress(post.parentPostId)}</div> : null}<div className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-100">{post.contentUri}</div><div className="mt-3 flex flex-wrap items-center gap-1"><button type="button" onClick={() => like(post)} disabled={!wallet || Boolean(busy)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-gray-500 hover:bg-pink-500/10 hover:text-pink-300 disabled:opacity-40">{busy === `like:${post.postId}` ? <Loader2 size={12} className="animate-spin" /> : <Heart size={12} />} {engagement.likeCountByPost.get(post.postId) || 0}</button><button type="button" onClick={() => setComposer({ kind: 'reply', parent: post })} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-gray-500 hover:bg-white/5 hover:text-white"><Reply size={12} /> Reply</button><button type="button" onClick={() => setComposer({ kind: 'quote', parent: post })} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-gray-500 hover:bg-white/5 hover:text-white"><Quote size={12} /> Quote</button></div></div></div></article>)}
          {posts.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No indexed on-chain posts match this feed.</div> : null}
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-sm font-semibold text-white">Explorer API projection</div><div className="mt-1 text-xs leading-relaxed text-gray-500">Every record below is returned by the existing Explorer backend from its durable PostgreSQL projection. The browser does not reconstruct or invent Social state.</div></div>
        {projectionCards.map(([label, entry]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-xs text-gray-400">{label}</span><span className={`h-1.5 w-1.5 rounded-full ${entry?.ok ? 'bg-green-400' : 'bg-red-400'}`} /></div><div className="mt-1 text-lg font-semibold text-white">{Array.isArray(entry?.data) ? entry.data.length : '—'}</div>{entry?.error ? <div className="mt-1 text-[10px] leading-relaxed text-red-200">{entry.error}</div> : null}</div>)}
      </aside>
    </div>
  );
}

export default function NetworkConsoleModalV2({ open, onClose, tab, onTabChange, rpcUrl, websocketUrl, network, explorerApiUrl, explorerUrl }) {
  const [wallets, setWallets] = useState(() => loadWallets());
  const [balances, setBalances] = useState({});
  const [walletProfiles, setWalletProfiles] = useState({});
  const [walletErrors, setWalletErrors] = useState({});
  const [rpcState, setRpcState] = useState({ status: 'loading', slot: null, error: '' });
  const [wsState, setWsState] = useState('connecting');
  const [overview, setOverview] = useState(null);
  const [socialStatus, setSocialStatus] = useState(null);
  const [socialPulse, setSocialPulse] = useState(0);
  const wsRef = useRef(null);
  const socialStateAccount = socialStatus?.domains?.posts?.stateAccount || '';

  const refreshWallet = useCallback(async (address) => {
    try {
      const profile = await fetchWalletProfile(explorerApiUrl, address);
      setWalletProfiles((current) => ({ ...current, [address]: profile }));
      setBalances((current) => ({ ...current, [address]: profile.nativeBalance }));
      setWalletErrors((current) => ({ ...current, [address]: '' }));
      return profile;
    } catch (error) {
      setWalletProfiles((current) => ({ ...current, [address]: null }));
      setBalances((current) => ({ ...current, [address]: null }));
      setWalletErrors((current) => ({ ...current, [address]: error.message || String(error) }));
      return null;
    }
  }, [explorerApiUrl]);

  const refreshInfrastructure = useCallback(async () => {
    const [apiOverview, status] = await Promise.allSettled([
      fetchConsoleOverview(explorerApiUrl),
      fetchSocialStatus(explorerApiUrl),
    ]);
    if (apiOverview.status === 'fulfilled') {
      const nextOverview = apiOverview.value;
      setOverview(nextOverview);
      setRpcState((current) => ({
        status: nextOverview?.rpcAvailable ? 'ready' : 'error',
        slot: current.slot ?? nextOverview?.latestChainSlot ?? null,
        error: nextOverview?.rpcAvailable ? '' : 'Explorer API reports validator RPC unavailable.',
      }));
    } else {
      setOverview(null);
      setRpcState((current) => ({ ...current, status: 'error', error: apiOverview.reason?.message || String(apiOverview.reason) }));
    }
    setSocialStatus(status.status === 'fulfilled' ? status.value : null);
  }, [explorerApiUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const initial = window.setTimeout(() => {
      void refreshInfrastructure();
      void Promise.all(wallets.map((wallet) => refreshWallet(wallet.address)));
    }, 0);
    const timer = window.setInterval(() => { void refreshInfrastructure(); }, 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [open, wallets, refreshWallet, refreshInfrastructure]);

  useEffect(() => {
    if (!open || !websocketUrl) return undefined;
    const client = new AekoWsClient(websocketUrl, { onStatus: setWsState });
    wsRef.current = client;
    const stops = [client.subscribeSlot((notification) => {
      const slot = notification?.slot ?? notification?.parent ?? notification?.context?.slot;
      if (typeof slot === 'number') setRpcState((current) => ({ ...current, slot }));
    })];
    wallets.forEach((wallet) => {
      stops.push(client.subscribeAccount(wallet.address, () => { void refreshWallet(wallet.address); }));
    });
    client.connect();
    return () => {
      stops.forEach((stop) => stop());
      client.close();
      wsRef.current = null;
    };
  }, [open, websocketUrl, wallets, refreshWallet]);

  useEffect(() => {
    if (!open || !socialStateAccount || wsState !== 'connected' || !wsRef.current) return undefined;
    return wsRef.current.subscribeAccount(socialStateAccount, () => setSocialPulse((value) => value + 1));
  }, [open, socialStateAccount, wsState]);

  useEffect(() => {
    if (!open) return undefined;
    const listener = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="network-console-v2-title">
      <button type="button" aria-label="Close network console" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <section className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b0c0f] shadow-2xl sm:max-w-7xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6"><div><h2 id="network-console-v2-title" className="text-lg font-semibold text-white">AEKO Test Console</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500"><span>{network}</span><span>·</span><span>{rpcState.slot == null ? 'slot unavailable' : `slot ${rpcState.slot.toLocaleString()}`}</span><span>·</span><span>WS {wsState}</span></div></div><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"><X size={16} /></button></header>
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-black/20 px-3 py-2 sm:px-5">{TABS.map((item) => { const Icon = item.icon; const active = tab === item.key; return <button key={item.key} type="button" onClick={() => onTabChange(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm ${active ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}><Icon size={14} /> {item.label}</button>; })}</nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {rpcState.error ? <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">Network/API: {rpcState.error}</div> : null}
          {tab === 'accounts' ? <AccountsWorkspace rpcUrl={rpcUrl} explorerUrl={explorerUrl} wallets={wallets} setWallets={setWallets} balances={balances} walletProfiles={walletProfiles} walletErrors={walletErrors} refreshWallet={refreshWallet} /> : null}
          {tab === 'programs' ? <ProgramsWorkspace rpcUrl={rpcUrl} websocketUrl={websocketUrl} explorerApiUrl={explorerApiUrl} rpcState={rpcState} wsState={wsState} overview={overview} socialStatus={socialStatus} refresh={refreshInfrastructure} /> : null}
          {tab === 'social' ? <SocialWorkspace rpcUrl={rpcUrl} explorerApiUrl={explorerApiUrl} explorerUrl={explorerUrl} wallets={wallets} balances={balances} socialPulse={socialPulse} socialStateAccount={socialStateAccount} /> : null}
        </div>
      </section>
    </div>
  );
}
