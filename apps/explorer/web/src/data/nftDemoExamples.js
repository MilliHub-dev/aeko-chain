import { getDemoConfig, getNetworkConfig } from '../utils/networkConfig';

const testnet = getNetworkConfig('testnet');
const demo = getDemoConfig();

const canonicalExample = {
  id: 'aeko-genesis-pass-1',
  label: 'AEKO Genesis Pass #1',
  status: demo.collection && demo.token ? 'live' : 'pending',
  description:
    'Canonical AEKO-721 example for docs, wallet testing, and explorer verification.',
  rpcEndpoint: demo.rpcUrl || testnet.rpcUrl,
  collectionAddress: demo.collection,
  tokenAddress: demo.token,
  collectionSeed: 'aeko-genesis-collection',
  tokenSeed: 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
  metadataName: 'Genesis Pass #1',
  metadataUri: demo.metadataUri || 'ar://genesis-pass-1',
  tokenId: '1',
  royaltyBps: '500',
};

export const nftDemoExamples = [canonicalExample];
