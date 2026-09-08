import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Heart,
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
import {
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import {
  buildSocialLikeTestTx,
  buildSocialPostTestTx,
  buildSocialStakeTestTx,
  buildSocialTipTestTx,
} from '../utils/aekoSocialTestTransactions';

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1_000;
const MIN_FEE_BALANCE = 100_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExplorer(base, path) {
  const response = await fetch(`${base}${path}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(`Explorer ${path} returned ${response.status}: ${text.slice(0, 140)}`);
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Explorer ${path} failed (${response.status})`);
  }
  return payload;
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
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-200">
        <RefreshCw size={12} className="animate-spin" /> Running
      </span>
    );
  }
  if (state.status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
        <CheckCircle2 size={13} /> PASS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-300">
      <XCircle size={13} /> FAIL
    </span>
  );
}

function DomainCard({ name, status }) {
  const ready = status?.ownerMatches && status?.initialized && !status?.error;
  const metrics = status?.metrics || {};
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-white">{name}</div>
        <span className={`text-xs ${ready ? 'text-emerald-300' : 'text-red-300'}`}>
          {ready ? 'ready' : 'not ready'}
        </span>
      </div>
      <div className="mt-2 font-mono text-[11px] text-gray-500 break-all">
        {status?.stateAccount || 'state account unresolved'}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(metrics).slice(0, 6).map(([key, value]) => (
          <span key={key} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-gray-300">
            {key}: {String(value)}
          </span>
        ))}
      </div>
      {status?.error && <div className="mt-2 text-xs text-red-300">{status.error}</div>}
    </div>
  );
}

export default function SocialTest() {
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

  const wallet = useMemo(
    () => wallets.find((entry) => entry.id === walletId) || wallets[0] || null,
    [wallets, walletId],
  );

  const updateStep = useCallback((key, status, message, detail = null) => {
    setSteps((current) => ({
      ...current,
      [key]: { status, message, detail, updatedAt: new Date().toISOString() },
    }));
  }, []);

  const ensureWallet = useCallback(() => {
    if (wallets.length) return wallets[0];
    const created = generateTestWallet('SocialFi E2E wallet');
    const next = [created];
    saveWallets(next);
    setWallets(next);
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
    const [registryEnvelope, statusEnvelope] = await Promise.all([
      fetchExplorer(explorerApiUrl, '/registry/social'),
      fetchExplorer(explorerApiUrl, '/social/status'),
    ]);
    const resolvedRegistry = registryEnvelope?.data;
    const resolvedStatus = statusEnvelope?.data;
    if (!resolvedRegistry?.complete) throw new Error('SocialFi registry is incomplete.');
    if (statusEnvelope?.meta?.source !== 'rpc-live') {
      throw new Error('Explorer /social/status did not identify its source as rpc-live.');
    }
    if (!resolvedStatus?.complete) throw new Error('One or more SocialFi state accounts are not healthy.');
    setRegistry(resolvedRegistry);
    setLiveStatus(resolvedStatus);
    return { registry: resolvedRegistry, status: resolvedStatus };
  }, [explorerApiUrl]);

  useEffect(() => {
    const target = ensureWallet();
    Promise.all([refreshStatus(), refreshBalance(target)]).catch((error) => {
      updateStep('readiness', 'fail', error.message);
    });
  }, [ensureWallet, refreshBalance, refreshStatus, updateStep]);

  async function ensureFunded(target) {
    const current = await refreshBalance(target);
    if (current >= MIN_FEE_BALANCE) return current;
    updateStep('fund', 'running', 'Requesting 1 testnet AEKO for transaction fees.');
    const signature = await requestAirdrop(rpcUrl, target.address, aekoToLamports(1));
    await confirmSignature(rpcUrl, signature);
    const funded = await refreshBalance(target);
    if (funded <= current) throw new Error('Airdrop confirmed but wallet balance did not increase.');
    updateStep('fund', 'pass', `Wallet funded: ${formatAeko(funded)}`, signature);
    return funded;
  }

  async function runPost(target, resolvedRegistry) {
    updateStep('post', 'running', 'Submitting signed AnchorPost.');
    const recentBlockhash = await getLatestBlockhash(rpcUrl);
    const built = await buildSocialPostTestTx({
      wallet: target,
      postsState: resolvedRegistry.posts,
      antiSpamState: resolvedRegistry.antiSpam,
      recentBlockhash,
      contentUri: `https://aeko.social/test/${Date.now()}`,
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const indexed = await pollUntil(
      () => fetchExplorer(explorerApiUrl, `/posts/${built.id}`),
      (envelope) => envelope?.data?.postId === built.id,
      'Post confirmed on-chain but Explorer did not index it within 30 seconds.',
    );
    const result = { id: built.id, creator: target.address, signature, indexed: indexed.data };
    setLastPost(result);
    updateStep('post', 'pass', 'Signed post confirmed and observed through Explorer indexer.', signature);
    return result;
  }

  async function runLike(target, resolvedRegistry, post) {
    if (!post) throw new Error('Create an indexed post before testing engagement.');
    updateStep('like', 'running', 'Submitting signed Like engagement.');
    const recentBlockhash = await getLatestBlockhash(rpcUrl);
    const built = buildSocialLikeTestTx({
      wallet: target,
      postsState: resolvedRegistry.posts,
      antiSpamState: resolvedRegistry.antiSpam,
      recentBlockhash,
      postIdHex: post.id,
      targetCreator: post.creator,
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const indexed = await pollUntil(
      () => fetchExplorer(
        explorerApiUrl,
        `/engagement?postId=${encodeURIComponent(post.id)}&actor=${encodeURIComponent(target.address)}&limit=50`,
      ),
      (envelope) => Array.isArray(envelope?.data)
        && envelope.data.some((event) => event.proofId === built.id && Number(event.slot) > 0),
      'Like confirmed on-chain but Explorer did not index a chain-stamped engagement slot.',
    );
    const event = indexed.data.find((entry) => entry.proofId === built.id);
    updateStep(
      'like',
      'pass',
      `Like indexed with canonical chain slot ${event.slot}.`,
      signature,
    );
    return { id: built.id, signature, indexed: event };
  }

  async function runStake(target, resolvedRegistry) {
    updateStep('stake', 'running', 'Opening a Social Staking position record.');
    const [recentBlockhash, epochInfo] = await Promise.all([
      getLatestBlockhash(rpcUrl),
      getEpochInfo(rpcUrl),
    ]);
    const built = buildSocialStakeTestTx({
      wallet: target,
      stakingState: resolvedRegistry.staking,
      recentBlockhash,
      creator: target.address,
      amount: 1,
      currentEpoch: Number(epochInfo?.epoch || 0),
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const indexed = await pollUntil(
      () => fetchExplorer(explorerApiUrl, `/stakes?staker=${encodeURIComponent(target.address)}&limit=100`),
      (envelope) => Array.isArray(envelope?.data)
        && envelope.data.some((position) => position.positionId === built.id),
      'Stake position confirmed on-chain but Explorer did not index it.',
    );
    const position = indexed.data.find((entry) => entry.positionId === built.id);
    updateStep(
      'stake',
      'pass',
      'Stake position state is indexed. Current protocol does not escrow the recorded amount.',
      signature,
    );
    return { id: built.id, signature, indexed: position };
  }

  async function runTip(target, resolvedRegistry) {
    updateStep('tip', 'running', 'Recording a Social Monetization creator-tip entry.');
    const before = await fetchExplorer(explorerApiUrl, '/social/status');
    const beforeCount = Number(before?.data?.domains?.monetization?.metrics?.tips || 0);
    const recentBlockhash = await getLatestBlockhash(rpcUrl);
    const built = buildSocialTipTestTx({
      wallet: target,
      monetizationState: resolvedRegistry.monetization,
      recentBlockhash,
      creator: target.address,
      amount: 1,
    });
    const signature = await sendTransaction(rpcUrl, built.transaction);
    await confirmSignature(rpcUrl, signature);
    const observed = await pollUntil(
      () => fetchExplorer(explorerApiUrl, '/social/status'),
      (envelope) => Number(envelope?.data?.domains?.monetization?.metrics?.tips || 0) > beforeCount,
      'Tip record confirmed on-chain but Explorer live SocialFi status did not observe it.',
    );
    setLiveStatus(observed.data);
    updateStep(
      'tip',
      'pass',
      'Monetization tip accounting is visible on-chain. Current protocol does not debit the sender for this record.',
      signature,
    );
    return { id: built.id, signature };
  }

  async function runRewardsRead(target) {
    updateStep('rewards', 'running', 'Reading indexed creator rewards.');
    const envelope = await fetchExplorer(
      explorerApiUrl,
      `/rewards?creator=${encodeURIComponent(target.address)}&limit=50`,
    );
    if (envelope?.meta?.source !== 'indexer' || !Array.isArray(envelope?.data)) {
      throw new Error('Explorer rewards endpoint did not return the indexed response contract.');
    }
    updateStep(
      'rewards',
      'pass',
      `Rewards read path is indexed (${envelope.data.length} creator reward record(s)).`,
    );
    return envelope.data;
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
    updateStep('full', 'running', 'Running user-safe SocialFi flow end to end.');
    try {
      const target = wallet || ensureWallet();
      const readiness = await refreshStatus();
      await ensureFunded(target);
      const post = await runPost(target, readiness.registry);
      await runLike(target, readiness.registry, post);
      await runStake(target, readiness.registry);
      await runTip(target, readiness.registry);
      await runRewardsRead(target);
      await refreshStatus();
      updateStep(
        'full',
        'pass',
        'Post + engagement + stake-state + monetization-accounting + rewards-read flow passed through RPC and Explorer.',
      );
    } catch (error) {
      updateStep('full', 'fail', error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  const domains = liveStatus?.domains || {};

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
        <div>
          <div className="text-sm font-medium text-aeko-accent mb-2">Explorer acceptance lab</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Aeko SocialFi E2E Test</h1>
          <p className="text-lg text-gray-400 max-w-3xl">
            Exercise signed SocialFi transactions through the public RPC, then require the Explorer
            read layer to observe the resulting state before a step can pass.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={runFullFlow}
          className="inline-flex items-center justify-center gap-2 min-h-[46px] rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black disabled:opacity-50"
        >
          <Sparkles size={17} /> Run full user-safe flow
        </button>
      </div>

      <div className="mb-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 flex gap-3">
        <AlertTriangle size={20} className="text-amber-300 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/90">
          <div className="font-semibold mb-1">Testnet keys and protocol boundary</div>
          <p>
            Test wallets are stored unencrypted in this browser&apos;s localStorage. Never fund them with
            real value. Staking currently records position amounts without escrow, and monetization tip
            actions record creator accounting without debiting the sender. Those steps test the code that
            exists; they are not presented as completed economic settlement.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={18} className="text-aeko-accent" />
            <h2 className="font-semibold">Test wallet</h2>
          </div>
          <select
            value={wallet?.id || ''}
            onChange={(event) => setWalletId(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            {wallets.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {shortAddress(entry.address)}</option>
            ))}
          </select>
          <div className="mt-3 font-mono text-xs text-gray-400 break-all">{wallet?.address}</div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-400">Balance</span>
            <span>{balance == null ? '—' : formatAeko(balance)}</span>
          </div>
          <button
            type="button"
            disabled={busy || !wallet}
            onClick={() => runAction('fund', async (target) => ensureFunded(target))}
            className="mt-4 w-full rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            Ensure fee balance
          </button>
          <div className="mt-4 text-xs text-gray-500 break-all">RPC: {rpcUrl}</div>
          <div className="mt-1 text-xs text-gray-500 break-all">Explorer API: {explorerApiUrl}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-aeko-accent" />
              <h2 className="font-semibold">All-five live state verification</h2>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('readiness', async () => refreshStatus())}
              className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <DomainCard name="Social Posts + Engagement" status={domains.posts} />
            <DomainCard name="Social Rewards" status={domains.rewards} />
            <DomainCard name="Social Staking" status={domains.staking} />
            <DomainCard name="Social Anti-Spam" status={domains.antiSpam} />
            <DomainCard name="Social Monetization" status={domains.monetization} />
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Source: Explorer <code>/social/status</code> → live chain RPC. Registry complete: {String(Boolean(registry?.complete))}.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <ActionCard
          icon={Send}
          title="1. Post"
          description="Sign AnchorPost, confirm it, then require /posts/:id to return the indexed post."
          state={steps.post}
          disabled={busy}
          onClick={() => runAction('post', async (target, resolved) => runPost(target, resolved))}
        />
        <ActionCard
          icon={Heart}
          title="2. Like"
          description="Sign engagement against the last post and require Explorer to return a non-zero chain-stamped slot."
          state={steps.like}
          disabled={busy || !lastPost}
          onClick={() => runAction('like', async (target, resolved) => runLike(target, resolved, lastPost))}
        />
        <ActionCard
          icon={ShieldCheck}
          title="3. Stake state"
          description="Open a staking position record and require /stakes to index the exact position id. No escrow is claimed."
          state={steps.stake}
          disabled={busy}
          onClick={() => runAction('stake', async (target, resolved) => runStake(target, resolved))}
        />
        <ActionCard
          icon={CircleDollarSign}
          title="4. Tip accounting"
          description="Record a creator-tip entry and require live monetization metrics to increase. No sender debit is claimed."
          state={steps.tip}
          disabled={busy}
          onClick={() => runAction('tip', async (target, resolved) => runTip(target, resolved))}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Acceptance evidence</h2>
            <p className="text-xs text-gray-500 mt-1">A PASS is only recorded after the relevant chain/Explorer observation succeeds.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction('rewards', async (target) => runRewardsRead(target))}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
          >
            Verify rewards read
          </button>
        </div>
        <div className="divide-y divide-white/10">
          {[
            ['full', 'Full user-safe flow'],
            ['fund', 'Wallet funding / fee readiness'],
            ['post', 'Signed post → Explorer indexer'],
            ['like', 'Signed Like → canonical slot → Explorer'],
            ['stake', 'Stake position state → Explorer'],
            ['tip', 'Monetization accounting → live Explorer status'],
            ['rewards', 'Rewards indexed read contract'],
            ['readiness', 'All-five state readiness'],
          ].map(([key, label]) => (
            <div key={key} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[220px_100px_1fr] gap-2 md:gap-4 items-start">
              <div className="text-sm text-gray-200">{label}</div>
              <StepState state={steps[key]} />
              <div>
                <div className="text-sm text-gray-400">{steps[key]?.message || 'Not run yet.'}</div>
                {steps[key]?.detail && <div className="mt-1 font-mono text-[11px] text-gray-600 break-all">{steps[key].detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, state, disabled, onClick }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col">
      <div className="w-9 h-9 rounded-lg border border-aeko-accent/25 bg-aeko-accent/10 flex items-center justify-center mb-4">
        <Icon size={17} className="text-aeko-accent" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-gray-400 flex-1">{description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <StepState state={state} />
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
        >
          Run
        </button>
      </div>
    </div>
  );
}
