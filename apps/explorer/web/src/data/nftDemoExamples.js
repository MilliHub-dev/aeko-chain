const canonicalExample = {
  id: 'aeko-genesis-pass-1',
  label: 'AEKO Genesis Pass #1',
  status:
    import.meta.env.VITE_AEKO_DEMO_COLLECTION &&
    import.meta.env.VITE_AEKO_DEMO_TOKEN
      ? 'live'
      : 'pending',
  description:
    'Canonical AEKO-721 public example for docs, wallet testing, and explorer verification.',
  rpcEndpoint:
    import.meta.env.VITE_AEKO_DEMO_RPC || import.meta.env.VITE_AEKO_TESTNET_RPC || 'https://api.testnet.aeko.chain',
  collectionAddress: import.meta.env.VITE_AEKO_DEMO_COLLECTION || '',
  tokenAddress: import.meta.env.VITE_AEKO_DEMO_TOKEN || '',
  collectionSeed: import.meta.env.VITE_AEKO_DEMO_COLLECTION_SEED || 'aeko-genesis-collection',
  tokenSeed: import.meta.env.VITE_AEKO_DEMO_TOKEN_SEED || 'aeko-genesis-token-1',
  collectionName: 'AEKO Genesis Passes',
  collectionSymbol: 'AGEN',
  collectionBaseUri: 'ar://aeko-genesis-passes',
  metadataName: 'Genesis Pass #1',
  metadataUri: 'ar://genesis-pass-1',
  tokenId: '1',
  royaltyBps: '500',
};

export const nftDemoExamples = [canonicalExample];
