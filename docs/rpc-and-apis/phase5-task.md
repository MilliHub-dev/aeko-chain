# Phase 5 Task Plan

## Scope

Phase 5 covers AEKO Chain's RPC surface, explorer backend, explorer frontend, and the SocialFi-facing API layer needed to power Aeko Social and other application integrations.

This phase is both infrastructure and product delivery. The RPC is the chain's operational interface, the explorer is the public observability layer, and the SocialFi APIs are the application-facing read and write surface for content, rewards, engagement, reputation, and social staking.

This plan combines the new Phase 5 breakdown with the current assumptions already documented in `docs/rpc-and-apis` and `docs/socialfi`.

## Existing Doc Alignment

The current docs already promise several things Phase 5 should preserve and formalize:

- [`docs/rpc-and-apis/rpc-overview.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rpc-overview.md) establishes JSON-RPC as the primary developer interface and already assumes public cluster endpoints
- [`docs/rpc-and-apis/rpc-reference.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rpc-reference.md) already names baseline methods such as `getAccountInfo`, `getBalance`, and `sendTransaction`
- [`docs/rpc-and-apis/websocket.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/websocket.md) already assumes real-time subscriptions for account and log updates
- [`docs/rpc-and-apis/rate-limits.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rate-limits.md) already commits AEKO to tiered public, developer, and partner access rules
- [`docs/rpc-and-apis/explorer-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-api.md) already promises explorer-facing APIs for blocks, transactions, accounts, tokens, NFTs, and posts
- [`docs/socialfi/socialfi-overview.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi-overview.md) already frames AEKO as a SocialFi-native chain
- [`docs/socialfi/reward-model.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/reward-model.md) already assumes proof-of-engagement, creator payouts, and social-bonus logic
- [`docs/socialfi/reputation-system.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/reputation-system.md) already assumes a chain-readable reputation score used in feeds and governance
- [`docs/socialfi/creator-economy.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/creator-economy.md) already assumes creator coins, collectibles, and subscription-style monetization

Phase 5 should refine and implement those assumptions rather than replace them casually.

## Current Gaps To Resolve

The current docs are directionally useful but still thin in ways that Phase 5 must fix:

- the RPC docs are still mostly placeholder-level and do not define response schemas, pagination, filtering, or SocialFi extensions
- the explorer API doc currently lists endpoints but does not define indexer responsibilities, storage contracts, or response formats
- the websocket doc does not yet define subscription auth, reconnection semantics, or SocialFi event channels
- the rate-limit doc is not yet tied to actual infrastructure policy, wallet identity, or permissioned access tiers
- the SocialFi docs describe goals and primitives but do not yet define the exact post, reward, engagement, staking, and anti-spam data contracts the RPC and explorer must expose
- the endpoint docs currently assume public AEKO cluster URLs that may not yet reflect the real deployed environment

## Recommended Order

1. SocialFi foundation spec
2. AEKO RPC core
3. SocialFi support contracts and on-chain state
4. AEKO RPC SocialFi extensions
5. Explorer indexer and backend APIs
6. Explorer frontend
7. Testnet deployment, documentation, and public endpoint closeout

This order matters:

- the SocialFi schema and reward rules must exist before AEKO-specific RPC methods can be frozen
- the support contracts and on-chain state must exist before SocialFi RPC data can be truthful
- the indexer depends on live chain and RPC data
- the frontend depends on explorer APIs and stable endpoint contracts

## Foundation

### SocialFi Layer

This is the blocking foundation for the rest of Phase 5.

Deliverable:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)

Required work:

- define on-chain post metadata schema
  - what is stored on-chain
  - what remains off-chain
  - canonical post hash format
  - creator, timestamp, and content pointer model
- define creator reward distribution logic
  - epoch cadence
  - reward buckets
  - engagement-to-reward translation
  - claimability rules
- define engagement mining rules
  - what actions count
  - weighting per action
  - decays, windows, and replay protection
  - anti-gaming controls
- define anti-spam mechanisms
  - posting rate limits
  - optional stake-to-post requirement
  - reputation gating
  - slashing or penalty model
- define reputation-weighted visibility
  - score sources
  - feed and ranking implications
  - how much of this is on-chain versus app-side
- define social staking model
  - stake / unstake flow
  - reward split between creator and staker
  - loss conditions
  - reporting and indexing model

Acceptance criteria:

- SocialFi entities and state transitions are explicit
- on-chain versus off-chain boundaries are explicit
- reward, engagement, anti-spam, and reputation rules are explicit enough to implement contracts and APIs
- downstream RPC, indexer, and explorer work can treat `socialfi.md` as the source of truth

## Ticket 5.1

### AEKO RPC Server

Build the RPC server in two layers: core chain RPC first, then SocialFi-native extensions.

#### 5.1A Core RPC

Required work:

- transaction submit
  - receive signed transactions
  - validate format and signatures
  - broadcast to the network
  - return submission and confirmation metadata
- block queries
  - get block by slot
  - get block by hash if supported
  - get latest block
  - get block range
- signature verification
  - verify transaction signature
  - check confirmation status
  - expose commitment/finality status
- account queries
  - get account info
  - get balance
  - get token holdings
  - get NFT holdings
- program queries
  - get program accounts
  - filter by owner, discriminant, or data fields
  - support pagination where needed

Deliverables:

- production RPC service design
- stable JSON-RPC method set
- updated [`docs/rpc-and-apis/rpc-reference.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rpc-reference.md)
- updated [`docs/rpc-and-apis/websocket.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/websocket.md)

Acceptance criteria:

- core read and write methods are implemented and documented
- response format is standardized
- errors are normalized and documented
- websocket and HTTP behavior are aligned
- public and private endpoint expectations are explicit

#### 5.1B SocialFi RPC Extensions

Build after the SocialFi spec and support contracts are stable enough to expose truthful state.

Required work:

- post metadata endpoints
  - fetch post anchor hash
  - fetch creator address
  - fetch timestamp and content pointer metadata
- creator reward endpoints
  - query earned rewards
  - query claimable balance
  - query reward history by epoch
- engagement endpoints
  - submit engagement proof if RPC-mediated
  - query engagement score
  - query engagement events over time
- reputation endpoints
  - get reputation score by wallet
  - expose score breakdown if policy permits
- social staking endpoints
  - stake behind creator
  - unstake
  - claim yield
  - query staking positions

Deliverables:

- SocialFi RPC extension spec
- SocialFi RPC implementation
- updated RPC docs with request and response examples

Acceptance criteria:

- every SocialFi endpoint maps cleanly to chain state or indexer-backed derived state
- write endpoints are clearly distinguished from read endpoints
- anti-spam and anti-replay semantics are documented
- claim, staking, reward, and engagement states are queryable per wallet and per creator

#### 5.1C Infrastructure, Auth, and Reliability

Required work:

- rate limiting
  - per IP
  - per wallet
  - tier-based
  - configurable
- websocket support
  - account subscriptions
  - transaction / log subscriptions
  - SocialFi event subscriptions
- error handling
  - stable error codes
  - structured error payloads
- authentication layer for permissioned endpoints
  - signed wallet challenge flow
  - API key or service-token layer for backend integrators
  - optional military / fintech access policy integration

Deliverables:

- hardened RPC deployment profile
- auth and rate-limit spec
- testnet deployment record

Acceptance criteria:

- public, developer, and partner tiers are enforced consistently
- websocket subscriptions are stable and documented
- permissioned endpoints are clearly separated from public ones
- RPC runs on testnet with published endpoint docs

## Ticket 5.2

### AEKO Explorer Backend

Build the explorer backend as an indexer plus a stable explorer API surface.

#### 5.2A Indexer

Required work:

- block indexer
  - ingest blocks and slots in real time
  - persist validator, timestamp, and block stats
- transaction indexer
  - parse instructions
  - persist status and fee data
  - support address and type-based lookup
- token indexer
  - track AEKO-20 transfers
  - track balances
  - track mint and burn events
- NFT indexer
  - track AEKO-721 mints
  - transfers
  - metadata changes
  - royalty-related events

#### 5.2B SocialFi Indexer

Required work:

- post indexer
  - index post hashes and creator mappings
- reward indexer
  - track creator reward distributions per epoch
- engagement indexer
  - track engagement proofs and score changes over time
- social staking indexer
  - track positions, yield, and stake changes

Deliverables:

- explorer indexer architecture doc
- backend storage schema
- replay and backfill strategy

Acceptance criteria:

- indexer can backfill historical data and tail live chain data
- block, tx, token, NFT, and SocialFi entities are queryable from durable storage
- reorg, replay, and duplicate handling are defined

#### 5.2C Explorer APIs

Required work:

- block API
  - get block
  - list blocks
  - block stats
- transaction API
  - get transaction
  - list by address
  - filter by type or status
- token API
  - token info
  - holders
  - transfer history
- NFT API
  - collection view
  - item view
  - ownership history
- address API
  - wallet profile
  - token holdings
  - NFT holdings
  - tx history
  - reputation score
- search API
  - address
  - tx hash
  - block
  - token
  - creator or post id if supported

Deliverables:

- deployed explorer backend
- stable explorer API contract
- updated [`docs/rpc-and-apis/explorer-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-api.md)

Acceptance criteria:

- explorer APIs are documented with parameters, pagination, and example responses
- APIs are consistent with explorer frontend needs
- search and profile surfaces can resolve both generic chain entities and SocialFi entities

## Ticket 5.3

### AEKO Explorer Frontend

Build the explorer frontend after the backend APIs are stable enough to support real views.

#### 5.3A Core Views

Required work:

- home
  - latest blocks
  - latest transactions
  - network stats
  - active validators
- block view
  - block details
  - transactions in block
  - producing validator
- transaction view
  - tx details
  - instructions
  - status
  - fee breakdown
  - involved accounts
- address view
  - wallet profile
  - balance
  - token holdings
  - NFTs
  - tx history

#### 5.3B SocialFi Views

Required work:

- creator profile view
  - reputation score
  - anchored posts
  - reward history
  - stakers
- social staking view
  - staking graph
  - yields
  - leaderboard
- engagement feed
  - recent engagement activity
  - score or reward-relevant actions

#### 5.3C UX and Product Finish

Required work:

- global search
- live network health banner
- mobile responsiveness
- dark mode
- stable testnet / mainnet environment switch

Deliverables:

- public AEKO Explorer
- updated web docs and developer references

Acceptance criteria:

- explorer is publicly accessible
- search resolves chain entities reliably
- SocialFi-specific views reflect backend truth rather than mock data
- explorer works on desktop and mobile

## SocialFi Support Contracts

These contracts or equivalent on-chain modules are prerequisites for truthful SocialFi RPC and explorer data.

Required work:

- reward contract
  - calculates and distributes creator rewards per epoch
- creator monetization contract
  - tipping
  - subscriptions
  - paid-content unlocks
- social staking contract
  - stake behind creator
  - unstake
  - claim yield
- anti-spam contract
  - stake requirement to post
  - penalty or slash flow for spam behavior if policy requires it

Deliverables:

- implementation specs
- program/module scaffolds
- testnet deployment plan

Current spec deliverables:

- [`docs/socialfi/reward-contract.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/reward-contract.md)
- [`docs/socialfi/social-posts-contract.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/social-posts-contract.md)
- [`docs/socialfi/post-signature-flow.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/post-signature-flow.md)
- [`docs/socialfi/social-staking-contract.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/social-staking-contract.md)
- [`docs/socialfi/creator-monetization-contract.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/creator-monetization-contract.md)
- [`docs/socialfi/anti-spam-contract.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/anti-spam-contract.md)
- [`docs/rpc-and-apis/aeko-social-backend-integration.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/aeko-social-backend-integration.md)

Current implementation progress:

- SocialFi RPC request/config/response types added in [`rpc-client-api`](/Users/ok/Documents/projects/aeko-chain/rpc-client-api)
- SocialFi read-only RPC server surface added in [`rpc/src/rpc.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc.rs) and registered in [`rpc/src/rpc_service.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc_service.rs)
- SocialFi RPC placeholder read behavior covered by RPC tests in [`rpc/src/rpc.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc.rs)
- SocialFi reward and staking RPC reads now resolve real on-chain program state through [`rpc/src/rpc/account_resolver.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc/account_resolver.rs) for creator rewards, claimable rewards, reward epochs, and social stake positions
- SocialFi reputation RPC reads now resolve anti-spam-backed on-chain profile state through [`rpc/src/rpc/account_resolver.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc/account_resolver.rs); engagement score and post-anchor reads still need dedicated canonical state
- social posts support contract added in [`programs/social-posts`](/Users/ok/Documents/projects/aeko-chain/programs/social-posts) with canonical post anchors and replay-protected engagement proofs
- post-signature and Aeko Social backend integration specs now exist in [`docs/socialfi/post-signature-flow.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/post-signature-flow.md) and [`docs/rpc-and-apis/aeko-social-backend-integration.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/aeko-social-backend-integration.md), explicitly defining the current split between backend signature verification and on-chain immutable anchoring
- first-pass Aeko Social backend helpers for canonical post payload building, hashing, ed25519 verification, and `AnchorPost` transaction preparation now exist in [`sdk/node/src/socialPosts.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/src/socialPosts.ts)
- a minimal reference Node backend for SocialFi post hashing, verification, anchoring, and persisted verification-status lookups now exists in [`sdk/node/examples/social-posts-backend.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/examples/social-posts-backend.ts)
- that reference backend now exposes a pluggable store adapter pattern and stable machine-readable error codes, making it a closer production template for Aeko Social integration
- SocialFi post-anchor, creator-post, and engagement-event RPC reads now resolve real on-chain social-posts state through [`rpc/src/rpc/account_resolver.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc/account_resolver.rs)
- SocialFi engagement score RPC reads now aggregate first-pass on-chain engagement proof weights from [`programs/social-posts`](/Users/ok/Documents/projects/aeko-chain/programs/social-posts)
- `submitEngagementProof` now exists as a validated SocialFi RPC write wrapper in [`rpc/src/rpc.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc.rs), forwarding signed engagement transactions through the normal submission path
- `stakeBehindCreator`, `unstakeBehindCreator`, and `claimSocialStakeYield` now exist as validated SocialFi RPC write wrappers in [`rpc/src/rpc.rs`](/Users/ok/Documents/projects/aeko-chain/rpc/src/rpc.rs), forwarding signed social-staking transactions through the normal submission path
- explorer backend scaffold added in [`explorer-backend`](/Users/ok/Documents/projects/aeko-chain/explorer-backend) with config, indexer traits, read-store traits, and core explorer/socialfi record models
- explorer backend now reads first-pass SocialFi snapshots directly from on-chain rewards, staking, posts, and anti-spam state in [`explorer-backend/src/indexer.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/indexer.rs), and an in-memory demo sync flow exists in [`explorer-backend/examples/demo_sync.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/examples/demo_sync.rs)
- explorer backend now reads first-pass AEKO-20 account snapshots and AEKO-721 token snapshots directly from on-chain program state in [`explorer-backend/src/indexer.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/indexer.rs), and exposes those records through the explorer API service in [`explorer-backend/src/api.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/api.rs)
- explorer backend now has a first runnable HTTP server in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs) with a local boot example in [`explorer-backend/examples/api_server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/examples/api_server.rs)
- explorer HTTP server now exposes first-pass detail endpoints for blocks, posts, and NFTs in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs)
- explorer HTTP server now returns richer composite account and creator views in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs) and [`explorer-backend/src/api.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/api.rs)
- explorer backend now exposes a first-pass AEKO-20 token summary endpoint in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs) and [`explorer-backend/src/api.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/api.rs)
- explorer backend now exposes a first-pass AEKO-721 collection summary endpoint in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs) and [`explorer-backend/src/api.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/api.rs)
- explorer HTTP routes now support first-pass filtering and pagination-style query params for blocks, transactions, token transfers, NFTs, posts, engagement, and stakes in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs)
- web/frontend explorer wiring is now documented in [`docs/rpc-and-apis/explorer-web-setup.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-web-setup.md) and backed by env variables in [`web/.env.example`](/Users/ok/Documents/projects/aeko-chain/web/.env.example)
- reward program scaffold added in [`programs/social-rewards`](/Users/ok/Documents/projects/aeko-chain/programs/social-rewards)
- reward epoch settlement logic and processor tests added in [`programs/social-rewards`](/Users/ok/Documents/projects/aeko-chain/programs/social-rewards)
- social staking program scaffold added in [`programs/social-staking`](/Users/ok/Documents/projects/aeko-chain/programs/social-staking)
- social staking lifecycle checks and processor tests added in [`programs/social-staking`](/Users/ok/Documents/projects/aeko-chain/programs/social-staking)
- creator monetization program scaffold added in [`programs/social-monetization`](/Users/ok/Documents/projects/aeko-chain/programs/social-monetization)
- creator monetization fee-routing, subscription lifecycle checks, unlock uniqueness checks, and processor tests added in [`programs/social-monetization`](/Users/ok/Documents/projects/aeko-chain/programs/social-monetization)
- anti-spam program scaffold added in [`programs/social-anti-spam`](/Users/ok/Documents/projects/aeko-chain/programs/social-anti-spam)
- anti-spam eligibility enforcement and processor tests added in [`programs/social-anti-spam`](/Users/ok/Documents/projects/aeko-chain/programs/social-anti-spam)

Acceptance criteria:

- SocialFi RPC methods do not expose placeholder economics
- explorer/indexer can observe real on-chain reward, staking, monetization, and anti-spam events

## Deployment and Environment Closeout

Phase 5 is not complete until:

- a reachable AEKO testnet RPC endpoint exists and is documented
- websocket endpoint behavior is documented
- explorer backend is deployed against live chain data
- explorer frontend is wired to real endpoints
- public docs and web developer pages reflect the actual live endpoints
- rate-limit and auth behavior are documented for public and partner access

## Phase 5 Deliverables

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- expanded RPC reference docs
- expanded websocket and rate-limit docs
- explorer backend and API docs
- explorer frontend
- SocialFi support contract specs and implementations
- testnet deployment record for RPC and explorer infrastructure

## Suggested Execution Sequence

1. Write and sign off `socialfi.md`
2. Expand the current RPC docs from placeholders into implementation-facing specs
3. Implement or scaffold the SocialFi support contracts needed for truthful APIs
4. Deliver core RPC methods and websocket infrastructure
5. Add SocialFi RPC extensions
6. Build the explorer indexer and backend APIs
7. Build the explorer frontend against those APIs
8. Deploy, publish endpoint docs, and update the web/docs surface

## Immediate Next Step

The first Phase 5 deliverable should be:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)

Nothing in the SocialFi RPC or explorer layer should be treated as stable until that foundation is signed off.
