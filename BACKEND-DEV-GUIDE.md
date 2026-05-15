# Backend Developer Guide

Everything the backend team needs to integrate with AEKO Chain. Chain team has shipped all blockers.

---

## Chain Endpoints

| Service  | Default Port | Notes                         |
|----------|-------------|-------------------------------|
| RPC      | 8899        | JSON-RPC 2.0, HTTP + WebSocket |
| Explorer | 8088        | REST API, block indexer        |
| Faucet   | 9900        | TCP (use via `requestAirdrop` RPC call) |

RPC base: `http://<node>:8899`  
Explorer base: `http://<node>:8088`

---

## Program IDs

| Program          | ID (base58)                                    | Bytes         |
|------------------|------------------------------------------------|---------------|
| Token-721        | `PROGRAM_IDS.TOKEN_721` (from SDK)             | `[10u8; 32]`  |
| NFT Marketplace  | `PROGRAM_IDS.NFT_MARKETPLACE` (from SDK)       | `[11u8; 32]`  |
| System Program   | `11111111111111111111111111111111`              | `[0u8; 32]`   |

These are exported from the JS/Node SDK:

```ts
import { PROGRAM_IDS } from '@aeko-chain/web3.js'
// PROGRAM_IDS.TOKEN_721
// PROGRAM_IDS.NFT_MARKETPLACE
```

---

## SDK

Published to npm and PyPI.

```bash
npm install @aeko-chain/web3.js   # JS (browser/edge)
npm install @aeko-chain/sdk       # Node.js (server-side)
pip install aeko-sdk              # Python
```

---

## IPFS — Handle on the Backend

**The chain does not touch IPFS.** It stores and validates URI strings only. Accepted schemes: `ipfs://`, `https://`, `ar://`, `http://`.

The backend is responsible for all IPFS uploads before building on-chain transactions.

### Flow for NFT minting

```
client → backend
   1. POST /nft/upload  (raw image + metadata)
   2. backend uploads image to IPFS → gets CID_image
   3. backend builds metadata JSON:
        { name, description, image: "ipfs://<CID_image>", attributes: [...] }
   4. backend uploads metadata JSON to IPFS → gets CID_meta
   5. backend builds mint transaction with:
        uri:      "ipfs://<CID_meta>"
        imageUri: "ipfs://<CID_image>"
   6. return unsigned tx to client for signing
```

### Flow for social posts

```
client → backend
   1. POST /post/anchor  (content body or media)
   2. backend uploads content to IPFS → gets CID
   3. backend builds social-posts instruction with:
        contentUri: "ipfs://<CID>"
   4. return unsigned tx to client for signing
```

Recommended IPFS providers: Pinata, Web3.Storage, or a self-hosted Kubo node.

---

## NFT Marketplace — How BuyNft Works

The marketplace program **only updates state** (marks listing as Sold, records buyer). It does **not** move lamports or transfer the NFT. This is by design — native programs cannot debit accounts they don't own.

**The backend must compose a 3-instruction atomic transaction for every purchase:**

```
Instruction 1: System Program — transfer lamports  buyer → seller (price - royalty - fee)
Instruction 2: System Program — transfer lamports  buyer → creator (royalty)
Instruction 3: Token-721 — TransferNft              token_account → buyer
Instruction 4: NFT Marketplace — BuyNft             listing_account → Sold
```

All four instructions go in the same transaction. If any one fails, the whole transaction reverts.

### Listing (seller side)

```ts
import { buildPreparedListNftTransaction } from '@aeko-chain/web3.js'

const tx = buildPreparedListNftTransaction({
  payer:          sellerPubkey,
  recentBlockhash: blockhash,
  listingAccount: listingPubkey,   // pre-allocated, owned by marketplace program
  tokenAccount:   tokenPubkey,     // token-721 token account
  seller:         sellerPubkey,
  collection:     collectionPubkey,
  creator:        creatorPubkey,
  priceLamports:  1_000_000_000,   // 1 AEKO
  royaltyBps:     500,             // 5%
  expiresAtSlot:  null,            // or a slot number for timed listings
})
// tx is a base64-encoded unsigned transaction — send to client for signing
```

### Cancelling a listing (seller side)

```ts
import { buildPreparedCancelListingTransaction } from '@aeko-chain/web3.js'

const tx = buildPreparedCancelListingTransaction({
  payer:          sellerPubkey,
  recentBlockhash: blockhash,
  listingAccount: listingPubkey,
  seller:         sellerPubkey,
})
```

### Buying (backend composes the full atomic transaction)

The SDK provides `buildPreparedBuyNftTransaction` which builds only the BuyNft instruction. For the complete purchase you need to build a multi-instruction transaction manually, combining:

1. System transfer(s) for payment
2. Token-721 `TransferNft` instruction
3. Marketplace `BuyNft` instruction

The SDK's `buildLegacyMessage` internals handle account ordering — contact chain team if you need a `buildPreparedPurchaseNftTransaction` helper that wraps all three.

---

## Listing Account — Pre-allocation

Before calling `ListNft`, the listing account must exist on-chain and be owned by the marketplace program. The backend is responsible for creating it using `CreateAccountWithSeed` (System Program instruction 3) in the same transaction or a preceding one.

Listing account size:
```
32  (seller pubkey)
+ 32  (collection pubkey)
+ 32  (token_account pubkey)
+ 32  (creator pubkey)
+ 8   (price_lamports u64)
+ 2   (royalty_bps u16)
+ 9   (expires_at_slot Option<u64>)
+ 1   (state enum)
+ 33  (buyer Option<Pubkey>)
+ 1   (is_initialized bool)
= ~183 bytes (add padding, use 256 bytes to be safe)
```

Recommended seed pattern: `"listing:" + tokenAccount.toString()`

---

## Explorer API — Useful Endpoints

```
GET /blocks?limit=N              recent blocks
GET /transactions?limit=N        recent transactions
GET /account/:address            account info + balance
GET /tokens/transfers?limit=N    recent token transfers
GET /nfts?limit=N                indexed NFTs
GET /posts?limit=N               social posts
GET /stakes?limit=N              stake positions
GET /engagement?limit=N          engagement events
```

---

## Sending Transactions

All SDK builder functions return a **base64-encoded unsigned transaction**. The typical backend flow:

```
1. Fetch recentBlockhash from RPC (getRecentBlockhash or getLatestBlockhash)
2. Build transaction with SDK builder
3. Return base64 tx to client
4. Client signs with wallet
5. Client POSTs signed tx back to backend
6. Backend submits via RPC: sendTransaction (base64, { encoding: "base64" })
7. Backend confirms via: getSignatureStatuses or getTransaction
```

---

## Airdrop / Faucet (testnet only)

Use the `requestAirdrop` RPC method. Max 10 AEKO per request.

```bash
curl -X POST http://localhost:8899 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":["<pubkey>", 5000000000]}'
# 5000000000 lamports = 5 AEKO
```

---

## Token Amounts

`1 AEKO = 1,000,000,000 lamports`

Always work in lamports on-chain. Convert for display only.

---

## What's Still Pending (chain team side)

- SBF compilation of `nft-marketplace` program (network issue during build, will resolve)
- Deployment of `nft-marketplace` program to testnet (after SBF build passes)
- Explorer indexing for marketplace listings (currently no `/marketplace/listings` endpoint — query listing accounts directly via RPC `getAccountInfo` for now)
