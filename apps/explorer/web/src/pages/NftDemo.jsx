import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  GalleryVerticalEnd,
  Shield,
  RefreshCcw,
  PenSquare,
  ArrowRight,
  Sparkles,
  Play,
  Snowflake,
  Send,
  ScrollText,
  Database,
  Radio,
  FileCode2,
  Wallet,
} from 'lucide-react';
import {
  DEFAULT_RPC_ENDPOINT,
  decodeCollectionAccount,
  decodeTokenAccount,
  fetchAccountInfo,
  fetchLatestBlockhash,
  fetchMinimumBalanceForRentExemption,
  fetchSignatureStatus,
  sendSignedTransaction,
  validateProgramOwner,
} from '../utils/nftAccountDecoder';
import {
  connectInjectedAekoWallet,
  detectInjectedAekoWalletAdapter,
  disconnectInjectedAekoWallet,
  listInjectedAekoWalletAdapters,
  signWithInjectedAekoWallet,
  signAndSendPreparedTransaction,
} from '../utils/aekoWallet';
import {
  buildPreparedCollectionSetupTransaction,
  buildPreparedMintWithAccountSetupTransaction,
  buildPreparedToken721Transaction,
  deriveToken721AddressWithSeed,
  estimateCollectionAccountSpace,
  estimateTokenAccountSpace,
  token721ProgramId,
} from '../utils/nftTransactionBuilder';
import { nftDemoExamples } from '../data/nftDemoExamples';

const StepCard = ({ step, title, description, details, active }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className={`rounded-2xl p-6 border transition-colors ${
      active ? 'bg-aeko-accent/10 border-aeko-accent/30' : 'bg-white/5 border-white/10'
    }`}
  >
    <div className="flex items-center justify-between mb-4">
      <span className="text-xs uppercase tracking-[0.2em] text-aeko-accent">Step {step}</span>
      <div className="w-10 h-10 rounded-full bg-aeko-accent/10 border border-aeko-accent/20 flex items-center justify-center text-aeko-accent font-bold">
        {step}
      </div>
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-gray-400 text-sm leading-relaxed mb-4">{description}</p>
    <div className="space-y-2">
      {details.map((detail) => (
        <div key={detail} className="text-sm text-gray-300 flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-aeko-accent mt-2" />
          <span>{detail}</span>
        </div>
      ))}
    </div>
  </motion.div>
);

const ControlCard = ({ icon: Icon, title, description }) => (
  <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
    <div className="w-12 h-12 rounded-xl bg-aeko-accent/10 border border-aeko-accent/20 flex items-center justify-center mb-4">
      <Icon className="text-aeko-accent" size={22} />
    </div>
    <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
    <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
  </div>
);

const ActionButton = ({ icon: Icon, label, onClick, disabled, tone = 'default' }) => {
  const tones = {
    default: 'bg-white/5 border-white/10 hover:bg-white/10',
    accent: 'bg-aeko-accent/10 border-aeko-accent/30 hover:bg-aeko-accent/20',
    warn: 'bg-cyan-500/10 border-cyan-400/30 hover:bg-cyan-500/20',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
        tones[tone]
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'text-white'}`}
    >
      <Icon size={16} className="text-aeko-accent" />
      <span>{label}</span>
    </button>
  );
};

const StatRow = ({ label, value, subtle }) => (
  <div className="flex justify-between gap-4 py-3 border-b border-white/5 last:border-b-0">
    <span className="text-sm text-gray-400">{label}</span>
    <span className={`text-sm text-right break-all ${subtle ? 'text-gray-300' : 'text-white font-medium'}`}>{value}</span>
  </div>
);

const initialLogs = [
  { id: 1, tone: 'text-aeko-accent', text: 'Demo ready. Collection is configured but the NFT has not been minted yet.' },
];

const defaultLiveRead = {
  rpcEndpoint: DEFAULT_RPC_ENDPOINT,
  collectionAddress: '',
  tokenAddress: '',
};

const defaultSetupForm = {
  baseAuthority: '',
  collectionSeed: 'aeko-genesis-collection',
  tokenSeed: 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
};

const actionOptions = [
  { value: 'mint', label: 'MintNft', signer: 'Collection authority' },
  { value: 'freeze', label: 'FreezeNft', signer: 'Creator authority' },
  { value: 'thaw', label: 'ThawNft', signer: 'Creator authority' },
  { value: 'transfer', label: 'TransferNft', signer: 'Current owner' },
  { value: 'update', label: 'UpdateMetadata', signer: 'Creator or owner' },
];

const ExampleCard = ({ example, onLoad }) => (
  <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
    <div className="flex items-center justify-between gap-4 mb-3">
      <h3 className="text-lg font-bold text-white">{example.label}</h3>
      <span
        className={`px-3 py-1 rounded-full text-xs uppercase tracking-[0.2em] ${
          example.status === 'live'
            ? 'bg-aeko-accent/10 text-aeko-accent border border-aeko-accent/20'
            : 'bg-amber-500/10 text-amber-200 border border-amber-500/20'
        }`}
      >
        {example.status}
      </span>
    </div>
    <p className="text-sm text-gray-400 mb-4">{example.description}</p>
    <div className="space-y-1 mb-5">
      <StatRow label="Collection" value={example.collectionAddress || 'Not published yet'} subtle />
      <StatRow label="Token" value={example.tokenAddress || 'Not published yet'} subtle />
      <StatRow label="RPC" value={example.rpcEndpoint} subtle />
    </div>
    <button
      onClick={() => onLoad(example)}
      className="inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors"
    >
      <Database size={16} className="text-aeko-accent" />
      Load Canonical Example
    </button>
  </div>
);

export default function NftDemo() {
  const [token, setToken] = useState({
    minted: false,
    frozen: false,
    owner: 'Wallet A',
    creator: 'Creator Authority',
    royaltyBps: 500,
    metadataName: 'Genesis Pass #1',
    metadataUri: 'ar://genesis-pass-1',
    transferCount: 0,
  });
  const [logs, setLogs] = useState(initialLogs);
  const [liveReadForm, setLiveReadForm] = useState(defaultLiveRead);
  const [liveReadState, setLiveReadState] = useState({
    loading: false,
    error: '',
    collection: null,
    token: null,
    collectionOwnerMatch: null,
    tokenOwnerMatch: null,
  });
  const [setupForm, setSetupForm] = useState(defaultSetupForm);
  const [setupState, setSetupState] = useState({
    loading: false,
    error: '',
    collectionAddress: '',
    tokenAddress: '',
    collectionSpace: 0,
    tokenSpace: 0,
    collectionLamports: 0,
    tokenLamports: 0,
    collectionTransactionBase64: '',
    mintTransactionBase64: '',
    blockhash: '',
  });
  const [writePlan, setWritePlan] = useState({
    action: 'mint',
    authority: '',
    owner: '',
    recipient: '',
    tokenId: '1',
    royaltyBps: '500',
    metadataName: 'Genesis Pass #1',
    metadataUri: 'ar://genesis-pass-1',
  });
  const [signedTransactionBase64, setSignedTransactionBase64] = useState('');
  const [submissionState, setSubmissionState] = useState({
    loading: false,
    error: '',
    signature: '',
    status: null,
  });
  const [preparedTransactionState, setPreparedTransactionState] = useState({
    loading: false,
    error: '',
    payer: '',
    blockhash: '',
    base64: '',
  });
  const [walletState, setWalletState] = useState(() => {
    const adapter = detectInjectedAekoWalletAdapter();
    return {
      adapter,
      adapters: listInjectedAekoWalletAdapters(),
      connected: false,
      address: '',
      error: '',
      loading: false,
      lastSignature: '',
      lastMessageSignature: '',
    };
  });

  const appendLog = (text, tone = 'text-gray-300') => {
    setLogs((current) => [{ id: current.length + 1, text, tone }, ...current]);
  };

  const handleMint = () => {
    if (token.minted) {
      appendLog('Mint rejected: this demo NFT has already been minted.', 'text-amber-300');
      return;
    }
    setToken((current) => ({ ...current, minted: true }));
    appendLog('Mint succeeded: Genesis Pass #1 was created with 500 bps creator royalty.', 'text-aeko-accent');
  };

  const handleFreeze = () => {
    if (!token.minted || token.frozen) {
      appendLog('Freeze rejected: NFT must exist and be unfrozen first.', 'text-amber-300');
      return;
    }
    setToken((current) => ({ ...current, frozen: true }));
    appendLog('Creator froze the NFT. Transfers and metadata edits are now blocked.', 'text-cyan-300');
  };

  const handleThaw = () => {
    if (!token.minted || !token.frozen) {
      appendLog('Thaw rejected: NFT is not currently frozen.', 'text-amber-300');
      return;
    }
    setToken((current) => ({ ...current, frozen: false }));
    appendLog('Creator thawed the NFT. Movement and edits are available again.', 'text-aeko-accent');
  };

  const handleTransfer = () => {
    if (!token.minted) {
      appendLog('Transfer rejected: NFT has not been minted yet.', 'text-amber-300');
      return;
    }
    if (token.frozen) {
      appendLog('Transfer rejected: frozen NFTs cannot move until thawed.', 'text-amber-300');
      return;
    }
    const nextOwner = token.owner === 'Wallet A' ? 'Wallet B' : 'Wallet A';
    setToken((current) => ({
      ...current,
      owner: nextOwner,
      transferCount: current.transferCount + 1,
    }));
    appendLog(`Transfer succeeded: ownership moved to ${nextOwner}.`, 'text-aeko-accent');
  };

  const handleMetadataUpdate = () => {
    if (!token.minted) {
      appendLog('Metadata update rejected: NFT has not been minted yet.', 'text-amber-300');
      return;
    }
    if (token.frozen) {
      appendLog('Metadata update rejected: frozen NFTs cannot be edited.', 'text-amber-300');
      return;
    }
    setToken((current) => ({
      ...current,
      metadataName: current.metadataName === 'Genesis Pass #1' ? 'Genesis Pass #1: Verified' : 'Genesis Pass #1',
      metadataUri: current.metadataUri === 'ar://genesis-pass-1' ? 'ar://genesis-pass-1-verified' : 'ar://genesis-pass-1',
    }));
    appendLog('Metadata update succeeded: creator refreshed the NFT name and URI within validation bounds.', 'text-aeko-accent');
  };

  const handleReset = () => {
    setToken({
      minted: false,
      frozen: false,
      owner: 'Wallet A',
      creator: 'Creator Authority',
      royaltyBps: 500,
      metadataName: 'Genesis Pass #1',
      metadataUri: 'ar://genesis-pass-1',
      transferCount: 0,
    });
    setLogs(initialLogs);
  };

  const handleLiveFieldChange = (field, value) => {
    setLiveReadForm((current) => ({ ...current, [field]: value }));
  };

  const handleWritePlanChange = (field, value) => {
    setWritePlan((current) => ({ ...current, [field]: value }));
  };

  const handleSetupFieldChange = (field, value) => {
    setSetupForm((current) => ({ ...current, [field]: value }));
  };

  const handleLoadCanonicalExample = (example) => {
    setLiveReadForm((current) => ({
      ...current,
      rpcEndpoint: example.rpcEndpoint,
      collectionAddress: example.collectionAddress,
      tokenAddress: example.tokenAddress,
    }));
    setSetupForm((current) => ({
      ...current,
      collectionSeed: example.collectionSeed,
      tokenSeed: example.tokenSeed,
      collectionName: example.collectionName,
      collectionSymbol: example.collectionSymbol,
      collectionBaseUri: example.collectionBaseUri,
    }));
    setWritePlan((current) => ({
      ...current,
      tokenId: example.tokenId,
      royaltyBps: example.royaltyBps,
      metadataName: example.metadataName,
      metadataUri: example.metadataUri,
    }));
  };

  const handleLoadLiveAccounts = async () => {
    if (!liveReadForm.collectionAddress.trim() || !liveReadForm.tokenAddress.trim()) {
      setLiveReadState((current) => ({
        ...current,
        error: 'Enter both a collection account and token account to load testnet-backed AEKO-721 data.',
      }));
      return;
    }

    setLiveReadState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const [collectionInfo, tokenInfo] = await Promise.all([
        fetchAccountInfo(liveReadForm.rpcEndpoint, liveReadForm.collectionAddress.trim()),
        fetchAccountInfo(liveReadForm.rpcEndpoint, liveReadForm.tokenAddress.trim()),
      ]);

      const collection = decodeCollectionAccount(collectionInfo.data[0]);
      const nft = decodeTokenAccount(tokenInfo.data[0]);
      const collectionOwnerMatch = validateProgramOwner(collectionInfo.owner);
      const tokenOwnerMatch = validateProgramOwner(tokenInfo.owner);

      setLiveReadState({
        loading: false,
        error: '',
        collection,
        token: nft,
        collectionOwnerMatch,
        tokenOwnerMatch,
      });
    } catch (error) {
      setLiveReadState({
        loading: false,
        error: error.message || 'Unable to load AEKO-721 accounts from the selected RPC endpoint.',
        collection: null,
        token: null,
        collectionOwnerMatch: null,
        tokenOwnerMatch: null,
      });
    }
  };

  const handleSubmitSignedTransaction = async () => {
    if (!signedTransactionBase64.trim()) {
      setSubmissionState({
        loading: false,
        error: 'Paste a signed base64 transaction before submitting.',
        signature: '',
        status: null,
      });
      return;
    }

    setSubmissionState({
      loading: true,
      error: '',
      signature: '',
      status: null,
    });

    try {
      const signature = await sendSignedTransaction(liveReadForm.rpcEndpoint, signedTransactionBase64.trim());
      const status = await fetchSignatureStatus(liveReadForm.rpcEndpoint, signature);
      setSubmissionState({
        loading: false,
        error: '',
        signature,
        status,
      });
    } catch (error) {
      setSubmissionState({
        loading: false,
        error: error.message || 'Signed transaction submission failed.',
        signature: '',
        status: null,
      });
    }
  };

  const handleConnectWallet = async () => {
    const adapter = detectInjectedAekoWalletAdapter();
    if (!adapter) {
      setWalletState({
        adapter: null,
        adapters: [],
        connected: false,
        address: '',
        error: 'No injected AEKO wallet was detected in this browser.',
        loading: false,
        lastSignature: '',
        lastMessageSignature: '',
      });
      return;
    }

    setWalletState((current) => ({
      ...current,
      adapter,
      adapters: listInjectedAekoWalletAdapters(),
      loading: true,
      error: '',
    }));

    try {
      const address = await connectInjectedAekoWallet(adapter);
      setWalletState({
        adapter,
        adapters: listInjectedAekoWalletAdapters(),
        connected: true,
        address,
        error: '',
        loading: false,
        lastSignature: '',
        lastMessageSignature: '',
      });
    } catch (error) {
      setWalletState({
        adapter,
        adapters: listInjectedAekoWalletAdapters(),
        connected: false,
        address: '',
        error: error.message || 'Wallet connection failed.',
        loading: false,
        lastSignature: '',
        lastMessageSignature: '',
      });
    }
  };

  const handleDisconnectWallet = async () => {
    if (!walletState.adapter) {
      return;
    }

    setWalletState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      await disconnectInjectedAekoWallet(walletState.adapter);
      setWalletState({
        adapter: detectInjectedAekoWalletAdapter(),
        adapters: listInjectedAekoWalletAdapters(),
        connected: false,
        address: '',
        error: '',
        loading: false,
        lastSignature: walletState.lastSignature,
        lastMessageSignature: walletState.lastMessageSignature,
      });
    } catch (error) {
      setWalletState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Wallet disconnect failed.',
      }));
    }
  };

  const handleWalletProof = async () => {
    if (!walletState.adapter) {
      setWalletState((current) => ({
        ...current,
        error: 'Connect a wallet before requesting a proof signature.',
      }));
      return;
    }

    setWalletState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const signature = await signWithInjectedAekoWallet(
        walletState.adapter,
        new TextEncoder().encode('AEKO-721 demo wallet proof'),
      );
      const normalized = typeof signature === 'string' ? signature : JSON.stringify(signature);
      setWalletState((current) => ({
        ...current,
        loading: false,
        lastMessageSignature: normalized,
      }));
    } catch (error) {
      setWalletState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Wallet message signing failed.',
      }));
    }
  };

  const handleWalletNativeSubmit = async () => {
    const adapter = walletState.adapter || detectInjectedAekoWalletAdapter();
    if (!adapter) {
      setWalletState((current) => ({
        ...current,
        adapter: null,
        error: 'No injected AEKO wallet was detected in this browser.',
      }));
      return;
    }

    setWalletState((current) => ({
      ...current,
      adapter,
      loading: true,
      error: '',
    }));

    try {
      const signature = await signAndSendPreparedTransaction(adapter, preparedTransactionState.base64);
      const status = await fetchSignatureStatus(liveReadForm.rpcEndpoint, signature);
      setWalletState((current) => ({
        ...current,
        adapter,
        connected: true,
        address: current.address || adapter.publicKey,
        loading: false,
        error: '',
        lastSignature: signature,
      }));
      setSubmissionState({
        loading: false,
        error: '',
        signature,
        status,
      });
    } catch (error) {
      setWalletState((current) => ({
        ...current,
        adapter,
        loading: false,
        error: error.message || 'Wallet-native submission failed.',
      }));
    }
  };

  const handleBuildPreparedTransaction = async () => {
    setPreparedTransactionState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const actionSigner = writePlan.action === 'transfer'
        ? writePlan.owner.trim()
        : writePlan.authority.trim();
      const payer = walletState.address || walletState.adapter?.publicKey || actionSigner;

      if (!payer) {
        throw new Error('Connect a wallet or enter the required signer so the fee payer can be derived.');
      }

      const blockhash = await fetchLatestBlockhash(liveReadForm.rpcEndpoint);
      const base64 = buildPreparedToken721Transaction({
        payer,
        recentBlockhash: blockhash,
        action: writePlan.action,
        collection: liveReadForm.collectionAddress.trim(),
        token: liveReadForm.tokenAddress.trim(),
        authority: writePlan.authority.trim(),
        owner: writePlan.owner.trim(),
        recipient: writePlan.recipient.trim(),
        tokenId: Number(writePlan.tokenId),
        royaltyBps: Number(writePlan.royaltyBps),
        metadata: {
          name: writePlan.metadataName.trim(),
          description: null,
          uri: writePlan.metadataUri.trim(),
          imageUri: null,
          attributes: [],
        },
      });

      setPreparedTransactionState({
        loading: false,
        error: '',
        payer,
        blockhash,
        base64,
      });
    } catch (error) {
      setPreparedTransactionState({
        loading: false,
        error: error.message || 'Unable to build a prepared AEKO-721 transaction.',
        payer: '',
        blockhash: '',
        base64: '',
      });
    }
  };

  const handleBuildAccountSetupTransactions = async () => {
    setSetupState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const authority = walletState.address || walletState.adapter?.publicKey || setupForm.baseAuthority.trim();
      if (!authority) {
        throw new Error('Connect a wallet or enter the collection authority/base signer before building setup transactions.');
      }

      const blockhash = await fetchLatestBlockhash(liveReadForm.rpcEndpoint);
      const collectionAddress = await deriveToken721AddressWithSeed(authority, setupForm.collectionSeed.trim());
      const tokenAddress = await deriveToken721AddressWithSeed(authority, setupForm.tokenSeed.trim());

      const collectionSpace = estimateCollectionAccountSpace({
        name: setupForm.collectionName.trim(),
        symbol: setupForm.collectionSymbol.trim(),
        baseUri: setupForm.collectionBaseUri.trim(),
      });
      const tokenSpace = estimateTokenAccountSpace({
        metadata: {
          name: writePlan.metadataName.trim(),
          description: null,
          uri: writePlan.metadataUri.trim(),
          imageUri: null,
          attributes: [],
        },
      });

      const [collectionLamports, tokenLamports] = await Promise.all([
        fetchMinimumBalanceForRentExemption(liveReadForm.rpcEndpoint, collectionSpace),
        fetchMinimumBalanceForRentExemption(liveReadForm.rpcEndpoint, tokenSpace),
      ]);

      const collectionTransactionBase64 = buildPreparedCollectionSetupTransaction({
        payer: authority,
        recentBlockhash: blockhash,
        base: authority,
        collectionAddress,
        collectionSeed: setupForm.collectionSeed.trim(),
        lamports: collectionLamports,
        space: collectionSpace,
        authority,
        name: setupForm.collectionName.trim(),
        symbol: setupForm.collectionSymbol.trim(),
        baseUri: setupForm.collectionBaseUri.trim(),
      });

      const mintTransactionBase64 = buildPreparedMintWithAccountSetupTransaction({
        payer: authority,
        recentBlockhash: blockhash,
        base: authority,
        tokenAddress,
        tokenSeed: setupForm.tokenSeed.trim(),
        lamports: tokenLamports,
        space: tokenSpace,
        collection: collectionAddress,
        authority: writePlan.authority.trim() || authority,
        owner: writePlan.owner.trim() || authority,
        tokenId: Number(writePlan.tokenId),
        royaltyBps: Number(writePlan.royaltyBps),
        metadata: {
          name: writePlan.metadataName.trim(),
          description: null,
          uri: writePlan.metadataUri.trim(),
          imageUri: null,
          attributes: [],
        },
      });

      setLiveReadForm((current) => ({
        ...current,
        collectionAddress,
        tokenAddress,
      }));

      setSetupState({
        loading: false,
        error: '',
        collectionAddress,
        tokenAddress,
        collectionSpace,
        tokenSpace,
        collectionLamports,
        tokenLamports,
        collectionTransactionBase64,
        mintTransactionBase64,
        blockhash,
      });
    } catch (error) {
      setSetupState({
        loading: false,
        error: error.message || 'Unable to build collection or token account setup transactions.',
        collectionAddress: '',
        tokenAddress: '',
        collectionSpace: 0,
        tokenSpace: 0,
        collectionLamports: 0,
        tokenLamports: 0,
        collectionTransactionBase64: '',
        mintTransactionBase64: '',
        blockhash: '',
      });
    }
  };

  const steps = useMemo(
    () => [
      {
        step: '1',
        title: 'Initialize Collection',
        description: 'Create a collection authority and anchor the NFT series under a single on-chain collection account.',
        details: ['Collection name and symbol are stored on-chain', 'Base URI may point to AEKO-hosted or immutable content gateways'],
        active: true,
      },
      {
        step: '2',
        title: 'Mint Genesis NFT',
        description: 'Mint a unique AEKO-721 asset with creator attribution, royalty basis points, and validated metadata.',
        details: ['Unique token id per collection', 'Metadata name, URI, image URI, and attributes are bounded and validated'],
        active: token.minted,
      },
      {
        step: '3',
        title: 'Freeze For Moderation',
        description: 'Creator can freeze an NFT when an asset needs moderation, compliance review, or recovery handling.',
        details: ['Frozen NFTs reject transfers', 'Frozen NFTs reject metadata edits until thawed'],
        active: token.frozen,
      },
      {
        step: '4',
        title: 'Thaw And Transfer',
        description: 'Once cleared, the creator thaws the NFT and the current owner can transfer it to a new wallet.',
        details: ['Owner signature required for transfer', 'Ownership updates are written into the NFT state'],
        active: token.minted && !token.frozen && token.transferCount > 0,
      },
      {
        step: '5',
        title: 'Update Metadata',
        description: 'Creator or current owner can update metadata within validation rules, keeping the asset fresh without losing provenance.',
        details: ['Royalty settings stay attached to the token', 'Metadata updates preserve creator and collection linkage'],
        active: token.metadataUri !== 'ar://genesis-pass-1',
      },
    ],
    [token],
  );

  const selectedAction = actionOptions.find((option) => option.value === writePlan.action);
  const writePayload = useMemo(() => {
    const collectionAddress = liveReadForm.collectionAddress.trim() || '<collection-account>';
    const tokenAddress = liveReadForm.tokenAddress.trim() || '<token-account>';
    const authority = writePlan.authority.trim() || '<authority-pubkey>';
    const owner = writePlan.owner.trim() || '<owner-pubkey>';
    const recipient = writePlan.recipient.trim() || '<recipient-pubkey>';

    if (writePlan.action === 'mint') {
      return {
        rpcEndpoint: liveReadForm.rpcEndpoint,
        instruction: 'MintNft',
        requiredSigner: selectedAction?.signer,
        accounts: {
          collection: collectionAddress,
          token: tokenAddress,
          authority,
        },
        args: {
          tokenId: writePlan.tokenId,
          owner,
          creator: authority,
          royaltyBps: writePlan.royaltyBps,
          metadata: {
            name: writePlan.metadataName,
            uri: writePlan.metadataUri,
          },
        },
      };
    }

    if (writePlan.action === 'freeze' || writePlan.action === 'thaw') {
      return {
        rpcEndpoint: liveReadForm.rpcEndpoint,
        instruction: writePlan.action === 'freeze' ? 'FreezeNft' : 'ThawNft',
        requiredSigner: selectedAction?.signer,
        accounts: {
          token: tokenAddress,
          authority,
        },
      };
    }

    if (writePlan.action === 'transfer') {
      return {
        rpcEndpoint: liveReadForm.rpcEndpoint,
        instruction: 'TransferNft',
        requiredSigner: selectedAction?.signer,
        accounts: {
          token: tokenAddress,
          owner,
        },
        args: {
          newOwner: recipient,
        },
      };
    }

    return {
      rpcEndpoint: liveReadForm.rpcEndpoint,
      instruction: 'UpdateMetadata',
      requiredSigner: selectedAction?.signer,
      accounts: {
        token: tokenAddress,
        authority,
      },
      args: {
        metadata: {
          name: writePlan.metadataName,
          uri: writePlan.metadataUri,
        },
      },
    };
  }, [liveReadForm, selectedAction, writePlan]);

  return (
    <div className="pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aeko-accent/10 text-aeko-accent border border-aeko-accent/20 text-sm font-medium mb-6"
          >
            <GalleryVerticalEnd size={14} />
            <span>AEKO-721 Demo Flow</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold mb-6"
          >
            NFT Lifecycle <span className="text-gradient">In Public</span>
          </motion.h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            The page now does both: a local lifecycle simulator for the AEKO-721 flow, and real testnet-backed reads for collection and NFT accounts over AEKO JSON-RPC.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Database className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Canonical Public Examples</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            This section is where the public AEKO-721 walkthrough anchors. When canonical testnet accounts are published, these presets let anyone load the same collection and NFT state directly into the demo.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {nftDemoExamples.map((example) => (
              <ExampleCard key={example.id} example={example} onLoad={handleLoadCanonicalExample} />
            ))}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Radio className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Live Testnet Read Panel</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            Point this panel at an AEKO testnet RPC and load a real collection account plus NFT token account. The decoder expects the current AEKO-721 Borsh layout from the on-chain reference program.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <input
              value={liveReadForm.rpcEndpoint}
              onChange={(event) => handleLiveFieldChange('rpcEndpoint', event.target.value)}
              className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
              placeholder="RPC endpoint"
            />
            <input
              value={liveReadForm.collectionAddress}
              onChange={(event) => handleLiveFieldChange('collectionAddress', event.target.value)}
              className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
              placeholder="Collection account"
            />
            <input
              value={liveReadForm.tokenAddress}
              onChange={(event) => handleLiveFieldChange('tokenAddress', event.target.value)}
              className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
              placeholder="NFT token account"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <button
              onClick={handleLoadLiveAccounts}
              disabled={liveReadState.loading}
              className="inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors disabled:opacity-50"
            >
              <Database size={16} className="text-aeko-accent" />
              {liveReadState.loading ? 'Loading Accounts...' : 'Load Live Accounts'}
            </button>
            <span className="text-xs text-gray-500">
              Default RPC: <span className="text-gray-300">{DEFAULT_RPC_ENDPOINT}</span>
            </span>
          </div>

          {liveReadState.error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-6">
              {liveReadState.error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">Collection Account</h3>
              {liveReadState.collection ? (
                <div className="space-y-1">
                  <StatRow label="Name" value={liveReadState.collection.name} />
                  <StatRow label="Symbol" value={liveReadState.collection.symbol} />
                  <StatRow label="Authority" value={liveReadState.collection.authority} subtle />
                  <StatRow label="Base URI" value={liveReadState.collection.baseUri || 'None'} subtle />
                  <StatRow label="Total Minted" value={String(liveReadState.collection.totalMinted)} />
                  <StatRow label="Initialized" value={liveReadState.collection.isInitialized ? 'Yes' : 'No'} />
                  <StatRow
                    label="Program Owner Check"
                    value={liveReadState.collectionOwnerMatch?.matches ? 'Matches AEKO-721' : 'Owner mismatch'}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400">Load a collection account to inspect real testnet state.</p>
              )}
            </div>

            <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">NFT Token Account</h3>
              {liveReadState.token ? (
                <div className="space-y-1">
                  <StatRow label="Token ID" value={String(liveReadState.token.tokenId)} />
                  <StatRow label="Owner" value={liveReadState.token.owner} subtle />
                  <StatRow label="Creator" value={liveReadState.token.creator} subtle />
                  <StatRow label="Royalty" value={`${liveReadState.token.royaltyBps} bps`} />
                  <StatRow label="Frozen" value={liveReadState.token.frozen ? 'Yes' : 'No'} />
                  <StatRow label="Metadata Name" value={liveReadState.token.metadata.name} />
                  <StatRow label="Metadata URI" value={liveReadState.token.metadata.uri} subtle />
                  <StatRow
                    label="Program Owner Check"
                    value={liveReadState.tokenOwnerMatch?.matches ? 'Matches AEKO-721' : 'Owner mismatch'}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400">Load an NFT token account to inspect real testnet state.</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Collection And Account Setup</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            This helper derives AEKO-721 collection and token account addresses from a base signer plus seeds, fetches rent-exempt balances, and builds the two setup transactions you need for a fresh testnet demo: create plus initialize collection, then create token account plus mint NFT.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Base Authority / Fee Payer</label>
                <input
                  value={setupForm.baseAuthority}
                  onChange={(event) => handleSetupFieldChange('baseAuthority', event.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                  placeholder={walletState.address || 'Connected wallet address or authority pubkey'}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Collection Seed</label>
                  <input
                    value={setupForm.collectionSeed}
                    onChange={(event) => handleSetupFieldChange('collectionSeed', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="aeko-genesis-collection"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Token Seed</label>
                  <input
                    value={setupForm.tokenSeed}
                    onChange={(event) => handleSetupFieldChange('tokenSeed', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="aeko-genesis-token-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Collection Name</label>
                  <input
                    value={setupForm.collectionName}
                    onChange={(event) => handleSetupFieldChange('collectionName', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="AEKO Genesis Passes"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Collection Symbol</label>
                  <input
                    value={setupForm.collectionSymbol}
                    onChange={(event) => handleSetupFieldChange('collectionSymbol', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="AGEN"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Collection Base URI</label>
                <input
                  value={setupForm.collectionBaseUri}
                  onChange={(event) => handleSetupFieldChange('collectionBaseUri', event.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                  placeholder="ar://aeko-genesis-passes"
                />
              </div>

              <button
                onClick={handleBuildAccountSetupTransactions}
                disabled={setupState.loading}
                className="inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors disabled:opacity-50"
              >
                <Sparkles size={16} className="text-aeko-accent" />
                {setupState.loading ? 'Building Setup...' : 'Build Setup Transactions'}
              </button>
            </div>

            <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">Derived Setup Output</h3>
              <div className="space-y-1 mb-6">
                <StatRow label="AEKO-721 Program" value={token721ProgramId()} subtle />
                <StatRow label="Collection Address" value={setupState.collectionAddress || 'Not built yet'} subtle />
                <StatRow label="Token Address" value={setupState.tokenAddress || 'Not built yet'} subtle />
                <StatRow label="Recent Blockhash" value={setupState.blockhash || 'Not fetched yet'} subtle />
                <StatRow label="Collection Space" value={setupState.collectionSpace ? `${setupState.collectionSpace} bytes` : 'Pending'} />
                <StatRow label="Token Space" value={setupState.tokenSpace ? `${setupState.tokenSpace} bytes` : 'Pending'} />
                <StatRow label="Collection Rent" value={setupState.collectionLamports ? `${setupState.collectionLamports} lamports` : 'Pending'} />
                <StatRow label="Token Rent" value={setupState.tokenLamports ? `${setupState.tokenLamports} lamports` : 'Pending'} />
              </div>
              {setupState.error && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
                  {setupState.error}
                </div>
              )}
              {setupState.collectionTransactionBase64 && (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Create + Initialize Collection</div>
                    <textarea
                      readOnly
                      value={setupState.collectionTransactionBase64}
                      className="w-full min-h-[120px] bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Create Token Account + Mint NFT</div>
                    <textarea
                      readOnly
                      value={setupState.mintTransactionBase64}
                      className="w-full min-h-[120px] bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <FileCode2 className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Testnet Write Builder</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            This panel now does two things from the same AEKO-721 action form: it shows the exact instruction/account plan, and it can build a real unsigned legacy transaction payload against a fresh testnet blockhash for wallet signing.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Action</label>
                <select
                  value={writePlan.action}
                  onChange={(event) => handleWritePlanChange('action', event.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                >
                  {actionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Authority / Creator</label>
                  <input
                    value={writePlan.authority}
                    onChange={(event) => handleWritePlanChange('authority', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="Authority pubkey"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Owner</label>
                  <input
                    value={writePlan.owner}
                    onChange={(event) => handleWritePlanChange('owner', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="Owner pubkey"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Recipient / New Owner</label>
                  <input
                    value={writePlan.recipient}
                    onChange={(event) => handleWritePlanChange('recipient', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="Recipient pubkey"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Token ID</label>
                  <input
                    value={writePlan.tokenId}
                    onChange={(event) => handleWritePlanChange('tokenId', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Royalty (bps)</label>
                  <input
                    value={writePlan.royaltyBps}
                    onChange={(event) => handleWritePlanChange('royaltyBps', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Metadata Name</label>
                  <input
                    value={writePlan.metadataName}
                    onChange={(event) => handleWritePlanChange('metadataName', event.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                    placeholder="Genesis Pass #1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Metadata URI</label>
                <input
                  value={writePlan.metadataUri}
                  onChange={(event) => handleWritePlanChange('metadataUri', event.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent"
                  placeholder="ar://genesis-pass-1"
                />
              </div>
            </div>

            <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">Wallet Action Plan</h3>
              <div className="space-y-1 mb-6">
                <StatRow label="Instruction" value={writePayload.instruction} />
                <StatRow label="Required Signer" value={writePayload.requiredSigner || 'Unknown'} />
                <StatRow label="RPC Endpoint" value={writePayload.rpcEndpoint} subtle />
              </div>
              <pre className="bg-black/40 p-4 rounded-xl overflow-x-auto text-xs text-gray-300 whitespace-pre-wrap break-all">
                {JSON.stringify(writePayload, null, 2)}
              </pre>
              <button
                onClick={handleBuildPreparedTransaction}
                disabled={preparedTransactionState.loading}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors disabled:opacity-50"
              >
                <FileCode2 size={16} className="text-aeko-accent" />
                {preparedTransactionState.loading ? 'Building...' : 'Build Unsigned Transaction'}
              </button>
              {preparedTransactionState.error && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mt-4">
                  {preparedTransactionState.error}
                </div>
              )}
              {preparedTransactionState.base64 && (
                <div className="mt-6 space-y-4">
                  <div className="space-y-1">
                    <StatRow label="Fee Payer" value={preparedTransactionState.payer} subtle />
                    <StatRow label="Recent Blockhash" value={preparedTransactionState.blockhash} subtle />
                  </div>
                  <textarea
                    readOnly
                    value={preparedTransactionState.base64}
                    className="w-full min-h-[180px] bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="text-aeko-accent" />
              <h2 className="text-2xl font-bold">Wallet Adapter</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleConnectWallet}
                disabled={walletState.loading}
                className="inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors disabled:opacity-50"
              >
                <Wallet size={16} className="text-aeko-accent" />
                {walletState.loading ? 'Connecting...' : walletState.connected ? 'Reconnect Wallet' : 'Connect Wallet'}
              </button>
              <button
                onClick={handleDisconnectWallet}
                disabled={walletState.loading || !walletState.connected}
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                Disconnect
              </button>
              <button
                onClick={handleWalletProof}
                disabled={walletState.loading || !walletState.connected || !walletState.adapter?.capabilities.signMessage}
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                Sign Proof
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            The demo now talks to wallets through a typed AEKO adapter shape instead of raw provider guessing. That makes connect, disconnect, proof signing, and sign-and-send behavior much easier to reason about across wallet implementations.
          </p>
          <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
            <div className="space-y-1">
              <StatRow label="Wallet Detected" value={walletState.adapter ? 'Yes' : 'No'} />
              <StatRow label="Adapter" value={walletState.adapter?.name || 'No adapter detected'} subtle />
              <StatRow label="Adapters Found" value={String(walletState.adapters.length)} />
              <StatRow label="Connected" value={walletState.connected ? 'Yes' : 'No'} />
              <StatRow label="Address" value={walletState.address || 'Not connected'} subtle />
              <StatRow
                label="Capabilities"
                value={walletState.adapter ? Object.entries(walletState.adapter.capabilities).filter(([, value]) => value).map(([key]) => key).join(', ') : 'None'}
                subtle
              />
              <StatRow label="Last Wallet Signature" value={walletState.lastSignature || 'None yet'} subtle />
              <StatRow label="Last Proof Signature" value={walletState.lastMessageSignature || 'None yet'} subtle />
            </div>
            {walletState.error && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mt-4">
                {walletState.error}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Send className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Signed Transaction Submission</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            If you sign an AEKO-721 transaction externally, you can paste the base64-encoded signed transaction here and broadcast it to testnet through the selected RPC endpoint. The builder above produces an unsigned payload for wallets, not a directly broadcastable signed transaction.
          </p>

          <textarea
            value={signedTransactionBase64}
            onChange={(event) => setSignedTransactionBase64(event.target.value)}
            className="w-full min-h-[180px] bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-aeko-accent mb-4"
            placeholder="Paste signed transaction base64 here"
          />

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <button
              onClick={handleSubmitSignedTransaction}
              disabled={submissionState.loading}
              className="inline-flex items-center gap-2 rounded-xl bg-aeko-accent/10 border border-aeko-accent/30 px-4 py-3 text-sm font-medium text-white hover:bg-aeko-accent/20 transition-colors disabled:opacity-50"
            >
              <Send size={16} className="text-aeko-accent" />
              {submissionState.loading ? 'Submitting...' : 'Submit Signed Transaction'}
            </button>
            <span className="text-xs text-gray-500">
              Uses RPC endpoint: <span className="text-gray-300">{liveReadForm.rpcEndpoint}</span>
            </span>
            <button
              onClick={handleWalletNativeSubmit}
              disabled={walletState.loading || !preparedTransactionState.base64}
              className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <Wallet size={16} className="text-aeko-accent" />
              Sign And Send Prepared Tx
            </button>
          </div>

          {submissionState.error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
              {submissionState.error}
            </div>
          )}

          {(submissionState.signature || submissionState.status) && (
            <div className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">Submission Result</h3>
              <div className="space-y-1">
                <StatRow label="Signature" value={submissionState.signature || 'Pending'} subtle />
                <StatRow
                  label="Confirmation"
                  value={submissionState.status?.confirmationStatus || 'Unknown'}
                />
                <StatRow
                  label="Error"
                  value={submissionState.status?.err ? JSON.stringify(submissionState.status.err) : 'None'}
                  subtle
                />
                <StatRow
                  label="Slot"
                  value={submissionState.status?.slot ? String(submissionState.status.slot) : 'Unknown'}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="text-aeko-accent" />
                <h2 className="text-2xl font-bold">Interactive Lifecycle</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {steps.map((step) => (
                  <StepCard key={step.step} {...step} />
                ))}
              </div>
            </div>

            <div className="bg-[#0f0f16] border border-white/10 rounded-3xl p-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Try The Flow</h2>
                  <p className="text-sm text-gray-400 mt-1">These controls simulate the same guardrails as the on-chain AEKO-721 processor.</p>
                </div>
                <button onClick={handleReset} className="text-sm text-aeko-accent hover:text-white transition-colors">
                  Reset demo
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton icon={Play} label="Mint NFT" onClick={handleMint} disabled={token.minted} tone="accent" />
                <ActionButton icon={Snowflake} label="Freeze NFT" onClick={handleFreeze} disabled={!token.minted || token.frozen} tone="warn" />
                <ActionButton icon={RefreshCcw} label="Thaw NFT" onClick={handleThaw} disabled={!token.frozen} />
                <ActionButton icon={Send} label="Transfer NFT" onClick={handleTransfer} disabled={!token.minted} />
                <ActionButton icon={PenSquare} label="Update Metadata" onClick={handleMetadataUpdate} disabled={!token.minted} />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <ScrollText className="text-aeko-accent" />
                <h2 className="text-2xl font-bold">Demo Event Log</h2>
              </div>
              <div className="space-y-3">
                {logs.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className={`text-sm ${entry.tone}`}>{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-[#0f0f16] border border-white/10 rounded-3xl p-8">
              <h2 className="text-2xl font-bold mb-4">{token.metadataName}</h2>
              <div className={`aspect-square rounded-2xl border border-white/10 mb-6 flex items-end p-6 ${
                token.frozen ? 'bg-gradient-to-br from-cyan-500/20 via-white/5 to-transparent' : 'bg-gradient-to-br from-aeko-accent/30 via-cyan-500/10 to-transparent'
              }`}>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-aeko-accent mb-2">AEKO-721</div>
                  <div className="text-2xl font-bold text-white">{token.minted ? 'Minted Asset' : 'Pending Mint'}</div>
                  <div className="text-sm text-gray-400 mt-1">{token.royaltyBps} bps creator royalty</div>
                </div>
              </div>
              <div className="space-y-1">
                <StatRow label="Collection" value="AEKO Genesis Passes" />
                <StatRow label="Creator" value={token.creator} subtle />
                <StatRow label="Owner" value={token.minted ? token.owner : 'Not minted'} />
                <StatRow label="State" value={token.frozen ? 'Frozen' : token.minted ? 'Active' : 'Unminted'} />
                <StatRow label="Metadata URI" value={token.metadataUri} subtle />
                <StatRow label="Transfers" value={String(token.transferCount)} subtle />
              </div>
            </div>

            <ControlCard
              icon={Shield}
              title="Moderation Ready"
              description="Freeze and thaw controls let creators pause movement or edits while disputes, moderation actions, or compliance reviews are in flight."
            />
            <ControlCard
              icon={RefreshCcw}
              title="Transfer Safe"
              description="Transfers require the current owner signature and fail cleanly when the NFT is frozen or the signer does not match ownership."
            />
            <ControlCard
              icon={PenSquare}
              title="Metadata Hygiene"
              description="Metadata fields are validated for empty values, oversized content, invalid URI formats, and malformed attribute entries before updates land."
            />
          </div>
        </div>

        <div className="border-t border-white/10 pt-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Next Demo Layer</h2>
            <p className="text-gray-400">The next step after client-side transaction construction is tightening this into a fully typed wallet adapter flow and adding collection-initialization plus account-creation helpers.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/docs" className="flex items-center gap-2 text-aeko-accent hover:text-white transition-colors font-medium">
              Read Docs <ArrowRight size={16} />
            </Link>
            <Link to="/token" className="flex items-center gap-2 text-aeko-accent hover:text-white transition-colors font-medium">
              View Token Standards <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
