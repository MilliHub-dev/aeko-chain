# NFT Minting Guide

How to turn a piece of content into an AEKO-721 NFT.

## Minting a Compressed NFT (Social Post)

For social media posts, you should almost always use Compressed NFTs (cNFTs) to save costs.

```javascript
import { mintCompressedNft } from '@aeko-chain/compression';

const { signature } = await mintCompressedNft(connection, {
    payer: userWallet,
    treeAddress: merkleTreeAddress,
    metadata: {
        name: "My First Post",
        symbol: "POST",
        uri: "https://arweave.net/...",
        creators: [{ address: userWallet.publicKey, share: 100 }]
    }
});
```

## Minting a Standard NFT (PFP)

For high-value items:

```javascript
import { createNft } from '@aeko-chain/metaplex';

const { nft } = await createNft(metaplex, {
    name: "Rare Avatar #404",
    uri: "https://ipfs.io/ipfs/...",
    sellerFeeBasisPoints: 500, // 5% Royalty
});
```
