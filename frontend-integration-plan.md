# Frontend Integration Plan
## Wallet · NFT · NFT Marketplace · Post-to-NFT

> **Context:** Aeko Social mobile app (React Native) and web app (Next.js) exist in separate repos.
> Neither app is connected to the chain yet. This plan covers what to build to connect them.

---

## What Already Exists

### Chain side (this repo — ready)
| Component | Status |
|-----------|--------|
| `token-721` program (mint, transfer, metadata) | Complete |
| `social-posts` program (anchor post, engagement) | Complete |
| `social-monetization` program (tips, subscriptions) | Complete |
| `wallet-permissions` program (delegate, spend limits) | Complete |
| `tokenomics` program (supply, emissions, rewards) | Complete |
| Full permission layer (clearance, subnets, encryption) | Complete |
| RPC endpoint (port 8899) | Running |
| Explorer REST API (port 8088) | Running |

### App side (separate repos — not yet connected)
| Component | Status |
|-----------|--------|
| Aeko Social mobile app (React Native) | Exists, no chain calls |
| Aeko Social web app (Next.js) | Exists, no chain calls |

### What does NOT exist yet
| Component | Needed for |
|-----------|------------|
| `@aeko/sdk` — JS/TS package | Everything |
| `programs/nft-marketplace/` | NFT Marketplace feature |
| `MintPostAsNft` instruction in `social-posts` | Post-to-NFT feature |

---

## What Needs to Be Built

Three things, in dependency order:

```
1. @aeko/sdk (JS/TS package)
        ↓
2. Two new on-chain additions
   - nft-marketplace program
   - MintPostAsNft instruction
        ↓
3. Integration in both apps
   - Wallet
   - NFT
   - Post-to-NFT
   - Marketplace
```

---

## Step 1 — Build the `@aeko/sdk` Package

This is the bridge between the apps and the chain. Both the Next.js web app and React Native mobile app import this same package.

### Location

Create as a standalone npm package. Can live in this repo or a dedicated `aeko-sdk` repo. If staying in this repo:

```
sdk/js/
  package.json        # name: "@aeko/sdk"
  tsconfig.json
  src/
    connection.ts     # JSON-RPC wrapper for port 8899
    keypair.ts        # key generation, import/export, signing
    transaction.ts    # build, sign, send, confirm
    explorer.ts       # REST client for explorer API :8088
    borsh/
      token721.ts     # serialize/deserialize Aeko721Token, Aeko721Collection
      socialPosts.ts  # serialize/deserialize PostAnchor, EngagementProof
      marketplace.ts  # serialize/deserialize MarketplaceListing, MarketplaceOffer
    programs/
      token721.ts     # transaction builders: mint, transfer, updateMetadata
      socialPosts.ts  # transaction builders: anchorPost, mintPostAsNft
      marketplace.ts  # transaction builders: list, delist, buy, makeOffer, acceptOffer
      monetization.ts # transaction builders: sendTip, subscribe, unlockContent
    index.ts
```

### Core primitives

**`connection.ts`**
```ts
export class AekoConnection {
  constructor(rpcUrl: string)
  getBalance(pubkey: string): Promise<number>
  getAccountInfo(pubkey: string): Promise<AccountInfo | null>
  getProgramAccounts(programId: string, filters?): Promise<ProgramAccount[]>
  sendTransaction(signedTx: Uint8Array): Promise<string>  // returns signature
  confirmTransaction(signature: string): Promise<boolean>
}
```

**`keypair.ts`**
```ts
export class AekoKeypair {
  static generate(): AekoKeypair
  static fromSecretKey(secretKey: Uint8Array): AekoKeypair
  static fromMnemonic(mnemonic: string): AekoKeypair
  get publicKey(): string
  get secretKey(): Uint8Array
  sign(message: Uint8Array): Uint8Array
  toMnemonic(): string
}
```

**`transaction.ts`**
```ts
export class AekoTransaction {
  add(instruction: Instruction): AekoTransaction
  sign(keypair: AekoKeypair): SignedTransaction
}

export async function sendAndConfirm(
  connection: AekoConnection,
  tx: AekoTransaction,
  signers: AekoKeypair[]
): Promise<string>
```

### Borsh serialization

Match the exact structs from each program's `state.rs`. The critical types to implement:

| On-chain type | Program | Fields to serialize |
|--------------|---------|-------------------|
| `Aeko721Token` | `token-721` | token_id, owner, creator, royalty_bps, metadata, frozen |
| `Aeko721Collection` | `token-721` | authority, name, symbol, total_minted |
| `PostAnchor` | `social-posts` | post_id, creator, content_hash, content_uri, post_kind, visibility, nft_token_id |
| `MarketplaceListing` | `nft-marketplace` | listing_id, seller, token_id, price_atomic, royalty_bps, creator, state |
| `MarketplaceOffer` | `nft-marketplace` | offer_id, listing_id, buyer, offer_price_atomic, state |
| `DelegatePermission` | `wallet-permissions` | delegate, role, spend_limit, program_allowlist |

### Program ID constants

```ts
// sdk/js/src/programs/ids.ts
export const PROGRAM_IDS = {
  TOKEN_721:       "...",  // from programs/token-721/src/lib.rs
  SOCIAL_POSTS:    "...",  // from programs/social-posts/src/lib.rs
  NFT_MARKETPLACE: "...",  // from programs/nft-marketplace/src/lib.rs (once created)
  WALLET_PERMS:    "...",  // from programs/wallet-permissions/src/lib.rs
  MONETIZATION:    "...",  // from programs/social-monetization/src/lib.rs
}
```

### Explorer API client

Read-only. No signing needed. Both apps use this for display data.

```ts
// sdk/js/src/explorer.ts
export class AekoExplorer {
  constructor(explorerUrl: string)  // http://host:8088
  getBlocks(limit?: number)
  getBlock(slot: number)
  getTransaction(signature: string)
  getNft(tokenId: string)
  listNfts(filters?: { owner?, collection?, creator? })
  getPost(postId: string)
  listPosts(filters?: { creator?, visibility?, postKind? })
  getCreatorProfile(address: string)
  getAccountDetail(address: string)
  search(query: string)
}
```

---

## Step 2 — Two On-Chain Additions

### 2.1 `MintPostAsNft` instruction (small addition to existing program)

**File:** `programs/social-posts/src/instruction.rs`

Add one variant to the existing instruction enum:

```rust
pub enum SocialPostsInstruction {
    // ... existing variants unchanged ...
    MintPostAsNft {
        post_id: [u8; 32],
        collection: Pubkey,   // which Aeko721Collection to mint into
        token_id: u64,        // the NFT token ID to assign
        royalty_bps: u16,     // creator's royalty on secondary sales
    },
}
```

**File:** `programs/social-posts/src/state.rs`

Add one field to `PostAnchor`:

```rust
pub struct PostAnchor {
    // ... existing fields unchanged ...
    pub nft_token_id: Option<u64>,  // None = not minted as NFT
}
```

**Processor logic:**
1. Load post, verify signer = `post.creator`
2. Verify `post.nft_token_id.is_none()` (can only mint once)
3. CPI → `token-721` `MintNft` with:
   - `metadata.uri = post.content_uri`
   - `metadata.name` derived from `post_id`
   - `creator = post.creator`
   - `owner = post.creator` (creator owns it initially)
   - `royalty_bps` from instruction
4. Write `nft_token_id` back to `PostAnchor`

### 2.2 New `programs/nft-marketplace/` program

**File structure:**
```
programs/nft-marketplace/
  Cargo.toml
  src/
    lib.rs
    error.rs
    state.rs
    instruction.rs
    processor.rs
```

**State (`state.rs`):**

```rust
pub struct MarketplaceConfig {
    pub authority: Pubkey,
    pub fee_bps: u16,           // platform fee (e.g. 200 = 2%)
    pub fee_destination: Pubkey,
    pub is_initialized: bool,
}

pub struct MarketplaceListing {
    pub listing_id: [u8; 32],
    pub seller: Pubkey,
    pub collection: Pubkey,
    pub token_id: u64,
    pub price_atomic: u64,      // in AEKO lamports
    pub royalty_bps: u16,       // copied from Aeko721Token at list time
    pub creator: Pubkey,        // royalty recipient
    pub listed_at_slot: u64,
    pub expires_at_slot: Option<u64>,
    pub state: ListingState,
}

pub enum ListingState { Active, Sold, Cancelled, Expired }

pub struct MarketplaceOffer {
    pub offer_id: [u8; 32],
    pub listing_id: [u8; 32],
    pub buyer: Pubkey,
    pub offer_price_atomic: u64,
    pub expires_at_slot: u64,
    pub state: OfferState,
}

pub enum OfferState { Pending, Accepted, Rejected, Expired }
```

**Instructions (`instruction.rs`):**

```rust
pub enum MarketplaceInstruction {
    Initialize { config: MarketplaceConfig },
    ListNft    { listing: MarketplaceListing },
    DelistNft  { listing_id: [u8; 32] },
    BuyNft     { listing_id: [u8; 32] },
    MakeOffer  { offer: MarketplaceOffer },
    AcceptOffer { offer_id: [u8; 32] },
    RejectOffer { offer_id: [u8; 32] },
}
```

**`BuyNft` payment split:**
```
buyer pays: price_atomic
  → royalty  = price × royalty_bps / 10_000   → creator
  → fee      = price × fee_bps / 10_000       → fee_destination (treasury)
  → proceeds = price - royalty - fee           → seller
  → CPI into token-721: TransferNft seller → buyer
  → listing.state = Sold
```

**Add to workspace** in root `Cargo.toml`:
```toml
"programs/nft-marketplace",
```

---

## Step 3 — Integration in the Apps

Both apps (Next.js web, React Native mobile) do the same thing: install `@aeko/sdk` and use it.

### 3.1 Wallet

**What to build in each app:**

| Feature | What it does |
|---------|-------------|
| Create wallet | `AekoKeypair.generate()` → encrypt with PIN → store |
| Import wallet | `AekoKeypair.fromMnemonic()` or `fromSecretKey()` → encrypt → store |
| Export wallet | Decrypt → show mnemonic + QR |
| Balance | `connection.getBalance(publicKey)` |
| Send AEKO | Build transfer tx → sign → `sendAndConfirm()` |
| Receive | Show public key as QR code |
| Transaction history | `explorer.getAccountDetail(address).recent_transactions` |
| Owned NFTs | `explorer.listNfts({ owner: address })` |
| Delegate access | Build `wallet-permissions` `GrantPermission` tx → sign |

**Key storage:**
- **Next.js:** AES-GCM encrypt secret key with PIN → `localStorage` (or `sessionStorage` for extra safety)
- **React Native:** `expo-secure-store` (iOS Keychain / Android Keystore) — the PIN encrypts the key, the encrypted blob goes into secure storage

**Never store plaintext secret keys.**

### 3.2 NFT

| Feature | SDK call | Chain call |
|---------|----------|-----------|
| View owned NFTs | `explorer.listNfts({ owner })` | Read-only |
| NFT detail | `explorer.getNft(tokenId)` | Read-only |
| Collection | `explorer.getCollection(id)` | Read-only |
| Mint NFT | `programs.token721.buildMintNft(...)` | `token-721` MintNft |
| Transfer NFT | `programs.token721.buildTransferNft(...)` | `token-721` TransferNft |

### 3.3 Post-to-NFT

Triggered from any post where `connected wallet === post.creator` and `post.nft_token_id === null`.

**Flow:**
1. User taps "Mint as NFT" on their post
2. App shows: royalty % input, collection selector (or create new)
3. App calls `programs.socialPosts.buildMintPostAsNft(postId, collection, tokenId, royaltyBps)`
4. User signs → `sendAndConfirm()`
5. On success: show NFT detail, offer "List for Sale" shortcut

### 3.4 NFT Marketplace

| Feature | SDK call | Chain call |
|---------|----------|-----------|
| Browse listings | `explorer.listNfts({ listed: true })` or direct RPC | Read-only |
| Listing detail | Direct RPC `getProgramAccounts` on marketplace | Read-only |
| List NFT for sale | `programs.marketplace.buildListNft(...)` | `nft-marketplace` ListNft |
| Delist | `programs.marketplace.buildDelistNft(listingId)` | `nft-marketplace` DelistNft |
| Buy now | `programs.marketplace.buildBuyNft(listingId)` | `nft-marketplace` BuyNft |
| Make offer | `programs.marketplace.buildMakeOffer(...)` | `nft-marketplace` MakeOffer |
| Accept offer | `programs.marketplace.buildAcceptOffer(offerId)` | `nft-marketplace` AcceptOffer |

---

## Sprint Plan

### Sprint 1 — `@aeko/sdk` (1–2 weeks)
- [ ] Create `sdk/js/` as an npm package
- [ ] `AekoConnection` — RPC wrapper
- [ ] `AekoKeypair` — keygen, import, sign
- [ ] `AekoTransaction` — build, sign, send, confirm
- [ ] `AekoExplorer` — REST client for :8088
- [ ] Borsh serializers for `Aeko721Token`, `PostAnchor`
- [ ] Transaction builders: `token721`, `socialPosts`, `monetization`
- [ ] Publish as `@aeko/sdk` (npm or private registry)

### Sprint 2 — On-chain additions (1 week)
- [ ] Add `nft_token_id` field to `PostAnchor` state
- [ ] Add `MintPostAsNft` instruction + processor (with token-721 CPI)
- [ ] Scaffold and implement `programs/nft-marketplace/`
- [ ] Add marketplace program to workspace `Cargo.toml`
- [ ] Write program tests
- [ ] Add `marketplace.ts` builders to `@aeko/sdk`
- [ ] Deploy both to testnet

### Sprint 3 — Wallet integration (1 week)
- [ ] Install `@aeko/sdk` in both apps
- [ ] Wallet context / provider (web + mobile)
- [ ] Create, import, export wallet
- [ ] Send, receive, balance
- [ ] Transaction history screen
- [ ] NFT gallery in wallet

### Sprint 4 — NFT + Post-to-NFT (1 week)
- [ ] NFT detail screen with owner actions (transfer, list, convert)
- [ ] Mint NFT flow
- [ ] Post detail: "Mint as NFT" button for creators
- [ ] Post-to-NFT flow (royalty input → sign → confirm)

### Sprint 5 — NFT Marketplace (1–2 weeks)
- [ ] Marketplace browse screen (grid, filters)
- [ ] Listing detail (buy, make offer)
- [ ] List NFT for sale flow
- [ ] Offer management (incoming offers, accept/reject)
- [ ] Add marketplace listings to explorer API (extend `explorer-backend/`)

---

## Notes

- The explorer backend (`explorer-backend/`) currently has no concept of marketplace listings. In Sprint 5, extend the `IndexSink` and `ExplorerReadStore` traits to index `MarketplaceListing` accounts so listings appear in the explorer API and both apps can query them without hitting `getProgramAccounts` directly.
- Royalties are enforced **on-chain inside the marketplace program** — direct `TransferNft` calls (wallet-to-wallet) do not pay royalties. This is expected behavior; make it visible in the UI.
- The `@aeko/sdk` package is the single source of truth for program IDs and Borsh schemas. Any time a program is updated, the SDK must be updated and re-published before the apps pick up the change.
