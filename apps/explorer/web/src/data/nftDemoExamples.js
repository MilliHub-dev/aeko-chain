import { getTestNetworkConfig } from '../utils/networkConfig';

const testnet = getTestNetworkConfig();

const canonicalExample = {
  id: 'aeko-genesis-pass-1',
  label: 'AEKO Genesis Pass #1',
  status: 'pending',
  description:
    'Canonical AEKO-721 example for docs, wallet testing, and explorer verification.',
  rpcEndpoint: testnet.rpcUrl,
  collectionAddress: '',
  tokenAddress: '',
  collectionSeed: 'aeko-genesis-collection',
  tokenSeed: 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
  metadataName: 'Genesis Pass #1',
  metadataUri: 'ar://genesis-pass-1',
  tokenId: '1',
  royaltyBps: '500',
};

export const nftDemoExamples = [canonicalExample];
