import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  PenSquare,
  RefreshCcw,
  Send,
  Snowflake,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  aekoToLamports,
  confirmSignature,
  formatAeko,
  getAccountInfo,
  getBalance,
  getLatestBlockhash,
  requestAirdrop,
  sendTransaction,
} from '../utils/aekoRpcClient';
import {
  decodeCollectionAccount,
  decodeTokenAccount,
  fetchMinimumBalanceForRentExemption,
  validateProgramOwner,
} from '../utils/nftAccountDecoder';
import { signPreparedTransactionWithTestWallet } from '../utils/aekoPreparedTransaction';
import { loadWallets, shortAddress } from '../utils/aekoTestKeypair';
import {
  buildPreparedCollectionSetupTransaction,
  buildPreparedMintWithAccountSetupTransaction,
  buildPreparedToken721Transaction,
  deriveToken721AddressWithSeed,
  estimateCollectionAccountSpace,
  estimateTokenAccountSpace,
} from '../utils/nftTransactionBuilder';
import { fetchConsoleApi } from '../utils/testConsoleApi';

const INDEX_ATTEMPTS = 20;
const INDEX_INTERVAL_MS = 1_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateSeed(seed, label) {
  const bytes = new TextEncoder().encode(seed.trim());
  if (bytes.length === 0) throw new Error(`${label} is required.`);
  if (bytes.length > 32) throw new Error(`${label} must be 32 UTF-8 bytes or fewer for CreateAccountWithSeed.`);
}

function validateMetadata(name, uri) {
  const normalizedName = name.trim();
  const normalizedUri = uri.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('NFT name must contain 1 to 100 characters.');
  }
  if (
    !normalizedUri
    || normalizedUri.length > 256
    || !/^(https?:\/\/|ipfs:\/\/|ar:\/\/)/i.test(normalizedUri)
  ) {
    throw new Error('Metadata URI must be a valid http(s), ipfs://, or ar:// URI up to 256 characters.');
  }
}

async function readLiveState(rpcUrl, collectionAddress, tokenAddress) {
  const [collectionInfo, tokenInfo] = await Promise.all([
    collectionAddress ? getAccountInfo(rpcUrl, collectionAddress) : null,
    tokenAddress ? getAccountInfo(rpcUrl, tokenAddress) : null,
  ]);
  return {
    collection: collectionInfo ? decodeCollectionAccount(collectionInfo.data[0]) : null,
    token: tokenInfo ? decodeTokenAccount(tokenInfo.data[0]) : null,
    collectionOwner: collectionInfo ? validateProgramOwner(collectionInfo.owner) : null,
    tokenOwner: tokenInfo ? validateProgramOwner(tokenInfo.owner) : null,
  };
}

async function waitForIndexedNft(explorerApiUrl, tokenAddress, accept = (nft) => Boolean(nft)) {
  if (!explorerApiUrl || !tokenAddress) return null;
  for (let attempt = 0; attempt < INDEX_ATTEMPTS; attempt += 1) {
    try {
      const nft = await fetchConsoleApi(explorerApiUrl, `/nfts/${encodeURIComponent(tokenAddress)}`);
      if (nft && accept(nft)) return nft;
    } catch (indexError) {
      if (indexError?.status !== 404) throw indexError;
      // A 404 can legitimately mean the asset projection trails the confirmed transaction.
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(INDEX_INTERVAL_MS);
  }
  return null;
}

function StatusBadge({ children, tone = 'neutral' }) {
  const cls = tone === 'good'
    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
      : 'border-white/10 bg-white/[0.04] text-gray-400';
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}>{children}</span>;
}

function LiveMetric({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">{label}</div><div className="mt-1 break-all text-sm font-semibold text-white">{value ?? '—'}</div></div>;
}

export default function NftLiveFlow({ rpcUrl, explorerApiUrl, onUseAccounts }) {
  const [wallets, setWallets] = useState(() => loadWallets());
  const [walletId, setWalletId] = useState(() => loadWallets()[0]?.id || '');
  const wallet = wallets.find((item) => item.id === walletId) || wallets[0] || null;
  const [balance, setBalance] = useState(null);
  const [collectionSeed, setCollectionSeed] = useState('aeko-live-collection');
  const [tokenSeed, setTokenSeed] = useState(() => `aeko-live-${Date.now().toString(36)}`);
  const [collectionName, setCollectionName] = useState('AEKO Live Collection');
  const [collectionSymbol, setCollectionSymbol] = useState('ALIVE');
  const [metadataName, setMetadataName] = useState('AEKO Live NFT');
  const [metadataUri, setMetadataUri] = useState('https://aeko.online/nft-demo');
  const [recipient, setRecipient] = useState('');
  const [addresses, setAddresses] = useState({ collection: '', token: '' });
  const [live, setLive] = useState({ collection: null, token: null, collectionOwner: null, tokenOwner: null });
  const [indexRecord, setIndexRecord] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastSignature, setLastSignature] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [log, setLog] = useState([
    'Select a funded browser-local test wallet, then create or load a real AEKO-721 collection and NFT.',
  ]);

  const appendLog = useCallback((message) => {
    setLog((current) => [message, ...current].slice(0, 8));
  }, []);

  const refreshWallets = () => {
    const next = loadWallets();
    setWallets(next);
    if (!next.some((item) => item.id === walletId)) setWalletId(next[0]?.id || '');
  };

  const refreshBalance = useCallback(async () => {
    if (!wallet) {
      setBalance(null);
      return 0;
    }
    const next = await getBalance(rpcUrl, wallet.address);
    setBalance(next);
    return next;
  }, [rpcUrl, wallet]);

  const refreshLive = useCallback(async (collectionAddress = addresses.collection, tokenAddress = addresses.token) => {
    if (!collectionAddress && !tokenAddress) return null;
    const next = await readLiveState(rpcUrl, collectionAddress, tokenAddress);
    setLive(next);
    if (collectionAddress && tokenAddress) onUseAccounts?.({ collectionAddress, tokenAddress });
    return next;
  }, [addresses.collection, addresses.token, onUseAccounts, rpcUrl]);

  useEffect(() => {
    if (!wallet) return;
    void refreshBalance().catch(() => setBalance(null));
    const other = wallets.find((item) => item.address !== wallet.address);
    if (other && !recipient) setRecipient(other.address);
  }, [recipient, refreshBalance, wallet, wallets]);

  const ensureFunded = async () => {
    if (!wallet) throw new Error('Create or select a browser-local test wallet in Network Tools first.');
    const current = await refreshBalance();
    if (current <= 0) throw new Error('This test wallet is not funded on-chain yet. Request test AEKO before creating or updating NFTs.');
    return current;
  };

  const submitPrepared = async (prepared, label) => {
    if (!wallet) throw new Error('Select a browser-local test wallet first.');
    const signed = signPreparedTransactionWithTestWallet(wallet, prepared);
    const signature = await sendTransaction(rpcUrl, signed);
    await confirmSignature(rpcUrl, signature);
    setLastSignature(signature);
    appendLog(`${label} confirmed on-chain: ${shortAddress(signature)}`);
    await refreshBalance();
    return signature;
  };

  const fundWallet = async () => {
    if (!wallet || busy) return;
    setBusy('fund');
    setError('');
    try {
      const signature = await requestAirdrop(rpcUrl, wallet.address, aekoToLamports(2));
      await confirmSignature(rpcUrl, signature);
      const next = await refreshBalance();
      setLastSignature(signature);
      appendLog(`Airdrop confirmed. Wallet balance is now ${formatAeko(next)}.`);
    } catch (fundError) {
      setError(fundError.message || String(fundError));
    } finally {
      setBusy('');
    }
  };

  const createOrLoad = async () => {
    if (!wallet || busy) return;
    setBusy('create');
    setError('');
    setIndexRecord(null);
    try {
      const currentBalance = await ensureFunded();
      validateSeed(collectionSeed, 'Collection seed');
      validateSeed(tokenSeed, 'Token seed');
      validateMetadata(metadataName, metadataUri);
      const authority = wallet.address;
      const collectionAddress = await deriveToken721AddressWithSeed(authority, collectionSeed.trim());
      const tokenAddress = await deriveToken721AddressWithSeed(authority, tokenSeed.trim());
      setAddresses({ collection: collectionAddress, token: tokenAddress });
      onUseAccounts?.({ collectionAddress, tokenAddress });

      const existingCollection = await getAccountInfo(rpcUrl, collectionAddress);
      const existingToken = await getAccountInfo(rpcUrl, tokenAddress);
      const createdToken = !existingToken;

      if (existingCollection) {
        if (!validateProgramOwner(existingCollection.owner).matches) {
          throw new Error('The derived collection address exists but is not owned by the AEKO-721 program.');
        }
        const decodedCollection = decodeCollectionAccount(existingCollection.data[0]);
        if (!decodedCollection.isInitialized || decodedCollection.authority !== authority) {
          throw new Error('The derived collection account is not an initialized collection controlled by the selected wallet.');
        }
      }

      if (existingToken) {
        if (!validateProgramOwner(existingToken.owner).matches) {
          throw new Error('The derived token address exists but is not owned by the AEKO-721 program.');
        }
        const decodedToken = decodeTokenAccount(existingToken.data[0]);
        if (!decodedToken.isInitialized || decodedToken.collection !== collectionAddress) {
          throw new Error('The derived token account does not belong to the selected AEKO-721 collection.');
        }
      }

      const metadata = {
        name: metadataName.trim(),
        description: 'Minted from the live AEKO-721 explorer workflow.',
        uri: metadataUri.trim(),
        imageUri: null,
        attributes: [{ traitType: 'surface', value: 'nft-live-flow' }],
      };

      let requiredLamports = 0;
      let collectionSpace = 0;
      let tokenSpace = 0;
      let collectionLamports = 0;
      let tokenLamports = 0;

      if (!existingCollection) {
        collectionSpace = estimateCollectionAccountSpace({
          name: collectionName.trim(),
          symbol: collectionSymbol.trim(),
          baseUri: 'https://aeko.online/nft-demo',
        });
        collectionLamports = await fetchMinimumBalanceForRentExemption(rpcUrl, collectionSpace);
        requiredLamports += collectionLamports;
      }

      if (!existingToken) {
        tokenSpace = estimateTokenAccountSpace({ metadata });
        tokenLamports = await fetchMinimumBalanceForRentExemption(rpcUrl, tokenSpace);
        requiredLamports += tokenLamports;
      }

      if (requiredLamports > 0 && currentBalance <= requiredLamports) {
        throw new Error(`The selected wallet needs more test AEKO for rent and fees. Required rent is about ${formatAeko(requiredLamports)} before transaction fees.`);
      }

      if (!existingCollection) {
        const blockhash = await getLatestBlockhash(rpcUrl);
        const prepared = buildPreparedCollectionSetupTransaction({
          payer: authority,
          recentBlockhash: blockhash,
          base: authority,
          collectionAddress,
          collectionSeed: collectionSeed.trim(),
          lamports: collectionLamports,
          space: collectionSpace,
          authority,
          name: collectionName.trim(),
          symbol: collectionSymbol.trim(),
          baseUri: 'https://aeko.online/nft-demo',
        });
        await submitPrepared(prepared, 'Collection initialization');
      } else {
        appendLog('Existing collection account found. Reusing its live on-chain state.');
      }

      if (!existingToken) {
        const blockhash = await getLatestBlockhash(rpcUrl);
        const prepared = buildPreparedMintWithAccountSetupTransaction({
          payer: authority,
          recentBlockhash: blockhash,
          base: authority,
          tokenAddress,
          tokenSeed: tokenSeed.trim(),
          lamports: tokenLamports,
          space: tokenSpace,
          collection: collectionAddress,
          authority,
          owner: authority,
          tokenId: Date.now(),
          royaltyBps: 500,
          metadata,
        });
        await submitPrepared(prepared, 'NFT mint');
      } else {
        appendLog('Existing token account found. Loading it instead of attempting a duplicate mint.');
      }

      const nextLive = await refreshLive(collectionAddress, tokenAddress);
      if (!nextLive?.token) throw new Error('The transaction path completed but the NFT token account could not be read back from RPC.');

      const indexed = await waitForIndexedNft(explorerApiUrl, tokenAddress);
      setIndexRecord(indexed);
      setLastAction(createdToken ? 'mint' : 'load');
      appendLog(indexed
        ? 'Explorer PostgreSQL projection observed the NFT.'
        : 'NFT is confirmed on-chain. Explorer indexing is still catching up.');
    } catch (createError) {
      setError(createError.message || String(createError));
    } finally {
      setBusy('');
    }
  };

  const runLifecycleAction = async (action) => {
    if (!wallet || !addresses.token || busy) return;
    setBusy(action);
    setError('');
    try {
      await ensureFunded();
      if (action === 'update') validateMetadata(metadataName, metadataUri);
      const current = await refreshLive();
      const token = current?.token;
      if (!token) throw new Error('Load or mint a live NFT before running lifecycle actions.');

      if ((action === 'freeze' || action === 'thaw') && token.creator !== wallet.address) {
        throw new Error('Freeze/thaw requires the NFT creator wallet.');
      }
      if (action === 'transfer' && token.owner !== wallet.address) {
        throw new Error('Transfer requires the current NFT owner wallet.');
      }
      if (action === 'update' && token.creator !== wallet.address && token.owner !== wallet.address) {
        throw new Error('Metadata updates require the creator or current owner wallet.');
      }
      if (action === 'transfer' && !recipient.trim()) {
        throw new Error('Enter a recipient wallet address before transferring.');
      }

      const blockhash = await getLatestBlockhash(rpcUrl);
      const prepared = buildPreparedToken721Transaction({
        payer: wallet.address,
        recentBlockhash: blockhash,
        action,
        collection: addresses.collection,
        token: addresses.token,
        authority: wallet.address,
        owner: wallet.address,
        recipient: recipient.trim(),
        tokenId: Number(token.tokenId),
        royaltyBps: Number(token.royaltyBps),
        metadata: {
          name: metadataName.trim(),
          description: token.metadata?.description || null,
          uri: metadataUri.trim(),
          imageUri: token.metadata?.imageUri || null,
          attributes: token.metadata?.attributes || [],
        },
      });
      const label = action === 'freeze' ? 'Freeze'
        : action === 'thaw' ? 'Thaw'
          : action === 'transfer' ? 'Transfer'
            : 'Metadata update';
      await submitPrepared(prepared, label);
      const nextLive = await refreshLive();

      const indexed = await waitForIndexedNft(explorerApiUrl, addresses.token, (nft) => {
        if (action === 'freeze') return nft.frozen === true;
        if (action === 'thaw') return nft.frozen === false;
        if (action === 'transfer') return nft.owner === recipient.trim();
        if (action === 'update') return nft.metadataUri === metadataUri.trim();
        return true;
      });
      setIndexRecord(indexed);
      setLastAction(action);
      appendLog(indexed
        ? `${label} is visible through the Explorer indexer.`
        : `${label} is confirmed on-chain; Explorer indexing is still catching up.`);
      if (!nextLive?.token) throw new Error('Action confirmed, but RPC readback did not return the NFT account.');
    } catch (actionError) {
      setError(actionError.message || String(actionError));
    } finally {
      setBusy('');
    }
  };

  const isFunded = Number(balance) > 0;
  const liveToken = live.token;
  const selectedIsCreator = Boolean(liveToken && wallet && liveToken.creator === wallet.address);
  const selectedIsOwner = Boolean(liveToken && wallet && liveToken.owner === wallet.address);
  const selectedCanUpdate = selectedIsCreator || selectedIsOwner;

  return (
    <section className="mb-20 overflow-hidden rounded-3xl border border-aeko-accent/20 bg-gradient-to-br from-aeko-accent/[0.08] via-white/[0.025] to-transparent">
      <div className="border-b border-white/10 p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-aeko-accent"><Sparkles size={14}/> Live end-to-end flow</div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Mint and operate a real AEKO-721 NFT</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">This flow uses the same browser-local test wallets as Network Tools. Every action is signed, submitted to the configured AEKO RPC, confirmed, read back from the token account, and then checked against the Explorer indexer.</p>
          </div>
          <StatusBadge tone={liveToken && indexRecord ? 'good' : liveToken ? 'warn' : 'neutral'}>
            {liveToken && indexRecord ? 'chain + explorer verified' : liveToken ? 'chain verified' : 'not minted'}
          </StatusBadge>
        </div>
      </div>

      <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Wallet size={15} className="text-aeko-accent"/> Test wallet</div>
            {wallets.length ? (
              <>
                <div className="mt-3 flex gap-2">
                  <select value={wallet?.id || ''} onChange={(event) => setWalletId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101018] px-3 text-xs text-white">
                    {wallets.map((item) => <option key={item.id} value={item.id}>{item.name} · {shortAddress(item.address)}</option>)}
                  </select>
                  <button type="button" onClick={refreshWallets} className="h-10 rounded-xl border border-white/10 px-3 text-xs text-gray-300 hover:bg-white/5">Refresh</button>
                </div>
                <div className="mt-3 break-all font-mono text-[10px] text-gray-600">{wallet?.address}</div>
                <div className="mt-3 flex items-center justify-between text-xs"><span className="text-gray-500">Live balance</span><span className={isFunded ? 'text-white' : 'text-amber-200'}>{balance == null ? 'Checking…' : isFunded ? formatAeko(balance) : 'Not funded'}</span></div>
                <button type="button" onClick={fundWallet} disabled={Boolean(busy)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-aeko-accent/30 bg-aeko-accent/10 text-xs font-semibold text-aeko-accent disabled:opacity-40">{busy === 'fund' ? <Loader2 size={12} className="animate-spin"/> : null} Request 2 test AEKO</button>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">No browser-local test wallet exists yet. Create one in Network Tools → Accounts, then <button type="button" onClick={refreshWallets} className="font-semibold underline underline-offset-2">refresh wallets</button>.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold text-white">Deterministic accounts</div>
            <label className="mt-3 block text-[11px] text-gray-500">Collection seed<input value={collectionSeed} onChange={(event)=>setCollectionSeed(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white"/></label>
            <label className="mt-3 block text-[11px] text-gray-500">Token seed<input value={tokenSeed} onChange={(event)=>setTokenSeed(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white"/></label>
            <button type="button" onClick={createOrLoad} disabled={!wallet || !isFunded || Boolean(busy)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-aeko-accent px-4 text-xs font-semibold text-black disabled:opacity-40">{busy === 'create' ? <Loader2 size={13} className="animate-spin"/> : <Database size={13}/>} Create or load live NFT</button>
          </div>
        </aside>

        <div className="space-y-5">
          {error ? <div className="flex gap-3 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100"><AlertTriangle className="mt-0.5 shrink-0" size={17}/><span>{error}</span></div> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <LiveMetric label="Collection" value={addresses.collection ? shortAddress(addresses.collection) : 'Not derived'} />
            <LiveMetric label="Token" value={addresses.token ? shortAddress(addresses.token) : 'Not derived'} />
            <LiveMetric label="Owner" value={liveToken ? shortAddress(liveToken.owner) : 'Not minted'} />
            <LiveMetric label="State" value={liveToken ? (liveToken.frozen ? 'Frozen' : 'Active') : 'Not minted'} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-gray-500">NFT name<input value={metadataName} onChange={(event)=>setMetadataName(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white"/></label>
              <label className="text-[11px] text-gray-500">Metadata URI<input value={metadataUri} onChange={(event)=>setMetadataUri(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white"/></label>
              <label className="text-[11px] text-gray-500">Collection name<input value={collectionName} onChange={(event)=>setCollectionName(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white"/></label>
              <label className="text-[11px] text-gray-500">Collection symbol<input value={collectionSymbol} onChange={(event)=>setCollectionSymbol(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-white"/></label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!liveToken || !selectedIsCreator || liveToken.frozen || Boolean(busy)} onClick={()=>runLifecycleAction('freeze')} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/20 px-3 text-xs text-cyan-200 disabled:opacity-35"><Snowflake size={13}/> Freeze</button>
              <button type="button" disabled={!liveToken?.frozen || !selectedIsCreator || Boolean(busy)} onClick={()=>runLifecycleAction('thaw')} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-200 disabled:opacity-35"><RefreshCcw size={13}/> Thaw</button>
              <button type="button" disabled={!liveToken || !selectedCanUpdate || liveToken.frozen || Boolean(busy)} onClick={()=>runLifecycleAction('update')} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-200 disabled:opacity-35"><PenSquare size={13}/> Update metadata</button>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={recipient} onChange={(event)=>setRecipient(event.target.value)} placeholder="Recipient address for transfer" className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-xs text-white"/>
              <button type="button" disabled={!liveToken || !selectedIsOwner || liveToken.frozen || !recipient.trim() || Boolean(busy)} onClick={()=>runLifecycleAction('transfer')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-35"><Send size={13}/> Transfer</button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-white">RPC readback</div>{liveToken ? <CheckCircle2 size={16} className="text-emerald-300"/> : null}</div>
              <div className="mt-3 space-y-2 text-xs text-gray-500">
                <div>Collection owner: <span className="text-gray-300">{live.collectionOwner?.matches ? 'AEKO-721 verified' : live.collection ? 'Owner mismatch' : '—'}</span></div>
                <div>Token owner: <span className="text-gray-300">{live.tokenOwner?.matches ? 'AEKO-721 verified' : live.token ? 'Owner mismatch' : '—'}</span></div>
                <div>Creator: <span className="font-mono text-gray-300">{liveToken ? shortAddress(liveToken.creator) : '—'}</span></div>
                <div>Metadata: <span className="text-gray-300">{liveToken?.metadata?.name || '—'}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-white">Explorer projection</div>{indexRecord ? <CheckCircle2 size={16} className="text-emerald-300"/> : null}</div>
              <div className="mt-3 text-xs leading-relaxed text-gray-500">{indexRecord ? <>Indexed owner <span className="font-mono text-gray-300">{shortAddress(indexRecord.owner)}</span> · frozen <span className="text-gray-300">{String(indexRecord.frozen)}</span> · slot <span className="text-gray-300">{indexRecord.lastSeenSlot ?? '—'}</span></> : liveToken ? 'The NFT is confirmed on-chain; the indexer has not returned the matching record yet.' : 'Mint a live NFT to verify its durable Explorer projection.'}</div>
            </div>
          </div>

          {lastSignature ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">Last confirmed transaction: <span className="font-mono">{lastSignature}</span></div> : null}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold text-white">Live event log</div>
            <div className="mt-3 space-y-2">{log.map((entry, index)=><div key={`${entry}-${index}`} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-gray-400">{entry}</div>)}</div>
            {lastAction ? <div className="mt-3 text-[10px] uppercase tracking-[0.12em] text-aeko-accent">Last lifecycle action: {lastAction}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
