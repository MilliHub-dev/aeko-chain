import { getNetworkConfig, getRuntimeConfigValue } from '../utils/networkConfig';

const testnet = getNetworkConfig('testnet');

const demoCollection = getRuntimeConfigValue('AEKO_DEMO_COLLECTION');
const demoToken = getRuntimeConfigValue('AEKO_DEMO_TOKEN');

const canonicalExample = {
  id: 'aeko-genesis-pass-1',
  label: 'AEKO Genesis Pass #1',
  status: demoCollection && demoToken ? 'live' : 'pending',
  description:
    'Canonical AEKO-721 example for docs, wallet testing, and explorer verification.',
  rpcEndpoint: getRuntimeConfigValue('AEKO_DEMO_RPC_URL') || testnet.rpcUrl,
  collectionAddress: demoCollection,
  tokenAddress: demoToken,
  collectionSeed: 'aeko-genesis-collection',
  tokenSeed: 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
  metadataName: 'Genesis Pass #1',
  metadataUri: getRuntimeConfigValue('AEKO_DEMO_METADATA_URI') || 'ar://genesis-pass-1',
  tokenId: '1',
  royaltyBps: '500',
};

export const nftDemoExamples = [canonicalExample];
