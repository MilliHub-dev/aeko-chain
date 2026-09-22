import { getNetworkConfig } from '../utils/networkConfig';

const runtime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const vite = import.meta.env;
const testnet = getNetworkConfig('testnet');

const demoCollection = String(runtime.demoCollection || vite.VITE_AEKO_DEMO_COLLECTION || '').trim();
const demoToken = String(runtime.demoToken || vite.VITE_AEKO_DEMO_TOKEN || '').trim();

const canonicalExample = {
  id: 'aeko-genesis-pass-1',
  label: 'AEKO Genesis Pass #1',
  status: demoCollection && demoToken ? 'live' : 'pending',
  description:
    'Canonical AEKO-721 example for docs, wallet testing, and explorer verification.',
  rpcEndpoint: String(runtime.demoRpcUrl || vite.VITE_AEKO_DEMO_RPC || testnet.rpcUrl || '').trim(),
  collectionAddress: demoCollection,
  tokenAddress: demoToken,
  collectionSeed: vite.VITE_AEKO_DEMO_COLLECTION_SEED || 'aeko-genesis-collection',
  tokenSeed: vite.VITE_AEKO_DEMO_TOKEN_SEED || 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
  metadataName: 'Genesis Pass #1',
  metadataUri: String(runtime.demoMetadataUri || 'ar://genesis-pass-1').trim(),
  tokenId: '1',
  royaltyBps: '500',
};

export const nftDemoExamples = [canonicalExample];
