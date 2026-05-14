# AEKO Frontend Developer Guide
### Wallet · NFT · NFT Marketplace · Post-to-NFT · Rewards & Staking

> **Apps:** Aeko Social web (Next.js) + mobile (React Native) + backend (Express.js)
> **Chain repo:** `aeko-chain` | **Apps:** separate repos

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Web App        │     │  Mobile App     │
│  (Next.js)      │     │  (React Native) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └──────────┬────────────┘
                    │  HTTP (JWT auth)
                    ▼
         ┌──────────────────────┐
         │  Aeko Social Backend │
         │  (Express.js)        │
         │                      │
         │  Already handles:    │
         │  - Auth / JWT        │
         │  - Post APIs         │
         │  - User profiles     │
         │                      │
         │  Add:                │
         │  - Chain reads       │
         │  - Tx preparation    │
         │  - Signature verify  │
         └────────┬─────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
 AEKO RPC (:8899)    Explorer API (:8088)
 (submit txs,        (read blocks, NFTs,
  fetch accounts)     posts, profiles)
```

### The rule

| Action | Who does it |
|--------|-------------|
| Read data from chain | Backend calls Explorer API / RPC → returns to app |
| Build a transaction | Backend prepares unsigned transaction → sends to app |
| Sign a transaction | App signs with the user's keypair (private key never leaves device) |
| Submit a transaction | App submits signed tx directly to RPC OR sends to backend to forward |
| Verify post signatures | Backend calls chain, caches result |
| Auth, rate limits, spam | Backend enforces before touching chain |

The frontend apps **never call the chain RPC directly**. All chain interaction goes through the Express backend, except the final transaction submit which can go direct to RPC from the client.

---

## What to Add to the Express Backend

The backend already handles auth, posts, and profiles. Add these new route groups:

```
/api/wallet/*       → balance, transaction history
/api/nfts/*         → list, detail, collection, prepare-mint tx
/api/marketplace/*  → listings, prepare-list tx, prepare-buy tx
/api/posts/*        → extend existing: add on-chain verification, prepare mint-as-nft tx
/api/sign/*         → verify post signatures on-chain
```

---

## Part 1 — Install `@aeko/sdk` in the Backend

The SDK is built once and used by the backend. The frontend apps do not call the chain directly.

```bash
# In your Express backend repo
npm install @aeko/sdk
```

Also install:
```bash
npm install @solana/web3.js borsh bs58 @noble/ed25519
```

### Backend SDK setup

```ts
// src/chain/client.ts
import { AekoConnection, AekoExplorer, PROGRAM_IDS } from "@aeko/sdk";

const RPC_URL      = process.env.AEKO_RPC_URL      ?? "http://localhost:8899";
const EXPLORER_URL = process.env.AEKO_EXPLORER_URL ?? "http://localhost:8088";
vscode-webview://0lpmu6jgpekcugb1rc5h5s1si42vju3eau5deci7bhga21soqcea/index.html?id=00e57bbc-5173-4743-9bd0-d6ea77c4ef4a&parentId=4&origin=7aa79b5a-8f10-4aab-bf6a-596587b300d8&swVersion=5&extensionId=Anthropic.claude-code&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView&session=7de6ad09-2255-48f4-af63-7a86e4f0488c#
export const connection = new AekoConnection(RPC_URL);
export const explorer   = new AekoExplorer(EXPLORER_URL);
```

Add to `.env`:
```
AEKO_RPC_URL=https://api.testnet.aeko.chain
AEKO_EXPLORER_URL=https://explorer-api.testnet.aeko.chain
```

---

## Part 2 — Wallet Endpoints

Add these routes to the backend. The apps call these instead of the chain directly.

### `GET /api/wallet/:address/balance`

```ts
// src/routes/wallet.ts
router.get("/:address/balance", async (req, res) => {
  const { address } = req.params;
  const lamports = await connection.getBalance(address);
  res.json({
    address,
    lamports,
    aeko: lamports / 1_000_000_000,
  });
});
```

### `GET /api/wallet/:address/history`

```ts
router.get("/:address/history", async (req, res) => {
  const { address } = req.params;
  const limit = Number(req.query.limit) || 20;
  const data = await explorer.getAccountDetail(address);
  res.json({
    transactions: data.recentTransactions.slice(0, limit),
    posts: data.recentPosts,
    stakes: data.socialStakes,
    rewards: data.creatorRewards,
  });
});
```

### `GET /api/wallet/:address/nfts`

```ts
router.get("/:address/nfts", async (req, res) => {
  const { address } = req.params;
  const nfts = await explorer.listNfts({ owner: address });
  res.json({ nfts });
});
```

### `POST /api/wallet/prepare-transfer`

The backend prepares an unsigned transaction. The app signs it and submits it.

```ts
router.post("/prepare-transfer", requireAuth, async (req, res) => {
  const { from, to, amountAeko } = req.body;
  const lamports = Math.floor(amountAeko * 1_000_000_000);

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildTransferAeko(from, to, lamports);
  const txBase64 = serializeUnsignedTransaction([instruction], from, blockhash);

  res.json({ txBase64, blockhash });
});
```

> `serializeUnsignedTransaction` — see helper in Part 7 below.

---

## Part 3 — NFT Endpoints

### `GET /api/nfts`

```ts
router.get("/", async (req, res) => {
  const { owner, collection, creator, limit } = req.query;
  const nfts = await explorer.listNfts({
    owner:      owner      as string,
    collection: collection as string,
    creator:    creator    as string,
    limit:      Number(limit) || 25,
  });
  res.json({ nfts });
});
```

### `GET /api/nfts/:tokenId`

```ts
router.get("/:tokenId", async (req, res) => {
  const nft = await explorer.getNft(req.params.tokenId);
  if (!nft) return res.status(404).json({ error: "NFT not found" });
  res.json({ nft });
});
```

### `GET /api/nfts/collections/:collectionId`

```ts
router.get("/collections/:collectionId", async (req, res) => {
  const collection = await explorer.getCollection(req.params.collectionId);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  res.json({ collection });
});
```

### `POST /api/nfts/prepare-mint`

The backend validates eligibility and builds the unsigned transaction. The app signs and submits.

```ts
router.post("/prepare-mint", requireAuth, async (req, res) => {
  const { creator, collectionAccount, tokenId, royaltyBps, metadata } = req.body;

  // Generate a new account address for the token
  const tokenKeypair = AekoKeypair.generate();

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildMintNft(collectionAccount, tokenKeypair.publicKey, creator, {
    tokenId,
    owner: creator,
    creator,
    royaltyBps,
    metadata,
  });

  const txBase64 = serializeUnsignedTransaction([instruction], creator, blockhash);

  // Return unsigned tx AND the token account keypair (app must include it as a signer)
  res.json({
    txBase64,
    tokenAccount: tokenKeypair.publicKey,
    tokenAccountSecretKey: Array.from(tokenKeypair.secretKey), // app uses this to co-sign
  });
});
```

### `POST /api/nfts/prepare-transfer`

```ts
router.post("/prepare-transfer", requireAuth, async (req, res) => {
  const { collectionAccount, tokenAccount, currentOwner, newOwner } = req.body;

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildTransferNft(collectionAccount, tokenAccount, currentOwner, newOwner);
  const txBase64 = serializeUnsignedTransaction([instruction], currentOwner, blockhash);

  res.json({ txBase64 });
});
```

---

## Part 4 — Post Signature & On-Chain Verification

This is **Ticket 6.2** — the core integration between the social app and the chain.

### How it works

When a user creates a post:
1. App sends post to backend (existing flow)
2. Backend hashes the content → signs the hash → anchors it on-chain via `social-posts` program
3. Backend returns the on-chain `postId` and `signature` to the app
4. App stores and displays the "verified" badge

When anyone views a post:
1. App asks backend to verify the post signature
2. Backend queries the chain, confirms the `PostAnchor` exists with matching `contentHash`
3. Returns `verified: true/false`

### `POST /api/posts/:postId/anchor`

Call this after creating a post to anchor it on-chain. This requires a **service keypair** on the backend (funded with a small AEKO balance for tx fees).

```ts
// src/chain/service-keypair.ts
import { AekoKeypair } from "@aeko/sdk";

// Load the service wallet from env — this pays for anchoring transactions
const secretKeyBytes = Uint8Array.from(
  JSON.parse(process.env.AEKO_SERVICE_KEYPAIR ?? "[]")
);
export const serviceKeypair = AekoKeypair.fromSecretKey(secretKeyBytes);
```

```ts
// src/routes/posts.ts
router.post("/:postId/anchor", requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { contentUri, contentHash, creatorAddress } = req.body;

  // contentHash must be sha256 of the post content — compute this server-side
  const post = {
    postId:       hexToBytes(postId),             // 32 bytes
    creator:      creatorAddress,
    contentHash:  hexToBytes(contentHash),        // 32 bytes — sha256 of content
    metadataHash: hexToBytes(contentHash),        // same for now
    contentUri,
    postKind:     "Original",
    visibility:   "Public",
    createdAtUnix: Math.floor(Date.now() / 1000),
  };

  const instruction = buildAnchorPost(
    SOCIAL_POSTS_STATE_ACCOUNT,  // the deployed state account address
    creatorAddress,
    post
  );

  // Service keypair pays the fee; creator must also sign (if required by program)
  // Option A: service keypair signs alone (simpler — program must allow this)
  // Option B: prepare unsigned tx, send to client to sign, then submit
  // --> Use Option A for backend-initiated anchoring

  const signature = await sendAndConfirm(connection, [instruction], [serviceKeypair]);

  // Store signature in your database against the postId
  await db.posts.update({ postId }, { onChainSignature: signature, isAnchored: true });

  res.json({ signature, anchored: true });
});
```

### `GET /api/posts/:postId/verify`

```ts
router.get("/:postId/verify", async (req, res) => {
  const { postId } = req.params;

  // Check your DB first (cached)
  const post = await db.posts.findOne({ postId });
  if (!post?.isAnchored) {
    return res.json({ verified: false, reason: "not anchored" });
  }

  // Optionally confirm on-chain in real time
  const onChain = await explorer.getPost(postId);
  if (!onChain) {
    return res.json({ verified: false, reason: "not found on chain" });
  }

  res.json({
    verified: true,
    postId,
    contentUri: onChain.contentUri,
    creator: onChain.creator,
    createdAtUnix: onChain.createdAtUnix,
    onChainSignature: post.onChainSignature,
  });
});
```

### `POST /api/posts/:postId/prepare-mint-nft`

> Requires chain team to deploy `MintPostAsNft` instruction first.

```ts
router.post("/:postId/prepare-mint-nft", requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { royaltyBps, collectionAccount } = req.body;
  const creatorAddress = req.user.walletAddress; // from JWT

  // Verify post belongs to this user
  const post = await db.posts.findOne({ postId, creator: creatorAddress });
  if (!post) return res.status(403).json({ error: "not your post" });
  if (post.nftTokenId) return res.status(400).json({ error: "already minted as NFT" });

  const tokenKeypair = AekoKeypair.generate();
  const blockhash = await connection.getRecentBlockhash();

  const instruction = buildMintPostAsNft(
    SOCIAL_POSTS_STATE_ACCOUNT,
    creatorAddress,
    collectionAccount,
    tokenKeypair.publicKey,
    {
      postId:    hexToBytes(postId),
      tokenId:   await getNextTokenId(collectionAccount),
      royaltyBps,
    }
  );

  const txBase64 = serializeUnsignedTransaction([instruction], creatorAddress, blockhash);

  res.json({
    txBase64,
    tokenAccount: tokenKeypair.publicKey,
    tokenAccountSecretKey: Array.from(tokenKeypair.secretKey),
  });
});
```

---

## Part 5 — Marketplace Endpoints

> Requires chain team to deploy `nft-marketplace` program first.

### `GET /api/marketplace/listings`

```ts
router.get("/listings", async (req, res) => {
  const { seller, collection, minPrice, maxPrice, limit } = req.query;

  // Until explorer indexes listings, read from RPC directly
  const accounts = await connection.getProgramAccounts(PROGRAM_IDS.NFT_MARKETPLACE);
  let listings = accounts
    .map(({ account }) => deserializeListing(base64ToBytes(account.data)))
    .filter((l) => l.state === "Active");

  if (seller)    listings = listings.filter((l) => l.seller === seller);
  if (collection) listings = listings.filter((l) => l.collection === collection);
  if (minPrice)  listings = listings.filter((l) => l.priceAeko >= Number(minPrice));
  if (maxPrice)  listings = listings.filter((l) => l.priceAeko <= Number(maxPrice));

  res.json({ listings: listings.slice(0, Number(limit) || 25) });
});
```

### `POST /api/marketplace/prepare-list`

```ts
router.post("/prepare-list", requireAuth, async (req, res) => {
  const { collectionAccount, tokenAccount, priceAeko, expiresInDays } = req.body;
  const seller = req.user.walletAddress;

  const listingKeypair = AekoKeypair.generate();
  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildListNft({
    listingAccount: listingKeypair.publicKey,
    seller,
    collectionAccount,
    tokenAccount,
    priceAeko,
    expiresInSlots: expiresInDays ? expiresInDays * 24 * 3600 * 2.5 : null,
  });

  const txBase64 = serializeUnsignedTransaction([instruction], seller, blockhash);

  res.json({
    txBase64,
    listingAccount: listingKeypair.publicKey,
    listingAccountSecretKey: Array.from(listingKeypair.secretKey),
  });
});
```

### `POST /api/marketplace/prepare-buy`

```ts
router.post("/prepare-buy", requireAuth, async (req, res) => {
  const { listingId } = req.body;
  const buyer = req.user.walletAddress;

  // Fetch listing from chain to get seller, creator, royaltyBps
  const listing = await fetchListing(listingId);
  if (!listing || listing.state !== "Active") {
    return res.status(400).json({ error: "listing not available" });
  }

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildBuyNft({
    listingAccount:  listingId,
    buyer,
    seller:          listing.seller,
    creator:         listing.creator,
    feeDestination:  TREASURY_ADDRESS,
  });

  const txBase64 = serializeUnsignedTransaction([instruction], buyer, blockhash);

  res.json({
    txBase64,
    breakdown: {
      price:       listing.priceAeko,
      royalty:     (listing.priceAeko * listing.royaltyBps) / 10_000,
      platformFee: (listing.priceAeko * PLATFORM_FEE_BPS) / 10_000,
      sellerGets:  listing.priceAeko - (listing.priceAeko * listing.royaltyBps) / 10_000 - (listing.priceAeko * PLATFORM_FEE_BPS) / 10_000,
    },
  });
});
```

---

## Part 6 — Frontend App Integration

The apps call the backend. Here is the full flow for each feature.

### Wallet setup flow

```
App opens
  └─ hasWallet()?
      ├─ No  → Show "Create Wallet" or "Import Wallet"
      └─ Yes → Show PIN prompt → loadWallet(pin) → store keypair in memory
```

**Create wallet:**
```ts
const mnemonic = AekoKeypair.generateMnemonic();
const keypair  = AekoKeypair.fromMnemonic(mnemonic);
await saveWallet(keypair.secretKey, pin);  // encrypted local storage
showMnemonicScreen(mnemonic);              // user must write it down
```

**Load on app open:**
```ts
const secretKey = await loadWallet(pin);
const keypair   = AekoKeypair.fromSecretKey(secretKey);
// store keypair in WalletContext — never persist after logout
```

### Send AEKO flow

```ts
// 1. App asks backend to prepare the transaction
const { txBase64 } = await api.post("/wallet/prepare-transfer", {
  from: keypair.publicKey,
  to: recipientAddress,
  amountAeko: 10,
});

// 2. App signs it (private key stays on device)
const signedTx = signTransaction(txBase64, keypair);

// 3. App submits directly to RPC (or via backend — both work)
const signature = await connection.sendRawTransaction(signedTx);
await connection.confirmTransaction(signature);
```

### Mint NFT flow

```ts
// 1. Backend prepares the transaction
const { txBase64, tokenAccountSecretKey } = await api.post("/nfts/prepare-mint", {
  creator:           keypair.publicKey,
  collectionAccount: selectedCollection,
  tokenId:           Date.now(),   // or let backend assign
  royaltyBps:        500,
  metadata:          { name, uri, imageUri, attributes },
});

// 2. App signs with both keypairs (user key + new token account key)
const tokenKeypair = AekoKeypair.fromSecretKey(new Uint8Array(tokenAccountSecretKey));
const signedTx = signTransactionMulti(txBase64, [keypair, tokenKeypair]);

// 3. Submit
const signature = await connection.sendRawTransaction(signedTx);
```

### Convert post to NFT flow

```ts
// 1. Backend prepares the transaction (validates creator ownership)
const { txBase64, tokenAccountSecretKey } = await api.post(`/posts/${postId}/prepare-mint-nft`, {
  royaltyBps:        500,
  collectionAccount: selectedCollection,
}, { headers: { Authorization: `Bearer ${jwt}` } });

// 2. Sign
const tokenKeypair = AekoKeypair.fromSecretKey(new Uint8Array(tokenAccountSecretKey));
const signedTx = signTransactionMulti(txBase64, [keypair, tokenKeypair]);

// 3. Submit
const signature = await connection.sendRawTransaction(signedTx);
```

### Buy NFT flow

```ts
// 1. Backend prepares transaction + returns price breakdown for preview
const { txBase64, breakdown } = await api.post("/marketplace/prepare-buy", {
  listingId,
}, { headers: { Authorization: `Bearer ${jwt}` } });

// 2. Show preview to user
showConfirmation({
  price:       `${breakdown.price} AEKO`,
  royalty:     `${breakdown.royalty} AEKO → creator`,
  platformFee: `${breakdown.platformFee} AEKO → AEKO treasury`,
  youPay:      `${breakdown.price} AEKO`,
});

// 3. User confirms → sign + submit
const signedTx = signTransaction(txBase64, keypair);
const signature = await connection.sendRawTransaction(signedTx);
```

---

## Part 7 — Rewards & AEKO Coin

Both reward programs are fully built on-chain. Here is how they work and how to wire them into the backend and frontend.

### How rewards work (the concept)

```
User posts content
        ↓
Other users like / comment / repost  →  EngagementProof recorded on-chain
        ↓
End of each epoch (every 24 hours)
        ↓
Backend settles the epoch:
  - Tallies engagement points per creator
  - Calculates AEKO reward per creator from the reward pool
  - Records CreatorRewardEpochRecord on-chain
        ↓
Creator sees claimable AEKO balance
        ↓
Creator taps "Claim" → transaction signed → AEKO lands in wallet
```

```
User stakes AEKO on a creator they believe in
        ↓
Backend records yield per stake position each epoch
        ↓
Staker sees claimable yield
        ↓
Staker taps "Claim Yield" → AEKO lands in wallet
        ↓
When done: "Unstake" → cooldown period → "Finalize Unstake" → AEKO returned
```

---

### Backend — Rewards Endpoints

#### `GET /api/rewards/:address`

Returns the creator's claimable reward balance and epoch history.

```ts
router.get("/:address", async (req, res) => {
  const { address } = req.params;

  // Read from explorer API (already indexes CreatorRewardRecord)
  const profile = await explorer.getCreatorProfile(address);

  res.json({
    address,
    totalEarned:    profile.totalRewardsEarned,    // lifetime AEKO earned
    totalClaimable: profile.totalClaimableRewards, // available to claim now
    recentEpochs:   profile.recentRewards,         // per-epoch breakdown
  });
});
```

Explorer returns amounts in lamports. Convert to AEKO with `/ 1_000_000_000`.

#### `POST /api/rewards/prepare-claim`

Creator signs to pull claimable AEKO into their wallet.

```ts
router.post("/prepare-claim", requireAuth, async (req, res) => {
  const { amount } = req.body;           // amount in AEKO (not lamports)
  const creator = req.user.walletAddress;

  // Validate: check claimable balance is >= requested amount
  const profile = await explorer.getCreatorProfile(creator);
  const claimableLamports = profile.totalClaimableRewards;
  const requestedLamports = Math.floor(amount * 1_000_000_000);

  if (requestedLamports > claimableLamports) {
    return res.status(400).json({ error: "amount exceeds claimable balance" });
  }

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildClaimCreatorReward(
    SOCIAL_REWARDS_STATE_ACCOUNT,
    REWARD_VAULT_ACCOUNT,     // the vault holding reward AEKO
    creator,                  // destination wallet
    creator,                  // authority (creator signs)
    requestedLamports,
  );

  const txBase64 = serializeUnsignedTransaction([instruction], creator, blockhash);
  res.json({ txBase64, amountAeko: amount, amountLamports: requestedLamports });
});
```

#### `POST /api/rewards/settle-epoch` (backend cron job — not user-facing)

The backend automatically settles rewards each epoch. This is not triggered by users — run it as a scheduled job.

```ts
// src/jobs/settle-epoch.ts  — run every 24 hours
import cron from "node-cron";

cron.schedule("0 0 * * *", async () => {
  const currentEpoch = await getCurrentEpoch();

  // 1. Fetch engagement events from the explorer for this epoch
  const events = await explorer.listEngagementEvents({ epoch: currentEpoch });

  // 2. Calculate points per creator
  const creatorPoints = aggregateEngagementPoints(events);

  // 3. Calculate reward amounts from the pool
  const rewardPool = await getEpochRewardPool(currentEpoch); // from tokenomics program
  const creatorEntries = distributeRewards(creatorPoints, rewardPool);

  // 4. Call SettleRewardEpoch on-chain — service keypair signs
  const instruction = buildSettleRewardEpoch(
    SOCIAL_REWARDS_STATE_ACCOUNT,
    serviceKeypair.publicKey,
    { epoch: currentEpoch, rewardPoolAmount: rewardPool, creatorEntries }
  );
  await sendAndConfirm(connection, [instruction], [serviceKeypair]);

  console.log(`Epoch ${currentEpoch} settled — ${creatorEntries.length} creators rewarded`);
});
```

---

### Backend — Staking Endpoints

#### `GET /api/staking/:address/positions`

```ts
router.get("/:address/positions", async (req, res) => {
  const { address } = req.params;

  // Explorer already indexes SocialStakeRecord
  const stakes = await explorer.listSocialStakes({ wallet: address });

  res.json({
    positions: stakes.map((s) => ({
      positionId:        s.positionId,
      creator:           s.creator,
      stakedAmount:      s.stakedAmount / 1_000_000_000,   // convert to AEKO
      state:             s.state,                           // "active" | "coolingDown" | "closed"
      accumulatedYield:  s.accumulatedYield / 1_000_000_000,
      claimedYield:      s.claimedYield / 1_000_000_000,
      claimableYield:    (s.accumulatedYield - s.claimedYield) / 1_000_000_000,
    })),
    totalStaked: stakes
      .filter((s) => s.state === "active")
      .reduce((sum, s) => sum + s.stakedAmount, 0) / 1_000_000_000,
  });
});
```

#### `POST /api/staking/prepare-open`

User stakes AEKO on a creator.

```ts
router.post("/prepare-open", requireAuth, async (req, res) => {
  const { creatorAddress, amountAeko } = req.body;
  const staker = req.user.walletAddress;

  const stakedLamports = Math.floor(amountAeko * 1_000_000_000);

  // Check staker balance
  const balance = await connection.getBalance(staker);
  if (stakedLamports > balance) {
    return res.status(400).json({ error: "insufficient balance" });
  }

  // Generate a unique position ID
  const positionId = crypto.randomBytes(32);
  const currentEpoch = await getCurrentEpoch();

  const position = {
    positionId:       Array.from(positionId),
    staker,
    creator:          creatorAddress,
    stakedAmount:     stakedLamports,
    activatedAtEpoch: currentEpoch,
    unlockEpoch:      null,
    accumulatedYield: 0,
    claimedYield:     0,
    state:            "Active",
  };

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildOpenPosition(
    SOCIAL_STAKING_STATE_ACCOUNT,
    staker,
    position,
  );

  const txBase64 = serializeUnsignedTransaction([instruction], staker, blockhash);
  res.json({ txBase64, positionId: positionId.toString("hex") });
});
```

#### `POST /api/staking/prepare-claim-yield`

Staker claims earned yield from a stake position.

```ts
router.post("/prepare-claim-yield", requireAuth, async (req, res) => {
  const { positionId } = req.body;
  const staker = req.user.walletAddress;

  const stakes = await explorer.listSocialStakes({ wallet: staker });
  const position = stakes.find((s) => s.positionId === positionId);
  if (!position) return res.status(404).json({ error: "position not found" });

  const claimableLamports = position.accumulatedYield - position.claimedYield;
  if (claimableLamports <= 0) {
    return res.status(400).json({ error: "no yield to claim" });
  }

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildClaimStakeYield(
    SOCIAL_STAKING_STATE_ACCOUNT,
    staker,
    hexToBytes(positionId),
    claimableLamports,
  );

  const txBase64 = serializeUnsignedTransaction([instruction], staker, blockhash);
  res.json({
    txBase64,
    claimableAeko: claimableLamports / 1_000_000_000,
  });
});
```

#### `POST /api/staking/prepare-unstake`

Begin the cooldown period to unstake.

```ts
router.post("/prepare-unstake", requireAuth, async (req, res) => {
  const { positionId } = req.body;
  const staker = req.user.walletAddress;

  const currentEpoch = await getCurrentEpoch();
  const cooldownEpochs = STAKING_COOLDOWN_EPOCHS; // from chain config, e.g. 7 days = 7 epochs
  const unlockEpoch = currentEpoch + cooldownEpochs;

  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildRequestUnstake(
    SOCIAL_STAKING_STATE_ACCOUNT,
    staker,
    hexToBytes(positionId),
    unlockEpoch,
  );

  const txBase64 = serializeUnsignedTransaction([instruction], staker, blockhash);
  res.json({ txBase64, unlockEpoch, cooldownDays: cooldownEpochs });
});
```

#### `POST /api/staking/prepare-finalize-unstake`

After cooldown, return AEKO to the staker's wallet.

```ts
router.post("/prepare-finalize-unstake", requireAuth, async (req, res) => {
  const { positionId } = req.body;
  const staker = req.user.walletAddress;

  const currentEpoch = await getCurrentEpoch();
  const blockhash = await connection.getRecentBlockhash();
  const instruction = buildFinalizeUnstake(
    SOCIAL_STAKING_STATE_ACCOUNT,
    staker,
    hexToBytes(positionId),
    currentEpoch,
  );

  const txBase64 = serializeUnsignedTransaction([instruction], staker, blockhash);
  res.json({ txBase64 });
});
```

---

### Frontend — Rewards & Staking UI

#### Rewards screen (creator view)

```
┌─────────────────────────────────────┐
│  My Rewards                         │
│                                     │
│  Claimable                          │
│  ┌─────────────────────────────┐    │
│  │  1,240.50 AEKO              │    │
│  │  ≈ $124.05                  │    │
│  │  [Claim All]                │    │
│  └─────────────────────────────┘    │
│                                     │
│  This Epoch (in progress)           │
│  Engagement score: 8,420 pts        │
│  Estimated reward: ~42 AEKO         │
│                                     │
│  Epoch History                      │
│  Epoch 182  →  320.00 AEKO  Claimed │
│  Epoch 181  →  280.50 AEKO  Claimed │
│  Epoch 180  →  640.00 AEKO  Claimed │
└─────────────────────────────────────┘
```

How to build it:
```ts
// Fetch rewards data
const { data } = await api.get(`/rewards/${publicKey}`);

// Display claimable
display(data.totalClaimable / 1e9, "AEKO");

// Claim button
async function claimRewards(amountAeko) {
  const { txBase64 } = await api.post("/rewards/prepare-claim", { amount: amountAeko });
  const signedTx = signTransaction(txBase64, keypair);
  const sig = await connection.sendRawTransaction(signedTx);
  await connection.confirmTransaction(sig);
  toast("Rewards claimed!");
  refreshBalance();
}
```

#### Staking screen (for any user)

```
┌─────────────────────────────────────┐
│  My Stakes                          │
│                                     │
│  Total Staked:  500 AEKO            │
│  Total Yield:   12.4 AEKO claimable │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  @creator_name               │   │
│  │  Staked: 300 AEKO  Active    │   │
│  │  Yield:  8.2 AEKO            │   │
│  │  [Claim Yield] [Unstake]     │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  @another_creator            │   │
│  │  Staked: 200 AEKO  Cooling   │   │
│  │  Unlocks in: 4 days          │   │
│  │  [Finalize Unstake] (greyed) │   │
│  └──────────────────────────────┘   │
│                                     │
│  [Stake on a Creator +]             │
└─────────────────────────────────────┘
```

How to build the stake button (shown on creator profiles):

```tsx
function StakeButton({ creatorAddress }) {
  const { keypair, publicKey } = useWallet();

  async function stake(amountAeko: number) {
    const { txBase64 } = await api.post("/staking/prepare-open", {
      creatorAddress,
      amountAeko,
    }, { headers: { Authorization: `Bearer ${jwt}` } });

    const signedTx = signTransaction(txBase64, keypair);
    const sig = await connection.sendRawTransaction(signedTx);
    await connection.confirmTransaction(sig);
    toast(`Staked ${amountAeko} AEKO on this creator!`);
  }

  return <button onClick={() => openStakeModal(creatorAddress, stake)}>Stake AEKO</button>;
}
```

Unstake flow:
```ts
// Step 1 — request unstake (starts cooldown)
async function requestUnstake(positionId) {
  const { txBase64, cooldownDays } = await api.post("/staking/prepare-unstake", { positionId });
  const signedTx = signTransaction(txBase64, keypair);
  await connection.sendRawTransaction(signedTx);
  toast(`Unstaking in ${cooldownDays} days`);
}

// Step 2 — finalize (only available after cooldown — button is greyed until then)
async function finalizeUnstake(positionId) {
  const { txBase64 } = await api.post("/staking/prepare-finalize-unstake", { positionId });
  const signedTx = signTransaction(txBase64, keypair);
  await connection.sendRawTransaction(signedTx);
  toast("AEKO returned to your wallet!");
}
```

---

### Add to environment variables (backend)

```env
SOCIAL_REWARDS_STATE_ACCOUNT=...    # deployed social-rewards state account address
REWARD_VAULT_ACCOUNT=...            # vault that holds AEKO for creator payouts
SOCIAL_STAKING_STATE_ACCOUNT=...    # deployed social-staking state account address
STAKING_COOLDOWN_EPOCHS=7           # 7-day cooldown before unstake finalizes
```

---

## Part 8 — Helper Functions

Add these to the backend (`src/chain/utils.ts`) and reference them across your route files.

### `serializeUnsignedTransaction`

```ts
import { Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";

export function serializeUnsignedTransaction(
  instructions: TransactionInstruction[],
  feePayer: string,
  recentBlockhash: string
): string {
  const tx = new Transaction();
  tx.feePayer = new PublicKey(feePayer);
  tx.recentBlockhash = recentBlockhash;
  tx.add(...instructions);
  // Serialize without signing
  return tx.serializeMessage().toString("base64");
}
```

### `signTransaction` (in frontend app / SDK)

```ts
import { Transaction } from "@solana/web3.js";

export function signTransaction(txMessageBase64: string, keypair: AekoKeypair): string {
  const message = Buffer.from(txMessageBase64, "base64");
  const signature = keypair.sign(message);
  // Wrap into a full transaction with signature
  const tx = Transaction.populate(
    Message.from(message),
    [Buffer.from(signature).toString("base64")]
  );
  return tx.serialize().toString("base64");
}

export function signTransactionMulti(txMessageBase64: string, keypairs: AekoKeypair[]): string {
  const message = Buffer.from(txMessageBase64, "base64");
  const signatures = keypairs.map((kp) => Buffer.from(kp.sign(message)).toString("base64"));
  const tx = Transaction.populate(Message.from(message), signatures);
  return tx.serialize().toString("base64");
}
```

### `hexToBytes` / `bytesToHex`

```ts
export const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex, "hex"));

export const bytesToHex = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("hex");

export const lamportsToAeko = (lamports: number): number =>
  lamports / 1_000_000_000;

export const aekoToLamports = (aeko: number): number =>
  Math.floor(aeko * 1_000_000_000);
```

---

## Part 8 — Key Storage (Apps)

### Web (Next.js)

```ts
// lib/wallet-storage.ts
const STORAGE_KEY = "aeko_encrypted_wallet";

export async function saveWallet(secretKey: Uint8Array, pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, secretKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    salt: Array.from(salt),
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  }));
}

export async function loadWallet(pin: string): Promise<Uint8Array> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) throw new Error("No wallet found");
  const { salt, iv, data } = JSON.parse(stored);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) }, aesKey, new Uint8Array(data)
  );
  return new Uint8Array(decrypted);
}
```

### Mobile (React Native)

```bash
npx expo install expo-secure-store
```

```ts
// lib/wallet-storage.ts (React Native)
import * as SecureStore from "expo-secure-store";

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function saveWallet(secretKey: Uint8Array, pin: string): Promise<void> {
  // Derive a key from PIN, encrypt secretKey — same AES-GCM logic as web
  // For simplicity shown here with base64; add AES-GCM encryption in production
  const encoded = Buffer.from(secretKey).toString("base64");
  await SecureStore.setItemAsync("aeko_wallet", encoded, OPTIONS);
}

export async function loadWallet(pin: string): Promise<Uint8Array> {
  const encoded = await SecureStore.getItemAsync("aeko_wallet");
  if (!encoded) throw new Error("No wallet found");
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

export async function hasWallet(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync("aeko_wallet"));
}
```

---

## Summary — Build Order

### Step 1 — Backend (chain integration) — start now

- [ ] Add `@aeko/sdk` (or equivalent) to the Express backend
- [ ] Add `AekoConnection` + `AekoExplorer` client setup
- [ ] Add service keypair env var (`AEKO_SERVICE_KEYPAIR`) — funded wallet for fee payments

**Wallet**
- [ ] `GET  /api/wallet/:address/balance`
- [ ] `GET  /api/wallet/:address/history`
- [ ] `GET  /api/wallet/:address/nfts`
- [ ] `POST /api/wallet/prepare-transfer`

**NFTs**
- [ ] `GET  /api/nfts` (proxy to explorer)
- [ ] `GET  /api/nfts/:tokenId`
- [ ] `GET  /api/nfts/collections/:id`
- [ ] `POST /api/nfts/prepare-mint`
- [ ] `POST /api/nfts/prepare-transfer`

**Posts**
- [ ] `POST /api/posts/:postId/anchor` — anchor post on-chain after creation (call this every time a post is created)
- [ ] `GET  /api/posts/:postId/verify` — check on-chain verification status

**Rewards**
- [ ] `GET  /api/rewards/:address` — claimable balance + epoch history
- [ ] `POST /api/rewards/prepare-claim` — prepare claim transaction
- [ ] Set up epoch settlement cron job (runs every 24h automatically)

**Staking**
- [ ] `GET  /api/staking/:address/positions` — user's stake positions
- [ ] `POST /api/staking/prepare-open` — stake AEKO on a creator
- [ ] `POST /api/staking/prepare-claim-yield` — claim earned yield
- [ ] `POST /api/staking/prepare-unstake` — begin unstake cooldown
- [ ] `POST /api/staking/prepare-finalize-unstake` — complete unstake after cooldown

### Step 2 — Frontend (wallet + NFT + rewards) — start after Step 1 routes are live

- [ ] `@aeko/sdk` — `AekoKeypair`, `signTransaction`, `signTransactionMulti`
- [ ] `WalletContext` in both apps (create, import, load, disconnect)
- [ ] Wallet screen: balance, send, receive, history, NFT gallery
- [ ] NFT list screen (calls `GET /api/wallet/:address/nfts`)
- [ ] NFT detail screen (calls `GET /api/nfts/:tokenId`)
- [ ] Mint NFT flow (calls `POST /api/nfts/prepare-mint` → signs → submits)
- [ ] Transfer NFT flow (calls `POST /api/nfts/prepare-transfer` → signs → submits)
- [ ] Post verified badge (calls `GET /api/posts/:postId/verify`)
- [ ] Rewards screen: claimable balance, epoch history, claim button
- [ ] Staking screen: list positions, yield per position, claim yield button
- [ ] Stake-on-creator button on every creator profile page
- [ ] Unstake flow: request → cooldown countdown → finalize

### Step 3 — Post-to-NFT — after chain team deploys `MintPostAsNft`

- [ ] `POST /api/posts/:postId/prepare-mint-nft` on backend
- [ ] "Mint as NFT" button on post detail screen (only shown to post creator)
- [ ] Mint-post-as-nft flow (prepare → sign → submit → show NFT)

### Step 4 — Marketplace — after chain team deploys `nft-marketplace` program

- [ ] `GET  /api/marketplace/listings`
- [ ] `POST /api/marketplace/prepare-list`
- [ ] `POST /api/marketplace/prepare-buy`
- [ ] `POST /api/marketplace/prepare-offer`
- [ ] `POST /api/marketplace/prepare-accept-offer`
- [ ] Marketplace browse screen
- [ ] Listing detail with buy + offer flows
- [ ] "List for Sale" flow from NFT detail screen
- [ ] Offer management screens

---

## Environment Variables Reference

### Express backend

```env
AEKO_RPC_URL=https://api.testnet.aeko.chain
AEKO_EXPLORER_URL=https://explorer-api.testnet.aeko.chain
AEKO_SERVICE_KEYPAIR=[1,2,3,...]    # byte array of service wallet secret key
AEKO_TREASURY_ADDRESS=...           # platform fee destination
AEKO_PLATFORM_FEE_BPS=200           # 2% platform fee on marketplace sales
SOCIAL_POSTS_STATE_ACCOUNT=...      # deployed social-posts state account address
```

### Next.js web app

```env
NEXT_PUBLIC_BACKEND_URL=https://api.aeko.social
NEXT_PUBLIC_AEKO_RPC_URL=https://api.testnet.aeko.chain   # for direct tx submit only
```

### React Native mobile app

```env
EXPO_PUBLIC_BACKEND_URL=https://api.aeko.social
EXPO_PUBLIC_AEKO_RPC_URL=https://api.testnet.aeko.chain
```
