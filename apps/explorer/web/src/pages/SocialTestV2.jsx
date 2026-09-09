import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Heart,
  Image,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
} from 'lucide-react';
import { getNetworkConfig } from '../utils/networkConfig';
import {
  aekoToLamports,
  confirmSignature,
  formatAeko,
  getBalance,
  getEpochInfo,
  getLatestBlockhash,
  requestAirdrop,
  sendTransaction,
} from '../utils/aekoRpcClient';
import { buildSignedAnchorPostTx, randomBytes32, sha256 } from '../utils/aekoSocial';
import { buildEngagementTx, buildOpenStakeTx, buildTipTx } from '../utils/aekoSocialActions';
import { mintSocialPostAsNft } from '../utils/aekoSocialNft';
import {
  encodeBase58,
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import {
  fetchPostEngagement,
  fetchSocialRegistry,
  fetchSocialStatus,
} from '../utils/testConsoleApi';

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1_000;
const MIN_TEST_BALANCE = aekoToLamports(1);
const ECONOMIC_TEST_AMOUNT = aekoToLamports(0.01);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExplorer(base, path) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(`Explorer ${path} returned ${response.status}: ${text.slice(0, 140)}`);
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Explorer ${path} failed (${response.status})`);
  return payload?.data;
}

async function pollUntil(read, accept, message) {
  let lastValue;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    lastValue = await read();
    if (accept(lastValue)) return lastValue;
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(message);
}

function StepState({ state }) {
  if (!state) return <span className="text-xs text-gray-500">Not run</span>;
  if (state.status === 'running') {
    return <span className="inline-flex items-center gap-1.5 text-xs text-amber-200"><RefreshCw size={12} className="animate-spin" /> Running</span>;
  }
  if (state.status === 'pass') {
    return <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 size={13} /> PASS</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs text-red-300"><XCircle size={13} /> FAIL</span>;
}

function DomainCard({ name, status }) {
  const ready = status?.ownerMatches && status?.initialized && !status?.error;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-white">{name}</div>
        <span className={`text-xs ${ready ? 'text-emerald-300' : 'text-red-300'}`}>{ready ? 'ready' : 'not ready'}</span>
      </div>
      <div className="mt-2 break-all font-mono text-[11px] text-gray-500">{status?.stateAccount || 'state account unresolved'}</div>
      {status?.error ? <div className="mt-2 text-xs text-red-300">{status.error}</div> : null}
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, state, disabled, onClick }) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-aeko-accent/25 bg-aeko-accent/10"><Icon size={17} className="text-aeko-accent" /></div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-gray-400">{description}</p>
      <div className="mt-4 flex items-center justify-between gap-3"><StepState state={state} /><button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40">Run</button></div>
    </div>
  );
}

export default function SocialTestV2() {
  const config = getNetworkConfig('testnet');
  const rpcUrl = import.meta.env.VITE_AEKO_LOCAL_RPC || config.rpcUrl;
  const explorerApiUrl = import.meta.env.VITE_AEKO_LOCAL_EXPLORER_API || config.explorerApiUrl;
  const [wallets, setWallets] = useState(() => loadWallets());
  const [walletId, setWalletId] = useState(() => loadWallets()[0]?.id || '');
  const [balance, setBalance] = useState(null);
  const [registry, setRegistry] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [lastPost, setLastPost] = useState(null);
  const [steps, setSteps] = useState({});
  const [busy, setBusy] = useState(false);

  const wallet = useMemo(() => wallets.find((entry) => entry.id === walletId) || wallets[0] || null, [wallets, walletId]);
  const updateStep = useCallback((key, status, message, detail = null) => {
    setSteps((current) => ({ ...current, [key]: { status, message, detail } }));
  }, []);

  const ensureWallet = useCallback(() => {
    if (wallets.length) return wallets[0];
    const created = generateTestWallet('SocialFi E2E wallet');
    saveWallets([created]);
    setWallets([created]);
    setWalletId(created.id);
    return created;
  }, [wallets]);

  const refreshBalance = useCallback(async (target = wallet) => {
    if (!target) return null;
    const value = await getBalance(rpcUrl, target.address);
    setBalance(value);
    return value;
  }, [rpcUrl, wallet]);

  const refreshStatus = useCallback(async () => {
    const [resolvedRegistry, resolvedStatus] = await Promise.all([
      fetchSocialRegistry(explorerApiUrl),
      fetchSocialStatus(explorerApiUrl),
    ]);
    if (!resolvedRegistry?.complete) throw new Error('Social registry is incomplete, including program-owned vault addresses.');
    const domains = resolvedStatus?.domains || {};
    const allReady = ['posts', 'rewards', 'staking', 'antiSpam', 'monetization'].every((key) => domains[key]?.initialized && domains[key]?.ownerMatches && !domains[key]?.error);
    if (!allReady) throw new Error('One or more live Social program states are unhealthy.');
    setRegistry(resolvedRegistry);
    setLiveStatus(resolvedStatus);
    return { registry: resolvedRegistry, status: resolvedStatus };
  }, [explorerApiUrl]);

  useEffect(() => {
    const target = ensureWallet();
    Promise.all([refreshStatus(), refreshBalance(target)]).catch((error) => updateStep('readiness', 'fail', error.message));
  }, [ensureWallet, refreshBalance, refreshStatus, updateStep]);

  async function ensureFunded(target) {
    const current = await refreshBalance(target);
    if (current >= MIN_TEST_BALANCE) return current;
    updateStep('fund', 'running', 'Requesting testnet AEKO for fees and economic custody checks.');
    const signature = await requestAirdrop(rpcUrl, target.address, aekoToLamports(2));
    await confirmSignature(rpcUrl, signature);
    const funded = await refreshBalance(target);
    if (funded <= current) throw new Error('Airdrop confirmed but wallet balance did not increase.');
    updateStep('fund', 'pass', `Wallet funded: ${formatAeko(funded)}`, signature);
    return funded;
  }

  async function runPost(target, resolvedRegistry) {
    updateStep('post', 'running', 'Submitting a signed Social post and waiting for Explorer indexing.');
    const recentBlockhash = await getLatestBlockhash(rpcUrl);
    const postIdBytes = randomBytes32();
    const postId = encodeBase58(postIdBytes);
    const contentUri = `AEKO Social E2E ${Date.now()}`;
    const transaction = buildSignedAnchorPostTx({
      creatorWallet: target,
      stateAccount: resolvedRegistry.posts,
      antiSpamStateAccount: resolvedRegistry.antiSpam,
      recentBlockhash,
      postId: postIdBytes,
      contentHash: await sha256(contentUri),
      metadataHash: await sha256(JSON.stringify({ test: 'social-e2e-custody' })),
      contentUri,
      parentPostId: null,
      postKind: 'original',
      createdAtUnix: Math.floor(Date.now() / 1000),
      visibility: 'public',
    });
    const signature = await sendTransaction(rpcUrl, transaction);
    await confirmSignature(rpcUrl, signature);
    const indexed = await pollUntil(
      () => fetchExplorer(explorerApiUrl, `/posts/${encodeURIComponent(postId)}`).catch(() => null),
      (post) => post?.postId === postId,
      'Post confirmed on-chain but Explorer did not index it within 30 seconds.',
    );
    const result = { id: postId, creator: target.address, signature, indexed };
    setLastPost(result);
    updateStep('post', 'pass', 'Signed post confirmed and observed through the Explorer indexer.', signature);
    return result;
  }

  async function runNft(target, post) {
    if (!post) throw new Error('Create an indexed post before testing its NFT projection.');
    updateStep('nft', 'running', 'Minting the indexed Social post as AEKO-721 and waiting for Explorer asset indexing.');
    const result = await mintSocialPostAsNft({
      rpcUrl,
      explorerApiUrl,
      wallet: target,
      post: {
        postId: post.id,
        creator: post.creator,
        postKind: 'original',
      },
    });
    if (!result?.indexed || result.indexed.tokenId !== result.tokenAddress) {
      throw new Error('NFT mint confirmed but the indexed token did not match the deterministic minted address.');
    }
    updateStep('nft', 'pass', `Post → NFT → Explorer verified for ${shortAddress(result.tokenAddress)}.`, result.signature);
    await refreshBalance(target);
    return result;
  }

  async function runLike(target, resolvedRegistry, post) {
    if (!post) throw new Error('Create an indexed post before testing engagement.');
    updateStep('like', 'running', 'Submitting signed Like and requiring indexed proof.');
    const recentBlockhash = await getLatestBlockhash(rpcUrl);
    const built = buildEngagementTx({
      wallet: target,
      postsState: resolvedRegistry.posts,
      antiSpamState: resolvedRegistry.antiSpam,
      recentBlockhash,
      post: { postId: post.id, creator: post.creator },
      action: 'like',
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const events = await pollUntil(
      () => fetchPostEngagement(explorerApiUrl, post.id, { actionKind: 'like', limit: 100 }),
      (items) => Array.isArray(items) && items.some((event) => event.proofId === built.id && Number(event.slot) > 0),
      'Like confirmed on-chain but Explorer did not index its proof.',
    );
    const event = events.find((item) => item.proofId === built.id);
    updateStep('like', 'pass', `Like indexed at canonical slot ${event.slot}.`, signature);
  }

  async function runStake(target, resolvedRegistry) {
    updateStep('stake', 'running', 'Opening stake and verifying real principal custody.');
    const [beforeWallet, beforeVault, recentBlockhash, epochInfo] = await Promise.all([
      getBalance(rpcUrl, target.address),
      getBalance(rpcUrl, resolvedRegistry.stakeVault),
      getLatestBlockhash(rpcUrl),
      getEpochInfo(rpcUrl),
    ]);
    const built = buildOpenStakeTx({
      wallet: target,
      stakingState: resolvedRegistry.staking,
      stakeVault: resolvedRegistry.stakeVault,
      recentBlockhash,
      creator: target.address,
      amount: ECONOMIC_TEST_AMOUNT,
      currentEpoch: Number(epochInfo?.epoch || 0),
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const [afterWallet, afterVault] = await Promise.all([
      getBalance(rpcUrl, target.address),
      getBalance(rpcUrl, resolvedRegistry.stakeVault),
    ]);
    if (afterVault - beforeVault !== ECONOMIC_TEST_AMOUNT) throw new Error(`Stake vault delta ${afterVault - beforeVault} did not equal ${ECONOMIC_TEST_AMOUNT} lamports.`);
    if (beforeWallet - afterWallet < ECONOMIC_TEST_AMOUNT) throw new Error('Staker wallet did not fund the escrowed principal.');
    const positions = await pollUntil(
      () => fetchExplorer(explorerApiUrl, `/stakes?staker=${encodeURIComponent(target.address)}&limit=100`),
      (items) => Array.isArray(items) && items.some((position) => position.positionId === built.id && Number(position.stakedAmount) === ECONOMIC_TEST_AMOUNT),
      'Stake moved value on-chain but Explorer did not index the exact position.',
    );
    updateStep('stake', 'pass', `Escrow verified: ${formatAeko(ECONOMIC_TEST_AMOUNT)} moved into ${shortAddress(resolvedRegistry.stakeVault)} and position ${shortAddress(built.id)} was indexed.`, signature);
    await refreshBalance(target);
    return positions.find((position) => position.positionId === built.id);
  }

  async function runTip(target, resolvedRegistry) {
    updateStep('tip', 'running', 'Sending creator tip and verifying sender/treasury balances.');
    const [beforeWallet, beforeTreasury, recentBlockhash] = await Promise.all([
      getBalance(rpcUrl, target.address),
      getBalance(rpcUrl, resolvedRegistry.treasury),
      getLatestBlockhash(rpcUrl),
    ]);
    const built = buildTipTx({
      wallet: target,
      monetizationState: resolvedRegistry.monetization,
      treasury: resolvedRegistry.treasury,
      recentBlockhash,
      creator: target.address,
      amount: ECONOMIC_TEST_AMOUNT,
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const [afterWallet, afterTreasury] = await Promise.all([
      getBalance(rpcUrl, target.address),
      getBalance(rpcUrl, resolvedRegistry.treasury),
    ]);
    if (afterTreasury - beforeTreasury !== ECONOMIC_TEST_AMOUNT) throw new Error(`Monetization treasury delta ${afterTreasury - beforeTreasury} did not equal ${ECONOMIC_TEST_AMOUNT} lamports.`);
    if (beforeWallet - afterWallet < ECONOMIC_TEST_AMOUNT) throw new Error('Tip sender wallet was not debited for the transferred amount.');
    const tips = await pollUntil(
      () => fetchExplorer(explorerApiUrl, `/social/tips?sender=${encodeURIComponent(target.address)}&creator=${encodeURIComponent(target.address)}&limit=100`),
      (items) => Array.isArray(items) && items.some((tip) => tip.tipId === built.id && Number(tip.amount) === ECONOMIC_TEST_AMOUNT),
      'Tip moved value on-chain but Explorer did not index the exact tip record.',
    );
    updateStep('tip', 'pass', `Custody verified: ${formatAeko(ECONOMIC_TEST_AMOUNT)} moved into ${shortAddress(resolvedRegistry.treasury)} and tip ${shortAddress(built.id)} was indexed.`, signature);
    await refreshBalance(target);
    return tips.find((tip) => tip.tipId === built.id);
  }

  async function runRewardsRead(target) {
    updateStep('rewards', 'running', 'Reading indexed creator rewards.');
    const rewards = await fetchExplorer(explorerApiUrl, `/rewards?creator=${encodeURIComponent(target.address)}&limit=50`);
    if (!Array.isArray(rewards)) throw new Error('Explorer rewards endpoint did not return its indexed array contract.');
    updateStep('rewards', 'pass', `Rewards read path returned ${rewards.length} creator record(s).`);
  }

  async function runAction(key, action) {
    if (busy) return;
    setBusy(true);
    try {
      const target = wallet || ensureWallet();
      const readiness = await refreshStatus();
      await ensureFunded(target);
      await action(target, readiness.registry);
      await refreshStatus();
    } catch (error) {
      updateStep(key, 'fail', error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runFullFlow() {
    if (busy) return;
    setBusy(true);
    updateStep('full', 'running', 'Running signed Social custody and asset flow end to end.');
    try {
      const target = wallet || ensureWallet();
      const readiness = await refreshStatus();
      await ensureFunded(target);
      const post = await runPost(target, readiness.registry);
      await runNft(target, post);
      await ensureFunded(target);
      await runLike(target, readiness.registry, post);
      await runStake(target, readiness.registry);
      await runTip(target, readiness.registry);
      await runRewardsRead(target);
      await refreshStatus();
      updateStep('full', 'pass', 'Post + NFT + engagement + real stake escrow + real tip transfer + Explorer projections all passed.');
    } catch (error) {
      updateStep('full', 'fail', error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  const domains = liveStatus?.domains || {};
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="mb-2 text-sm font-medium text-aeko-accent">Explorer acceptance lab</div><h1 className="mb-4 text-4xl font-bold md:text-5xl">AEKO SocialFi Custody E2E</h1><p className="max-w-3xl text-lg text-gray-400">Exercise signed Social transactions through public RPC, prove actual wallet/vault balance movement, mint the same indexed post as AEKO-721, then require Explorer PostgreSQL projections to observe every corresponding record before a step can pass.</p></div>
        <button type="button" disabled={busy} onClick={runFullFlow} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black disabled:opacity-50"><Sparkles size={17} /> Run custody + asset flow</button>
      </div>

      <div className="mb-8 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" /><div className="text-sm text-amber-100/90"><div className="mb-1 font-semibold">Testnet keys move real testnet lamports</div><p>Browser-local wallets remain unencrypted test keys. The stake and tip steps fail unless the selected wallet loses the expected principal/value and the configured program-owned vault gains exactly that amount. NFT setup also spends testnet lamports for rent. Do not use these keys for assets with real economic value.</p></div></div>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="mb-4 flex items-center gap-2"><Wallet size={18} className="text-aeko-accent" /><h2 className="font-semibold">Owned test wallet</h2></div><select value={wallet?.id || ''} onChange={(event) => setWalletId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{wallets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {shortAddress(entry.address)}</option>)}</select><div className="mt-3 break-all font-mono text-xs text-gray-400">{wallet?.address}</div><div className="mt-4 flex items-center justify-between text-sm"><span className="text-gray-400">Balance</span><span>{balance == null ? '—' : formatAeko(balance)}</span></div><button type="button" disabled={busy || !wallet} onClick={() => runAction('fund', ensureFunded)} className="mt-4 w-full rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50">Ensure test balance</button><div className="mt-4 break-all text-xs text-gray-500">RPC: {rpcUrl}</div><div className="mt-1 break-all text-xs text-gray-500">Explorer API: {explorerApiUrl}</div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="mb-4 flex items-center justify-between gap-4"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-aeko-accent" /><h2 className="font-semibold">Live protocol state</h2></div><button type="button" disabled={busy} onClick={() => runAction('readiness', refreshStatus)} className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"><RefreshCw size={13} /> Refresh</button></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><DomainCard name="Posts + Engagement" status={domains.posts} /><DomainCard name="Rewards" status={domains.rewards} /><DomainCard name="Staking" status={domains.staking} /><DomainCard name="Anti-Spam" status={domains.antiSpam} /><DomainCard name="Monetization" status={domains.monetization} /></div><div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-3"><div>Stake vault: <span className="font-mono text-gray-300">{registry?.stakeVault ? shortAddress(registry.stakeVault) : '—'}</span></div><div>Reward vault: <span className="font-mono text-gray-300">{registry?.rewardVault ? shortAddress(registry.rewardVault) : '—'}</span></div><div>Monetization treasury: <span className="font-mono text-gray-300">{registry?.treasury ? shortAddress(registry.treasury) : '—'}</span></div></div></section>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5"><ActionCard icon={Send} title="1. Post" description="Sign an on-chain post and require /posts/:id to index it." state={steps.post} disabled={busy} onClick={() => runAction('post', runPost)} /><ActionCard icon={Image} title="2. Post NFT" description="Mint the indexed post as deterministic AEKO-721 and require Explorer asset indexing." state={steps.nft} disabled={busy || !lastPost} onClick={() => runAction('nft', (target) => runNft(target, lastPost))} /><ActionCard icon={Heart} title="3. Like" description="Sign engagement and require its proof with a canonical chain slot." state={steps.like} disabled={busy || !lastPost} onClick={() => runAction('like', (target, resolved) => runLike(target, resolved, lastPost))} /><ActionCard icon={ShieldCheck} title="4. Stake custody" description="Move 0.01 AEKO from the wallet into the program-owned principal vault and index the exact position." state={steps.stake} disabled={busy} onClick={() => runAction('stake', runStake)} /><ActionCard icon={CircleDollarSign} title="5. Tip custody" description="Move 0.01 AEKO from the sender into the program-owned monetization treasury and index the exact tip." state={steps.tip} disabled={busy} onClick={() => runAction('tip', runTip)} /></div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"><div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Acceptance evidence</h2><p className="mt-1 text-xs text-gray-500">PASS requires observable RPC confirmation/balance movement and the corresponding Explorer projection.</p></div><button type="button" disabled={busy} onClick={() => runAction('rewards', runRewardsRead)} className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50">Verify rewards read</button></div><div className="divide-y divide-white/10">{[['full','Full custody + asset flow'],['fund','Wallet funding'],['post','Post → Explorer'],['nft','Post → NFT → Explorer'],['like','Like → Explorer'],['stake','Wallet → stake vault → Explorer'],['tip','Wallet → treasury → Explorer'],['rewards','Rewards read'],['readiness','Five-domain readiness']].map(([key,label]) => <div key={key} className="grid grid-cols-1 items-start gap-2 px-5 py-4 md:grid-cols-[220px_100px_1fr] md:gap-4"><div className="text-sm text-gray-200">{label}</div><StepState state={steps[key]} /><div><div className="text-sm text-gray-400">{steps[key]?.message || 'Not run yet.'}</div>{steps[key]?.detail ? <div className="mt-1 break-all font-mono text-[11px] text-gray-600">{steps[key].detail}</div> : null}</div></div>)}</div></section>
    </div>
  );
}
