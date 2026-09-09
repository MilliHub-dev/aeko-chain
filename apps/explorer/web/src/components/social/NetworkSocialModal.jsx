import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeDollarSign, Bell, Bookmark, ChevronDown, CircleDollarSign, Coins,
  ExternalLink, Heart, Image, Layers3, Loader2, LockKeyhole, Menu, MessageCircle,
  MoreHorizontal, PenLine, RefreshCw, Repeat2, Reply, Send, Share2, ShieldCheck,
  Sparkles, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { getNetworkConfig } from '../../utils/networkConfig';
import { aekoToLamports, confirmSignature, formatAeko, getEpochInfo, getLatestBlockhash, sendTransaction } from '../../utils/aekoRpcClient';
import { loadWallets, shortAddress } from '../../utils/aekoTestKeypair';
import { buildSignedAnchorPostTx, randomBytes32, sha256 } from '../../utils/aekoSocial';
import {
  buildCancelSubscriptionTx, buildClaimCreatorRewardTx, buildClaimMonetizationTx,
  buildClaimStakeYieldTx, buildCreateSubscriptionTx, buildEditPostTx, buildEngagementTx,
  buildFinalizeUnstakeTx, buildOpenStakeTx, buildRenewSubscriptionTx,
  buildRequestUnstakeTx, buildTipTx, buildUnlockPaidContentTx,
} from '../../utils/aekoSocialActions';
import { mintSocialPostAsNft } from '../../utils/aekoSocialNft';
import {
  fetchCreatorSocial, fetchNftsForCreator, fetchPostEngagement, fetchSocialFeed,
  fetchSocialRegistry, fetchSocialStatus, fetchSocialThread, fetchWalletProfile,
} from '../../utils/testConsoleApi';

const NAV = [
  ['feed', 'Timeline', Layers3], ['me', 'My timeline', UserRound], ['rewards', 'Rewards', Sparkles],
  ['staking', 'Staking', Coins], ['monetization', 'Monetization', BadgeDollarSign],
  ['assets', 'Social NFTs', Image], ['protocol', 'Protocol', ShieldCheck],
];
const PAGE_SIZE = 20;

function dateLabel(unix) {
  if (!unix) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(unix) * 1000));
}
function content(post) { return post?.contentUri || ''; }
function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => { const value = item?.[key]; if (!value || seen.has(value)) return false; seen.add(value); return true; });
}

function IconButton({ title, children, onClick, active = false, disabled = false }) {
  return <button type="button" title={title} onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border transition ${active ? 'border-aeko-accent/40 bg-aeko-accent/10 text-aeko-accent' : 'border-transparent text-gray-500 hover:border-white/10 hover:bg-white/[0.05] hover:text-white'} disabled:opacity-40`}>{children}</button>;
}
function Pill({ children, tone = 'neutral' }) {
  const cls = tone === 'accent' ? 'border-aeko-accent/30 bg-aeko-accent/10 text-aeko-accent' : tone === 'warn' ? 'border-amber-400/20 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/[0.035] text-gray-400';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${cls}`}>{children}</span>;
}
function Empty({ icon: Icon = Layers3, title, body }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center"><Icon className="mx-auto text-gray-700" size={28}/><div className="mt-3 text-sm font-semibold text-white">{title}</div><div className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">{body}</div></div>;
}
function Metric({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">{label}</div><div className="mt-1 truncate text-sm font-semibold text-white">{value ?? '—'}</div></div>;
}

function ActionDialog({ title, description, children, onClose, onSubmit, submitLabel = 'Confirm', busy }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#101016] shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5"><div><div className="text-lg font-semibold text-white">{title}</div><p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p></div><IconButton title="Close" onClick={onClose} disabled={busy}><X size={16}/></IconButton></div>
      <div className="max-h-[60vh] overflow-y-auto p-5">{children}</div>
      <div className="flex justify-end gap-2 border-t border-white/10 p-4"><button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-xl border border-white/10 px-4 text-sm text-gray-300">Cancel</button><button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={14}/> : null}{submitLabel}</button></div>
    </form>
  </div>;
}

function Composer({ wallet, mode, parent, initial = '', value, setValue, onOpen }) {
  const label = mode === 'reply' ? `Replying to ${shortAddress(parent?.creator || '')}` : mode === 'quote' ? `Quoting ${shortAddress(parent?.creator || '')}` : `Posting as ${wallet?.name || 'wallet'}`;
  return <button type="button" onClick={onOpen} className="group w-full rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left hover:border-aeko-accent/25 hover:bg-white/[0.04]">
    <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-aeko-accent/20 bg-aeko-accent/10 text-xs font-bold text-aeko-accent">{wallet?.name?.slice(0,2).toUpperCase() || 'AE'}</div><div className="min-w-0 flex-1"><div className="text-[11px] text-gray-500">{label}</div><div className="mt-1 min-h-8 text-sm text-gray-400 group-hover:text-gray-300">{initial || value || 'Share an update on AEKO Social…'}</div><div className="mt-3 flex items-center justify-between"><div className="flex gap-2 text-aeko-accent"><Image size={15}/><Bell size={15}/><LockKeyhole size={15}/></div><span className="rounded-full bg-aeko-accent px-4 py-1.5 text-xs font-semibold text-black">Compose</span></div></div></div>
  </button>;
}

function PostCard({ post, persona, counts = {}, onProfile, onOpen, onAction, onDialog, owned }) {
  const [menu, setMenu] = useState(false);
  return <article className="relative border-b border-white/[0.07] px-4 py-5 transition hover:bg-white/[0.018]">
    <div className="flex gap-3"><button type="button" onClick={() => onProfile(post.creator)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] text-xs font-bold text-gray-300">{post.creator.slice(0,2)}</button><div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onProfile(post.creator)} className="min-w-0 text-left"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-white">{owned ? persona?.name || 'Owned persona' : shortAddress(post.creator)}</span>{owned ? <Pill tone="accent">you</Pill> : null}{post.visibility !== 'public' ? <Pill tone="warn">{post.visibility}</Pill> : null}</div><div className="mt-0.5 font-mono text-[10px] text-gray-600">{shortAddress(post.creator)} · {dateLabel(post.createdAtUnix)}</div></button><div className="relative"><IconButton title="Post actions" onClick={() => setMenu((v) => !v)}><MoreHorizontal size={16}/></IconButton>{menu ? <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-white/10 bg-[#15151d] p-1 shadow-2xl"><button onClick={() => {setMenu(false); onOpen(post);}} className="w-full rounded-lg px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5">Open thread</button><button onClick={() => {setMenu(false); onDialog('tip', post);}} className="w-full rounded-lg px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5">Tip creator</button><button onClick={() => {setMenu(false); onDialog('stake', post);}} className="w-full rounded-lg px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5">Stake on creator</button>{owned ? <><button onClick={() => {setMenu(false); onDialog('edit', post);}} className="w-full rounded-lg px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5">Edit post</button><button onClick={() => {setMenu(false); onDialog('mint', post);}} className="w-full rounded-lg px-3 py-2 text-left text-xs text-aeko-accent hover:bg-white/5">Mint as NFT</button></> : null}</div> : null}</div></div>
      {post.postKind !== 'original' ? <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-aeko-accent/80">{post.postKind}</div> : null}
      <button type="button" onClick={() => onOpen(post)} className="mt-2 block w-full whitespace-pre-wrap break-words text-left text-[15px] leading-6 text-gray-200">{content(post)}</button>
      <div className="mt-4 flex max-w-xl items-center justify-between text-xs text-gray-500">
        <button onClick={() => onDialog('reply', post)} className="group inline-flex items-center gap-1.5 hover:text-sky-300"><MessageCircle size={16}/><span>{counts.comment || 0}</span></button>
        <button onClick={() => onAction('repost', post)} className="group inline-flex items-center gap-1.5 hover:text-emerald-300"><Repeat2 size={16}/><span>{counts.repost || 0}</span></button>
        <button onClick={() => onAction('like', post)} className="group inline-flex items-center gap-1.5 hover:text-rose-300"><Heart size={16}/><span>{counts.like || 0}</span></button>
        <button onClick={() => onAction('share', post)} className="inline-flex items-center gap-1.5 hover:text-aeko-accent"><Share2 size={16}/><span>{counts.share || 0}</span></button>
        <button onClick={() => onAction('save', post)} className="inline-flex items-center gap-1.5 hover:text-amber-300"><Bookmark size={16}/><span>{counts.save || 0}</span></button>
        <button onClick={() => onDialog('quote', post)} className="hidden items-center gap-1.5 hover:text-violet-300 sm:inline-flex"><PenLine size={15}/> Quote</button>
      </div>
    </div></div>
  </article>;
}

export default function NetworkSocialModal({ network = 'testnet', onClose }) {
  const [params, setParams] = useSearchParams();
  const config = getNetworkConfig(network);
  const rpcUrl = import.meta.env.VITE_AEKO_LOCAL_RPC || config.rpcUrl;
  const explorerApiUrl = import.meta.env.VITE_AEKO_LOCAL_EXPLORER_API || config.explorerApiUrl;
  const wallets = useMemo(() => loadWallets(), []);
  const requestedPersona = params.get('persona') || '';
  const persona = wallets.find((wallet) => wallet.address === requestedPersona) || wallets[0] || null;
  const page = params.get('social') || 'feed';
  const profileAddress = params.get('profile') || '';
  const postId = params.get('post') || '';
  const dialog = params.get('dialog') || '';
  const targetId = params.get('target') || '';
  const [registry, setRegistry] = useState(null);
  const [status, setStatus] = useState(null);
  const [feed, setFeed] = useState([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [thread, setThread] = useState([]);
  const [engagement, setEngagement] = useState([]);
  const [creatorData, setCreatorData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [balance, setBalance] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [composerText, setComposerText] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [periodDays, setPeriodDays] = useState('30');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const sentinel = useRef(null);

  const patchParams = useCallback((patch, remove = []) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      remove.forEach((key) => next.delete(key));
      Object.entries(patch).forEach(([key, value]) => { if (value == null || value === '') next.delete(key); else next.set(key, String(value)); });
      return next;
    });
  }, [setParams]);

  useEffect(() => {
    if (persona && requestedPersona !== persona.address) patchParams({ persona: persona.address });
  }, [persona, requestedPersona, patchParams]);

  const activeCreator = page === 'me' ? persona?.address || '' : page === 'profile' ? profileAddress : '';
  const targetPost = useMemo(() => [...feed, ...thread].find((post) => post.postId === targetId) || null, [feed, thread, targetId]);
  const countsByPost = useMemo(() => {
    const map = {};
    engagement.forEach((event) => { if (!event.targetPostId) return; map[event.targetPostId] ||= {}; map[event.targetPostId][event.actionKind] = (map[event.targetPostId][event.actionKind] || 0) + 1; });
    return map;
  }, [engagement]);

  const refreshProtocol = useCallback(async () => {
    const [nextRegistry, nextStatus] = await Promise.all([fetchSocialRegistry(explorerApiUrl), fetchSocialStatus(explorerApiUrl)]);
    setRegistry(nextRegistry); setStatus(nextStatus); return nextRegistry;
  }, [explorerApiUrl]);

  const refreshPersona = useCallback(async () => {
    if (!persona) return;
    const [walletProfile, nextEpoch] = await Promise.all([
      fetchWalletProfile(explorerApiUrl, persona.address),
      getEpochInfo(rpcUrl),
    ]);
    setBalance(walletProfile?.nativeBalance ?? null); setEpoch(Number(nextEpoch?.epoch || 0));
  }, [explorerApiUrl, persona, rpcUrl]);

  const resetFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const pageData = await fetchSocialFeed(explorerApiUrl, { creator: activeCreator, limit: PAGE_SIZE });
      setFeed(pageData?.items || []); setCursor(pageData?.nextCursor || ''); setHasMore(Boolean(pageData?.hasMore));
      const ids = (pageData?.items || []).map((post) => post.postId);
      const events = await Promise.all(ids.map((id) => fetchPostEngagement(explorerApiUrl, id, { limit: 100 }).catch(() => [])));
      setEngagement(events.flat());
    } catch (error) { setNotice({ tone: 'error', message: error.message || String(error) }); }
    finally { setLoadingFeed(false); }
  }, [activeCreator, explorerApiUrl]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingFeed || !['feed','me','profile'].includes(page)) return;
    setLoadingFeed(true);
    try {
      const pageData = await fetchSocialFeed(explorerApiUrl, { creator: activeCreator, cursor, limit: PAGE_SIZE });
      const incoming = pageData?.items || [];
      setFeed((current) => uniqueBy([...current, ...incoming], 'postId'));
      setCursor(pageData?.nextCursor || ''); setHasMore(Boolean(pageData?.hasMore));
      const events = await Promise.all(incoming.map((post) => fetchPostEngagement(explorerApiUrl, post.postId, { limit: 100 }).catch(() => [])));
      setEngagement((current) => uniqueBy([...current, ...events.flat()], 'proofId'));
    } catch (error) { setNotice({ tone: 'error', message: error.message || String(error) }); }
    finally { setLoadingFeed(false); }
  }, [activeCreator, cursor, explorerApiUrl, hasMore, loadingFeed, page]);

  useEffect(() => { void Promise.all([refreshProtocol(), refreshPersona()]); }, [refreshProtocol, refreshPersona]);
  useEffect(() => { if (['feed','me','profile'].includes(page)) void resetFeed(); }, [page, activeCreator, resetFeed]);
  useEffect(() => {
    if (page === 'post' && postId) Promise.all([fetchSocialThread(explorerApiUrl, postId), fetchPostEngagement(explorerApiUrl, postId, { limit: 500 })]).then(([posts, events]) => { setThread(posts || []); setEngagement(events || []); }).catch((error) => setNotice({ tone: 'error', message: error.message }));
  }, [page, postId, explorerApiUrl]);
  useEffect(() => {
    const creator = page === 'profile' ? profileAddress : persona?.address;
    if (creator && ['profile','rewards','staking','monetization'].includes(page)) {
      Promise.all([fetchCreatorSocial(explorerApiUrl, creator, persona?.address), fetchWalletProfile(explorerApiUrl, creator)]).then(([social, walletProfile]) => { setCreatorData(social); setProfile(walletProfile); }).catch((error) => setNotice({ tone: 'error', message: error.message }));
    }
  }, [page, profileAddress, persona, explorerApiUrl]);
  useEffect(() => { if (page === 'assets' && persona) fetchNftsForCreator(explorerApiUrl, persona.address, 100).then(setNfts).catch((error) => setNotice({ tone:'error', message:error.message })); }, [page, persona, explorerApiUrl]);
  useEffect(() => {
    if (!sentinel.current) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: '240px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [loadMore]);

  const sendBuilt = async (builder, label) => {
    if (!persona) throw new Error('Create/select an owned test wallet in Accounts first.');
    setBusy(label); setNotice(null);
    try {
      const blockhash = await getLatestBlockhash(rpcUrl);
      const built = await builder(blockhash);
      const transaction = typeof built === 'string' ? built : built.transaction;
      const signature = await sendTransaction(rpcUrl, transaction);
      await confirmSignature(rpcUrl, signature);
      setNotice({ tone: 'success', message: `${label} confirmed on AEKO.`, signature });
      await Promise.all([refreshPersona(), refreshProtocol()]);
      return { built, signature };
    } finally { setBusy(''); }
  };

  const submitPost = async () => {
    const text = composerText.trim(); if (!text) return;
    const mode = dialog === 'reply' ? 'reply' : dialog === 'quote' ? 'quote' : 'original';
    const parent = targetPost;
    try {
      await sendBuilt(async (blockhash) => buildSignedAnchorPostTx({
        creatorWallet: persona, stateAccount: registry.posts, antiSpamStateAccount: registry.antiSpam,
        recentBlockhash: blockhash, postId: randomBytes32(), contentHash: await sha256(text), metadataHash: await sha256(JSON.stringify({ surface: 'network-social', mode })),
        contentUri: text, parentPostId: parent?.postId || null, postKind: mode, createdAtUnix: Math.floor(Date.now()/1000), visibility: 'public',
      }), mode === 'original' ? 'Post' : mode === 'reply' ? 'Reply' : 'Quote');
      if (mode === 'reply' && parent) await sendBuilt((blockhash) => buildEngagementTx({ wallet: persona, postsState: registry.posts, antiSpamState: registry.antiSpam, recentBlockhash: blockhash, post: parent, action: 'comment' }), 'Comment proof');
      setComposerText(''); patchParams({}, ['dialog','target']);
      if (page === 'post' && postId) { setThread(await fetchSocialThread(explorerApiUrl, postId)); } else { await resetFeed(); }
    } catch (error) { setNotice({ tone: 'error', message: error.message || String(error) }); }
  };

  const runEngagement = async (action, post) => {
    try { await sendBuilt((blockhash) => buildEngagementTx({ wallet: persona, postsState: registry.posts, antiSpamState: registry.antiSpam, recentBlockhash: blockhash, post, action }), action); setEngagement((current) => current); const events = await fetchPostEngagement(explorerApiUrl, post.postId, { limit: 200 }); setEngagement((current) => uniqueBy([...current.filter((e) => e.targetPostId !== post.postId), ...events], 'proofId')); }
    catch (error) { setNotice({ tone:'error', message:error.message }); }
  };

  const openDialog = (name, post = null) => { setAmount('0.01'); setComposerText(name === 'edit' ? content(post) : ''); patchParams({ dialog: name, target: post?.postId || '' }); };
  const closeDialog = useCallback(() => { if (!busy) patchParams({}, ['dialog','target']); }, [busy, patchParams]);

  const submitEconomic = async () => {
    const lamports = aekoToLamports(Number(amount)); if (!Number.isFinite(lamports) || lamports <= 0) { setNotice({tone:'error',message:'Enter a positive AEKO amount.'}); return; }
    try {
      if (dialog === 'tip') await sendBuilt((bh) => buildTipTx({ wallet: persona, monetizationState: registry.monetization, treasury: registry.treasury, recentBlockhash: bh, creator: targetPost.creator, amount: lamports }), 'Tip');
      if (dialog === 'stake') await sendBuilt((bh) => buildOpenStakeTx({ wallet: persona, stakingState: registry.staking, stakeVault: registry.stakeVault, recentBlockhash: bh, creator: targetPost?.creator || profileAddress || persona.address, amount: lamports, currentEpoch: epoch }), 'Stake');
      if (dialog === 'subscribe') await sendBuilt((bh) => buildCreateSubscriptionTx({ wallet: persona, monetizationState: registry.monetization, treasury: registry.treasury, recentBlockhash: bh, creator: targetPost?.creator || profileAddress, amount: lamports, periodSeconds: Math.max(1, Number(periodDays))*86400 }), 'Subscription');
      if (dialog === 'unlock') await sendBuilt((bh) => buildUnlockPaidContentTx({ wallet: persona, monetizationState: registry.monetization, treasury: registry.treasury, recentBlockhash: bh, post: targetPost, amount: lamports }), 'Paid unlock');
      closeDialog();
      if (persona) setCreatorData(await fetchCreatorSocial(explorerApiUrl, persona.address, persona.address));
    } catch (error) { setNotice({tone:'error',message:error.message}); }
  };

  const submitEdit = async () => {
    if (!targetPost || targetPost.creator !== persona?.address) return;
    try { await sendBuilt((bh) => buildEditPostTx({ wallet: persona, postsState: registry.posts, recentBlockhash: bh, postId: targetPost.postId, contentUri: composerText.trim() }), 'Edit'); closeDialog(); await resetFeed(); }
    catch (error) { setNotice({tone:'error',message:error.message}); }
  };
  const submitMint = async () => {
    setBusy('Mint NFT'); setNotice(null);
    try { const result = await mintSocialPostAsNft({ rpcUrl, explorerApiUrl, wallet: persona, post: targetPost }); setNotice({ tone:'success', message:`Post minted and indexed as ${shortAddress(result.tokenAddress)}.`, signature: result.signature }); setNfts(await fetchNftsForCreator(explorerApiUrl, persona.address, 100)); closeDialog(); }
    catch (error) { setNotice({tone:'error',message:error.message}); } finally { setBusy(''); }
  };

  const profilePosts = feed;
  const root = thread[0]; const replies = thread.slice(1);
  const rewardAccount = creatorData?.rewardAccounts?.data?.find((item) => item.creator === persona?.address);
  const revenue = creatorData?.revenues?.data?.find((item) => item.creator === persona?.address);
  const positions = creatorData?.walletStakes?.data || [];
  const subscriptions = creatorData?.walletSubscriptions?.data || [];

  const renderFeed = () => <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d13]">
    <div className="border-b border-white/10 p-4"><Composer wallet={persona} value={composerText} setValue={setComposerText} onOpen={() => openDialog('compose')}/></div>
    {loadingFeed && feed.length === 0 ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-aeko-accent"/></div> : profilePosts.length ? profilePosts.map((post) => <PostCard key={post.postId} post={post} persona={persona} counts={countsByPost[post.postId]} owned={post.creator === persona?.address} onProfile={(address)=>patchParams({social:'profile',profile:address},['post'])} onOpen={(p)=>patchParams({social:'post',post:p.postId},['profile'])} onAction={runEngagement} onDialog={openDialog}/>) : <Empty title="No posts yet" body="This timeline has no indexed AEKO Social posts."/>}
    <div ref={sentinel} className="flex h-16 items-center justify-center text-xs text-gray-600">{loadingFeed ? <Loader2 className="animate-spin" size={16}/> : hasMore ? 'Scroll for more' : feed.length ? 'You reached the end' : ''}</div>
  </div>;

  const renderProfileHeader = () => <section className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"><div className="h-24 bg-gradient-to-r from-aeko-accent/20 via-purple-500/10 to-cyan-500/10"/><div className="p-5"><div className="-mt-12 flex items-end justify-between gap-4"><div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[#0b0b10] bg-[#181822] text-lg font-bold text-white">{profileAddress.slice(0,2)}</div>{profileAddress !== persona?.address ? <div className="flex gap-2"><button onClick={() => openDialog('stake', {creator:profileAddress,postId:''})} className="h-9 rounded-xl border border-white/10 px-3 text-xs text-white">Stake</button><button onClick={() => openDialog('subscribe', {creator:profileAddress,postId:''})} className="h-9 rounded-xl bg-aeko-accent px-3 text-xs font-semibold text-black">Subscribe</button></div> : <Pill tone="accent">active persona</Pill>}</div><div className="mt-4 text-lg font-semibold text-white">{profileAddress === persona?.address ? persona?.name : shortAddress(profileAddress)}</div><div className="mt-1 break-all font-mono text-[11px] text-gray-500">{profileAddress}</div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Native balance" value={profile?.nativeBalance == null ? '—' : formatAeko(profile.nativeBalance)}/><Metric label="NFTs" value={profile?.nftCount}/><Metric label="Reputation" value={profile?.reputationScore}/></div></div></section>;

  const renderRewards = () => <div className="space-y-4"><section className="rounded-2xl border border-aeko-accent/20 bg-aeko-accent/[0.05] p-5"><div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-[0.15em] text-aeko-accent">Creator rewards</div><div className="mt-2 text-3xl font-semibold text-white">{formatAeko(rewardAccount?.claimableAmount || 0)}</div><div className="mt-1 text-xs text-gray-500">Claimable from the program-owned reward vault.</div></div><Sparkles className="text-aeko-accent" size={28}/></div><button disabled={!rewardAccount?.claimableAmount || busy} onClick={async()=>{try{await sendBuilt((bh)=>buildClaimCreatorRewardTx({wallet:persona,rewardsState:registry.rewards,rewardVault:registry.rewardVault,recentBlockhash:bh,amount:rewardAccount.claimableAmount}),'Reward claim');setCreatorData(await fetchCreatorSocial(explorerApiUrl,persona.address,persona.address));}catch(e){setNotice({tone:'error',message:e.message});}}} className="mt-5 h-10 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black disabled:opacity-40">Claim rewards</button></section><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-sm font-semibold text-white">Reward epochs</div><div className="mt-3 space-y-2">{(creatorData?.rewards?.data||[]).map((r)=><div key={`${r.epoch}-${r.creator}`} className="flex items-center justify-between rounded-xl border border-white/10 p-3 text-xs"><span>Epoch {r.epoch}</span><span className="text-aeko-accent">{formatAeko(r.rewardAmount)}</span></div>)}</div></section></div>;

  const renderStaking = () => <div className="space-y-4"><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center justify-between"><div><div className="text-lg font-semibold text-white">Creator staking</div><div className="mt-1 text-xs text-gray-500">Principal is escrowed in the Social Staking program-owned vault. Current epoch: {epoch}</div></div><button onClick={()=>openDialog('stake',{creator:persona?.address,postId:''})} className="h-10 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black">Open position</button></div></section>{positions.length ? positions.map((position)=><section key={position.positionId} className="rounded-2xl border border-white/10 bg-[#0e0e14] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">{shortAddress(position.creator)}</div><div className="mt-1 font-mono text-[10px] text-gray-600">{shortAddress(position.positionId)}</div></div><Pill tone={position.state==='active'?'accent':'neutral'}>{position.state}</Pill></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Staked" value={formatAeko(position.stakedAmount)}/><Metric label="Yield" value={formatAeko(position.accumulatedYield)}/><Metric label="Unlock epoch" value={position.unlockEpoch ?? '—'}/></div><div className="mt-4 flex flex-wrap gap-2">{position.state==='active'?<button onClick={async()=>{try{await sendBuilt((bh)=>buildRequestUnstakeTx({wallet:persona,stakingState:registry.staking,recentBlockhash:bh,positionId:position.positionId,unlockEpoch:Math.max(epoch+7,position.activatedAtEpoch+7)}),'Request unstake');setCreatorData(await fetchCreatorSocial(explorerApiUrl,persona.address,persona.address));}catch(e){setNotice({tone:'error',message:e.message});}}} className="h-9 rounded-xl border border-white/10 px-3 text-xs">Request unstake</button>:null}{position.state==='cooling-down'&&Number(position.unlockEpoch)<=epoch?<button onClick={async()=>{try{await sendBuilt((bh)=>buildFinalizeUnstakeTx({wallet:persona,stakingState:registry.staking,stakeVault:registry.stakeVault,recentBlockhash:bh,positionId:position.positionId,currentEpoch:epoch}),'Finalize unstake');setCreatorData(await fetchCreatorSocial(explorerApiUrl,persona.address,persona.address));}catch(e){setNotice({tone:'error',message:e.message});}}} className="h-9 rounded-xl bg-white px-3 text-xs font-semibold text-black">Finalize</button>:null}{Number(position.accumulatedYield)>0?<button onClick={async()=>{try{await sendBuilt((bh)=>buildClaimStakeYieldTx({wallet:persona,stakingState:registry.staking,rewardVault:registry.stakeRewardVault,recentBlockhash:bh,positionId:position.positionId,amount:position.accumulatedYield}),'Yield claim');setCreatorData(await fetchCreatorSocial(explorerApiUrl,persona.address,persona.address));}catch(e){setNotice({tone:'error',message:e.message});}}} className="h-9 rounded-xl border border-aeko-accent/30 px-3 text-xs text-aeko-accent">Claim yield</button>:null}</div></section>) : <Empty icon={Coins} title="No stake positions" body="Open a position from a creator profile or post."/>}</div>;

  const renderMonetization = () => <div className="space-y-4"><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="text-xs uppercase tracking-[0.15em] text-gray-500">Creator revenue</div><div className="mt-2 text-3xl font-semibold text-white">{formatAeko(revenue?.claimableAmount || 0)}</div><button disabled={!revenue?.claimableAmount} onClick={async()=>{try{await sendBuilt((bh)=>buildClaimMonetizationTx({wallet:persona,monetizationState:registry.monetization,treasury:registry.treasury,recentBlockhash:bh,amount:revenue.claimableAmount}),'Revenue claim');setCreatorData(await fetchCreatorSocial(explorerApiUrl,persona.address,persona.address));}catch(e){setNotice({tone:'error',message:e.message});}}} className="mt-4 h-10 rounded-xl bg-aeko-accent px-4 text-sm font-semibold text-black disabled:opacity-40">Claim revenue</button></section><section className="rounded-2xl border border-white/10 bg-[#0e0e14] p-4"><div className="text-sm font-semibold text-white">My subscriptions</div><div className="mt-3 space-y-2">{subscriptions.length?subscriptions.map((sub)=><div key={sub.subscriptionId} className="rounded-xl border border-white/10 p-3"><div className="flex items-center justify-between"><div className="text-xs text-white">{shortAddress(sub.creator)}</div><Pill>{sub.state}</Pill></div><div className="mt-2 text-[11px] text-gray-500">{formatAeko(sub.amountPerPeriod)} · valid until {dateLabel(sub.validUntilUnix)}</div><div className="mt-3 flex gap-2">{sub.state==='active'?<><button onClick={async()=>{try{await sendBuilt((bh)=>buildRenewSubscriptionTx({wallet:persona,monetizationState:registry.monetization,treasury:registry.treasury,recentBlockhash:bh,subscriptionId:sub.subscriptionId,validUntil:sub.validUntilUnix+30*86400}),'Renew subscription');}catch(e){setNotice({tone:'error',message:e.message});}}} className="h-8 rounded-lg border border-white/10 px-3 text-[11px]">Renew 30d</button><button onClick={async()=>{try{await sendBuilt((bh)=>buildCancelSubscriptionTx({wallet:persona,monetizationState:registry.monetization,recentBlockhash:bh,subscriptionId:sub.subscriptionId}),'Cancel subscription');}catch(e){setNotice({tone:'error',message:e.message});}}} className="h-8 rounded-lg border border-red-400/20 px-3 text-[11px] text-red-300">Cancel</button></>:null}</div></div>):<div className="text-xs text-gray-600">No subscriptions for this persona.</div>}</div></section></div>;

  const renderAssets = () => <div className="space-y-4"><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="text-lg font-semibold text-white">Social NFTs</div><div className="mt-1 text-xs text-gray-500">AEKO-721 assets created from posts owned by the selected persona. Minting is deterministic and requires the post creator wallet.</div></section>{nfts.length?<div className="grid gap-3 md:grid-cols-2">{nfts.map((nft)=><div key={nft.tokenId} className="rounded-2xl border border-white/10 bg-[#0e0e14] p-4"><div className="flex h-28 items-center justify-center rounded-xl bg-gradient-to-br from-aeko-accent/15 to-purple-500/10"><Image className="text-aeko-accent"/></div><div className="mt-3 font-mono text-xs text-white">{shortAddress(nft.tokenId)}</div><div className="mt-1 truncate text-[11px] text-gray-500">{nft.metadataUri}</div></div>)}</div>:<Empty icon={Image} title="No Social NFTs indexed" body="Open one of your posts and choose Mint as NFT."/>}</div>;

  const renderProtocol = () => <div className="grid gap-4 md:grid-cols-2">{Object.entries(status?.domains||{}).map(([name,domain])=><section key={name} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center justify-between"><div className="font-semibold text-white">{name}</div><Pill tone={domain.ownerMatches&&domain.initialized?'accent':'warn'}>{domain.ownerMatches&&domain.initialized?'ready':'issue'}</Pill></div><div className="mt-2 break-all font-mono text-[10px] text-gray-600">{domain.stateAccount}</div><div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(domain.metrics||{}).slice(0,8).map(([k,v])=><Pill key={k}>{k}: {String(v)}</Pill>)}</div></section>)}</div>;

  let body;
  if (page === 'post') body = <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d13]">{root?<><PostCard post={root} persona={persona} counts={countsByPost[root.postId]} owned={root.creator===persona?.address} onProfile={(a)=>patchParams({social:'profile',profile:a},['post'])} onOpen={()=>{}} onAction={runEngagement} onDialog={openDialog}/><div className="border-y border-white/10 bg-white/[0.02] px-4 py-3 text-xs font-semibold text-gray-400">Replies · {replies.length}</div>{replies.map((post)=><PostCard key={post.postId} post={post} persona={persona} counts={countsByPost[post.postId]} owned={post.creator===persona?.address} onProfile={(a)=>patchParams({social:'profile',profile:a},['post'])} onOpen={(p)=>patchParams({social:'post',post:p.postId})} onAction={runEngagement} onDialog={openDialog}/>)}</>:<Empty title="Loading thread" body="Waiting for the indexed Social thread."/>}</div>;
  else if (page === 'profile') body = <>{renderProfileHeader()}{renderFeed()}</>;
  else if (page === 'rewards') body = renderRewards();
  else if (page === 'staking') body = renderStaking();
  else if (page === 'monetization') body = renderMonetization();
  else if (page === 'assets') body = renderAssets();
  else if (page === 'protocol') body = renderProtocol();
  else body = renderFeed();

  const dialogPost = targetPost;
  return <div className="fixed inset-0 z-50 bg-black/70 p-0 backdrop-blur-sm sm:p-4">
    <div className="relative mx-auto flex h-full w-full max-w-[1480px] flex-col overflow-hidden border-white/10 bg-[#09090e] shadow-2xl sm:h-[calc(100vh-2rem)] sm:rounded-3xl sm:border">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aeko-accent text-black"><Users size={17}/></div><div className="min-w-0"><div className="text-sm font-semibold text-white">AEKO Network Social</div><div className="truncate text-[10px] uppercase tracking-[0.14em] text-gray-600">RPC → Social programs → indexer → PostgreSQL → UI</div></div></div><div className="flex items-center gap-2"><button onClick={()=>{patchParams({tab:'accounts'},['social','profile','post','dialog','target']);}} className="hidden h-9 rounded-xl border border-white/10 px-3 text-xs text-gray-400 hover:text-white sm:block">Accounts</button><button onClick={()=>{patchParams({tab:'programs'},['social','profile','post','dialog','target']);}} className="hidden h-9 rounded-xl border border-white/10 px-3 text-xs text-gray-400 hover:text-white sm:block">Programs</button><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white"><X size={17}/></button></div></header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-black/20 lg:flex"><nav className="space-y-1 p-3">{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>patchParams({social:id},['profile','post','dialog','target'])} className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm ${page===id?'bg-white/[0.07] text-white':'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'}`}><Icon size={16}/>{label}</button>)}</nav><div className="mt-auto border-t border-white/10 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Active persona</div>{persona?<select value={persona.address} onChange={(e)=>patchParams({persona:e.target.value,social:'me'},['profile','post'])} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-[#111118] px-2 text-xs text-white">{wallets.map((wallet)=><option key={wallet.id} value={wallet.address}>{wallet.name} · {shortAddress(wallet.address)}</option>)}</select>:<button onClick={()=>patchParams({tab:'accounts'})} className="mt-2 w-full rounded-xl border border-aeko-accent/20 p-3 text-left text-xs text-aeko-accent">Create a test wallet in Accounts</button>}{persona?<div className="mt-3 flex items-center justify-between text-[11px] text-gray-500"><span>{shortAddress(persona.address)}</span><span>{balance==null?'—':formatAeko(balance)}</span></div>:null}</div></aside>
        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain"><div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/10 bg-[#09090e]/90 px-4 backdrop-blur-xl"><div className="flex items-center gap-2">{['profile','post'].includes(page)?<IconButton title="Back" onClick={()=>patchParams({social:'feed'},['profile','post'])}><ArrowLeft size={15}/></IconButton>:null}<span className="text-sm font-semibold capitalize text-white">{page === 'me' ? 'My timeline' : page}</span></div><div className="flex items-center gap-2"><button onClick={()=>void Promise.all([refreshProtocol(),refreshPersona(),['feed','me','profile'].includes(page)?resetFeed():Promise.resolve()])} className="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-400"><RefreshCw size={13}/> Refresh</button><button onClick={()=>openDialog('compose')} className="h-9 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black">Post</button></div></div>
          {notice?<div className={`m-4 rounded-xl border p-3 text-xs ${notice.tone==='error'?'border-red-400/20 bg-red-500/10 text-red-200':'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}><div className="flex items-start justify-between gap-3"><span>{notice.message}</span><button onClick={()=>setNotice(null)}><X size={13}/></button></div>{notice.signature?<div className="mt-2 font-mono text-[10px] opacity-70">tx {shortAddress(notice.signature)}</div>:null}</div>:null}
          <div className="mx-auto w-full max-w-4xl p-4 sm:p-5">{body}</div>
        </main>
        <aside className="hidden w-72 shrink-0 border-l border-white/10 bg-black/10 p-4 xl:block"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="text-aeko-accent" size={15}/> Social readiness</div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-gray-500">Five-domain state</span><Pill tone={status?.complete?'accent':'warn'}>{status?.complete?'ready':'incomplete'}</Pill></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-gray-500">Registry + vaults</span><Pill tone={registry?.complete?'accent':'warn'}>{registry?.complete?'ready':'incomplete'}</Pill></div></div><div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-sm font-semibold text-white">Selected persona</div><div className="mt-3 font-mono text-[11px] text-gray-500">{persona?shortAddress(persona.address):'No owned wallet'}</div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Balance" value={balance==null?'—':formatAeko(balance)}/><Metric label="Epoch" value={epoch}/></div></div></aside>
      </div>
      <nav className="flex shrink-0 overflow-x-auto border-t border-white/10 bg-[#0b0b11] p-2 lg:hidden">{NAV.slice(0,6).map(([id,label,Icon])=><button key={id} onClick={()=>patchParams({social:id},['profile','post'])} className={`flex min-w-[76px] flex-1 flex-col items-center gap-1 rounded-xl p-2 text-[10px] ${page===id?'bg-white/[0.07] text-aeko-accent':'text-gray-500'}`}><Icon size={15}/>{label}</button>)}</nav>

      {['compose','reply','quote'].includes(dialog)?<ActionDialog title={dialog==='compose'?'Create post':dialog==='reply'?'Reply to post':'Quote post'} description="Signed by the selected owned persona and anchored directly in AEKO Social Posts." onClose={closeDialog} onSubmit={submitPost} submitLabel={dialog==='reply'?'Reply':dialog==='quote'?'Quote':'Post'} busy={Boolean(busy)}><textarea autoFocus value={composerText} onChange={(e)=>setComposerText(e.target.value.slice(0,512))} placeholder="What is happening on AEKO?" className="min-h-40 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-[15px] leading-6 text-white outline-none focus:border-aeko-accent/50"/><div className="mt-2 flex justify-between text-[11px] text-gray-600"><span>{persona?.name} · {shortAddress(persona?.address||'')}</span><span>{composerText.length}/512</span></div></ActionDialog>:null}
      {dialog==='edit'?<ActionDialog title="Edit post" description="Only the original creator can sign this edit." onClose={closeDialog} onSubmit={submitEdit} submitLabel="Save edit" busy={Boolean(busy)}><textarea autoFocus value={composerText} onChange={(e)=>setComposerText(e.target.value.slice(0,512))} className="min-h-36 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none focus:border-aeko-accent/50"/></ActionDialog>:null}
      {['tip','stake','subscribe','unlock'].includes(dialog)?<ActionDialog title={dialog==='tip'?'Tip creator':dialog==='stake'?'Stake on creator':dialog==='subscribe'?'Subscribe to creator':'Unlock paid post'} description="This action moves testnet AEKO through the canonical program-owned Social vault." onClose={closeDialog} onSubmit={submitEconomic} submitLabel={dialog==='stake'?'Open stake':'Confirm'} busy={Boolean(busy)}><div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-gray-400">Signer <span className="font-mono text-white">{shortAddress(persona?.address||'')}</span></div><label className="mt-4 block text-xs text-gray-500">AEKO amount<input type="number" min="0.000000001" step="0.000000001" value={amount} onChange={(e)=>setAmount(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-aeko-accent/50"/></label>{dialog==='subscribe'?<label className="mt-4 block text-xs text-gray-500">Period (days)<input type="number" min="1" value={periodDays} onChange={(e)=>setPeriodDays(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"/></label>:null}</ActionDialog>:null}
      {dialog==='mint'?<ActionDialog title="Mint post as AEKO-721" description="Creates or reuses your deterministic AEKO Social collection, mints this post, confirms it on RPC, then waits for the Explorer asset indexer." onClose={closeDialog} onSubmit={submitMint} submitLabel="Mint NFT" busy={Boolean(busy)}><div className="rounded-2xl border border-aeko-accent/20 bg-aeko-accent/[0.05] p-4"><div className="text-xs text-aeko-accent">Creator ownership check</div><div className="mt-2 font-mono text-[11px] text-gray-400">{dialogPost?.creator}</div><div className="mt-3 text-sm leading-6 text-gray-200">{content(dialogPost)}</div></div></ActionDialog>:null}
    </div>
  </div>;
}
