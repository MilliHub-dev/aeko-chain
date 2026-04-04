# SocialFi Specification

## Purpose

This document is the implementation-facing source of truth for AEKO Chain's SocialFi layer.

It defines the SocialFi primitives that the protocol, RPC endpoints, explorer backend, explorer frontend, and Aeko Social application must agree on before Phase 5 implementation proceeds.

This spec does not replace the higher-level SocialFi vision docs. Instead, it turns them into concrete data contracts and system rules.

## Scope

This spec covers:

- on-chain post metadata
- off-chain content boundaries
- creator reward distribution
- engagement mining
- anti-spam controls
- reputation-weighted visibility
- social staking
- indexing and RPC consequences

## Design Principles

- content provenance must be verifiable on-chain
- rich media should remain off-chain unless explicitly required on-chain
- creator rewards must be deterministic and auditable
- engagement must be difficult to game economically
- moderation should affect visibility, not erase chain history
- reputation should influence discovery and privilege, but not silently override chain truth
- every SocialFi RPC or explorer surface should map back to either:
  - canonical on-chain state
  - explicitly derived indexer state

## Core Entities

The SocialFi layer assumes the following primary entities:

- `Identity`
  - wallet-anchored user identity from Phase 4
- `PostAnchor`
  - canonical on-chain record proving authorship and timestamp for a post
- `EngagementProof`
  - canonical record or contract-driven event representing an engagement action
- `CreatorRewardEpoch`
  - epoch-based reward accounting for creators
- `ReputationProfile`
  - score and score-component view for a wallet
- `SocialStakePosition`
  - creator-backed stake position and reward entitlement record
- `ModerationAudit`
  - signed moderation or visibility action record where applicable

## 1. Post Metadata Schema

### 1.1 On-Chain vs Off-Chain Boundary

AEKO should not store full post bodies or rich media blobs directly on-chain by default.

The canonical split is:

- on-chain:
  - post id
  - creator wallet
  - post content hash
  - metadata hash
  - content URI or pointer
  - parent post id if reply or repost
  - created-at timestamp
  - signature or proof reference
  - visibility and moderation flags that are protocol-relevant
- off-chain:
  - full text body
  - media payloads
  - thumbnails
  - rendered metadata bundles
  - moderation notes that are private by policy

### 1.2 Canonical Post Anchor

Suggested canonical state:

```rust
pub struct PostAnchor {
    pub post_id: [u8; 32],
    pub creator: Pubkey,
    pub content_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub content_uri: String,
    pub parent_post_id: Option<[u8; 32]>,
    pub post_kind: PostKind,
    pub created_at_unix: i64,
    pub edited_at_unix: Option<i64>,
    pub visibility: VisibilityClass,
    pub moderation_state: ModerationState,
    pub signature_ref: Option<[u8; 32]>,
}
```

Supporting enums:

```rust
pub enum PostKind {
    Original,
    Reply,
    Repost,
    Quote,
}

pub enum VisibilityClass {
    Public,
    FollowersOnly,
    Permissioned,
    Paid,
}

pub enum ModerationState {
    Active,
    ReducedReach,
    HiddenByApp,
    LockedByProtocol,
}
```

### 1.3 Canonical Hashing Rules

- `content_hash` should represent the user-authored logical content payload
- `metadata_hash` should represent the full serialized post metadata bundle used for verification
- the serialization format used for hashing must be deterministic
- clients must not be allowed to reorder fields or use lossy encoding

Recommended rule:

- serialize canonical JSON or Borsh payload in a fixed field order
- hash with SHA-256
- sign the hash with the creator wallet

### 1.4 Edit Model

Posts should be immutable as historical records, but AEKO may support an edit model through versioned metadata.

Rule:

- original `post_id` remains stable
- edited payload creates a new `metadata_hash`
- explorer and apps must expose edit history if edits are allowed
- destructive overwrite of previous post proofs is not allowed

## 2. Creator Reward Distribution

### 2.1 Reward Sources

Creator rewards may come from:

- community and SocialFi reward bucket allocations
- protocol-defined engagement mining emissions
- direct tips
- subscription flows
- creator monetization contracts
- optional ad-revenue buyback flows if enabled at the app layer

Direct tips and subscriptions are not the same as protocol reward emissions and must be accounted for separately.

### 2.2 Epoch Reward Model

Creator rewards should settle by epoch, not per engagement event finalization.

Suggested canonical state:

```rust
pub struct CreatorRewardEpoch {
    pub epoch: u64,
    pub creator: Pubkey,
    pub earned_points: u128,
    pub reward_amount: u64,
    pub claimed_amount: u64,
    pub claimable_amount: u64,
    pub reward_sources: RewardSourceBreakdown,
}
```

### 2.3 Reward Calculation Inputs

At minimum, creator reward distribution should consider:

- unique engagement count
- engagement quality weighting
- reputation of engaging wallets
- stake-backed creator confidence if enabled
- anti-spam penalties
- app-level or campaign-level reward policies if approved

### 2.4 Reward Settlement Rules

- reward calculation window is epoch-based
- the same engagement proof cannot be counted twice
- bot-like or slashed activity is excluded from reward totals
- rewards become claimable only after the epoch is finalized
- reward math must be reproducible from indexed event history

### 2.5 Direct Creator Monetization

Protocol reward accounting must remain distinct from:

- `tips`
- `subscriptions`
- `paid content unlocks`

These should be queryable alongside protocol rewards, but not merged into one ambiguous balance.

## 3. Engagement Mining

### 3.1 Supported Engagement Actions

The initial action set should be explicit and limited.

Suggested action types:

- `Like`
- `Reply`
- `Repost`
- `Quote`
- `Follow`
- `Tip`
- `Subscribe`
- `OpenPaidContent`

Suggested enum:

```rust
pub enum EngagementActionKind {
    Like,
    Reply,
    Repost,
    Quote,
    Follow,
    Tip,
    Subscribe,
    OpenPaidContent,
}
```

### 3.2 Weighting Model

Each action should have a base score weight.

Suggested starting model:

- `Like`: low weight
- `Reply`: medium weight
- `Repost`: medium weight
- `Quote`: high weight
- `Follow`: low or medium weight depending on anti-spam policy
- `Tip`: high weight
- `Subscribe`: very high weight
- `OpenPaidContent`: medium weight if uniquely attributable

Actual numeric values should be governed and versioned rather than hardcoded in app code.

### 3.3 Engagement Proof Requirements

Each engagement proof should include:

- actor wallet
- target post id or creator id
- action kind
- timestamp or slot
- uniqueness key or replay-protection nonce
- optional app or context id
- signature or authorization proof

Suggested structure:

```rust
pub struct EngagementProof {
    pub proof_id: [u8; 32],
    pub actor: Pubkey,
    pub target_post_id: Option<[u8; 32]>,
    pub target_creator: Pubkey,
    pub action_kind: EngagementActionKind,
    pub action_weight: u32,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub replay_guard: [u8; 32],
}
```

### 3.4 Anti-Gaming Rules

Engagement mining must account for:

- duplicate actions by the same wallet
- self-engagement
- engagement rings
- low-reputation bot farms
- burst behavior outside normal thresholds
- rapid wallet churn

Required policy rules:

- self-engagement does not earn creator reward credit
- repeated identical engagement from one wallet within the same reward window is ignored
- low-reputation or newly created wallets may receive reduced action weight
- suspicious activity may be excluded pending moderation or challenge review

## 4. Anti-Spam Mechanisms

### 4.1 Posting Controls

AEKO should support configurable anti-spam gating without forcing one policy on every environment.

Suggested controls:

- per-wallet posting rate limits
- per-IP gateway rate limits at the API layer
- optional minimum stake to post
- optional minimum reputation threshold for certain visibility classes
- cooldowns after spam flags or slashing events

### 4.2 Protocol-Level Anti-Spam State

Suggested state:

```rust
pub struct SocialAntiSpamProfile {
    pub wallet: Pubkey,
    pub post_count_window: u32,
    pub engagement_count_window: u32,
    pub spam_flags: u16,
    pub min_required_stake: u64,
    pub gated_until_epoch: Option<u64>,
    pub slash_count: u16,
}
```

### 4.3 Enforcement Rules

- public posting may require stake, reputation, or both depending on policy
- repeated spam offenses may reduce reach before escalating to protocol restrictions
- severe abuse may trigger posting lock or slash if a slash-backed anti-spam contract exists
- app-layer moderation may hide content without deleting its on-chain anchor

## 5. Reputation-Weighted Visibility

### 5.1 Reputation Inputs

The SocialFi layer should build on the broader reputation model already documented elsewhere.

Minimum inputs:

- identity verification tier
- account age
- staking participation
- creator and engagement history
- moderation / spam penalties
- governance or contribution signals if enabled

### 5.2 Chain vs App Responsibility

Reputation score calculation may be chain-native, indexer-derived, or hybrid, but the boundary must be explicit.

Recommended model:

- on-chain:
  - canonical score checkpoints
  - penalty and slash events
  - identity and staking anchors
- off-chain or indexer-derived:
  - ranking features
  - detailed feed heuristics
  - UI personalization

### 5.3 Visibility Effects

Reputation should affect:

- comment ranking
- feed ranking inputs
- anti-spam gating thresholds
- eligibility for reward multipliers or governance-sensitive actions

Reputation should not:

- falsify post ownership
- silently erase chain records
- hide critical protocol data from explorers

## 6. Social Staking

### 6.1 Purpose

Social staking lets users stake AEKO behind creators as an expression of confidence, alignment, or reward-sharing participation.

### 6.2 Stake Position Model

Suggested canonical state:

```rust
pub struct SocialStakePosition {
    pub position_id: [u8; 32],
    pub staker: Pubkey,
    pub creator: Pubkey,
    pub staked_amount: u64,
    pub activated_at_epoch: u64,
    pub unlock_epoch: Option<u64>,
    pub accumulated_yield: u64,
    pub claimed_yield: u64,
    pub state: SocialStakeState,
}

pub enum SocialStakeState {
    Active,
    CoolingDown,
    Closed,
    Slashed,
}
```

### 6.3 Reward Split

The social staking model must define:

- what percentage of creator-aligned reward flow goes to stakers
- what percentage remains with creators
- whether the split differs for:
  - protocol reward epochs
  - direct monetization
  - campaign-based incentives

Suggested first-pass rule:

- only explicitly designated staking reward pools are shareable with stakers
- direct tips remain entirely creator-owned unless a monetization contract says otherwise

### 6.4 Risk Model

Social staking must define:

- whether principal is ever slashable
- whether poor creator behavior reduces staker yield
- whether spam or moderation penalties can reduce creator-linked reward flow

Recommended first-pass approach:

- do not slash staker principal in Phase 5 unless explicitly specified
- reduce or zero out reward yield under creator penalty conditions instead

## 7. Moderation and Audit

### 7.1 Principle

Moderation manages visibility and permissioned access. It does not rewrite history.

### 7.2 Canonical Moderation Effects

Allowed moderation consequences:

- reduce reach
- hide from app feeds
- mark as sensitive
- gate by permission layer
- suspend reward eligibility for flagged content

Disallowed moderation consequence:

- deleting or mutating the historical post anchor itself

### 7.3 Auditability

Moderation actions that affect protocol-visible state should be auditable.

Suggested structure:

```rust
pub struct ModerationAuditEntry {
    pub moderator: Pubkey,
    pub target: [u8; 32],
    pub action: ModerationAction,
    pub reason_code: u16,
    pub unix_timestamp: i64,
    pub signature_ref: Option<[u8; 32]>,
}
```

## 8. RPC and Indexer Consequences

This spec implies the following Phase 5 requirements:

- RPC must expose canonical post anchor reads
- RPC must expose creator reward and claimable reward state
- RPC must expose engagement and reputation reads
- RPC must expose social staking position reads and write flows
- websocket support should include SocialFi event subscriptions
- the explorer indexer must persist post, reward, engagement, reputation, and staking entities
- the explorer frontend must distinguish:
  - canonical on-chain data
  - derived analytics
  - app-level moderation or visibility overlays

## 9. Phase 5 Contract Requirements

Before the full SocialFi RPC surface is considered complete, AEKO must implement or firmly scaffold:

- reward distribution contract or module
- social staking contract or module
- creator monetization contract or module
- anti-spam contract or module if protocol-enforced stake or slashing is enabled

Without those pieces, SocialFi RPC endpoints should be clearly marked as:

- canonical
- derived
- provisional

## 10. Initial Open Decisions

These decisions should be signed off before contract and RPC freeze:

- exact numeric engagement weights
- exact creator / staker reward split
- whether post editing is enabled in Phase 5 or deferred
- whether anti-spam stake is required at launch
- whether social staking principal is ever slashable
- whether engagement submission is direct on-chain, RPC-mediated, or contract-gated only

## 11. Immediate Follow-On Docs

After this spec is signed off, the next docs to update are:

- [`docs/rpc-and-apis/rpc-reference.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rpc-reference.md)
- [`docs/rpc-and-apis/websocket.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/websocket.md)
- [`docs/rpc-and-apis/explorer-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-api.md)
- any reward, staking, and monetization contract implementation specs created for Phase 5

## Status

This document is the SocialFi foundation for Phase 5 and should be treated as blocking input for RPC extensions, explorer indexing, and Aeko Social API work.
