# AEKO-721 NFT Standard

AEKO-721 is the standard for Non-Fungible Tokens, optimized for high-volume social assets.

## Compression (cNFTs)

To support millions of social posts as NFTs, AEKO-721 uses **State Compression** (Merke Trees).
*   **Cost**: Minting 1 million cNFTs costs ~$100 (vs. millions on Ethereum).
*   **Storage**: Metadata is stored off-chain (IPFS/Arweave), only the "fingerprint" (hash) is on-chain.

## Metadata Standard

AEKO-721 follows the Metaplex Token Metadata standard.

```json
{
  "name": "Aeko Genesis #1",
  "symbol": "AEKO",
  "description": "The first post on Aeko Chain",
  "image": "https://arweave.net/...",
  "attributes": [
    { "trait_type": "Rarity", "value": "Legendary" },
    { "trait_type": "Author", "value": "Satoshi" }
  ],
  "properties": {
    "creators": [
      {
        "address": "AuthorPublicKey...",
        "share": 100
      }
    ]
  }
}
```
