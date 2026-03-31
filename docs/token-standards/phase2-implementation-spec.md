# Phase 2 Implementation Spec

## Purpose

This document turns the Phase 2 plan into an implementation-facing specification for AEKO tokenomics, AEKO-20, the public minting module, and AEKO-721. It is intended to remove ambiguity before engineering begins contract and runtime work.

This spec does not replace `tokenomics.md`, `aeko-20.md`, or `aeko-721.md`. Instead, it defines the implementation boundaries, contract responsibilities, state models, and integration points those docs must align with.

## Progress Tracker

### Completed

- [x] Phase 2 execution plan created in [`task.md`](/Users/ok/Documents/projects/aeko-chain/task.md)
- [x] Phase 2 implementation spec created in [`docs/token-standards/phase2-implementation-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/phase2-implementation-spec.md)
- [x] Tokenomics baseline captured in planning/spec docs
- [x] Initial implementation boundaries defined for Tokenomics Config, AEKO-20, Public Minting Module, and AEKO-721
- [x] Open sign-off decisions documented before contract work
- [x] Draft [`tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md) created
- [x] Supply model signed off as Option B: managed governed target with perpetual floor inflation beyond reserve exhaustion
- [x] Team vesting updated to `1-2 years` with `12-month cliff`
- [x] Epoch definition signed off: `1 day` epoch, `365` epochs/year
- [x] Per-year and per-epoch emission schedule signed off
- [x] Fee split, subsidy cap, commission bounds, and slashing parameters signed off
- [x] Tokenomics config/state design created in [`docs/token-standards/tokenomics-config-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/tokenomics-config-spec.md)
- [x] Governance parameter storage model defined
- [x] Validator reward formula signed off and documented
- [x] Tokenomics program crate scaffolded in [`programs/tokenomics`](/Users/ok/Documents/projects/aeko-chain/programs/tokenomics)
- [x] Tokenomics instruction/state API added for initialize, read, and governance-gated update flows
- [x] Tokenomics processor wired for initialize, read-return-data, and governance-gated update behavior
- [x] Tokenomics processor tests added for initialize, read, and authorized update flows
- [x] Epoch settlement and validator reward calculation logic added to the tokenomics program
- [x] Validator reward distribution recording added to tokenomics state
- [x] AEKO-20 spec upgraded from placeholder to implementation-facing draft
- [x] AEKO-20 program scaffold added in [`programs/token-20`](/Users/ok/Documents/projects/aeko-chain/programs/token-20)
- [x] AEKO-20 core mint/account initialization plus mint, transfer, and burn logic added
- [x] AEKO-20 allowance flow added with approve, revoke, and transferFrom behavior
- [x] AEKO-20 emissions-controlled mint path integrated with tokenomics state
- [x] AEKO-20 freeze/thaw controls and mint-authority rotation added
- [x] Public mint program scaffold added in [`programs/public-mint`](/Users/ok/Documents/projects/aeko-chain/programs/public-mint)
- [x] Public mint policy, blocklist, allowlist, cooldown, per-wallet window, subsidy validation, and anomaly-based wallet blocking added
- [x] Public mint module now delegates validated issuance into the AEKO-20 mint flow
- [x] AEKO-20 dedicated public mint guard path added for `PublicMintControlled` issuance
- [x] Permissioned mint flow documentation drafted in [`docs/token-standards/permissioned-mint-flow.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/permissioned-mint-flow.md)
- [x] Public mint API / endpoint documentation drafted in [`docs/token-standards/public-mint-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/public-mint-api.md)
- [x] Public mint admin instruction tests added for policy updates and list management
- [x] AEKO-721 spec upgraded from placeholder to implementation-facing draft
- [x] AEKO-721 program scaffold added in [`programs/token-721`](/Users/ok/Documents/projects/aeko-chain/programs/token-721)
- [x] AEKO-721 collection init, mint, transfer, metadata update, and royalty validation added
- [x] AEKO-721 freeze/thaw controls and stricter metadata validation added
- [x] AEKO-721 demo recipe drafted in [`docs/token-standards/nft-demo.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/nft-demo.md)
- [x] AEKO-721 web demo now supports live testnet-backed reads, wallet detection, and unsigned transaction construction for wallet signing
- [x] AEKO-721 web demo now derives seed-based collection/token accounts and prepares setup transactions with rent estimates
- [x] AEKO-721 web demo now uses a typed wallet adapter layer for connect, proof signing, and sign-and-send flows
- [x] Canonical AEKO-721 public-example configuration and publication walkthrough added for the web demo
- [x] Testnet deployment closeout checklists drafted for AEKO-20 and AEKO-721

### Remaining

- [ ] Deploy AEKO-20 reference implementation to testnet
- [ ] Deploy AEKO-721 demo to testnet

## Implementation Order

Work must proceed in this order:

1. Finalize and sign off `tokenomics.md`
2. Implement AEKO-20 reference standard
3. Implement Public Token Minting Module
4. Implement AEKO-721 reference standard

No on-chain mint logic should be merged before tokenomics sign-off.

## System Components

Phase 2 should be implemented as four cooperating components:

1. `Tokenomics Config`
   Defines supply, emissions, fee routing, treasury routing, and validator reward math.
2. `AEKO-20 Program`
   Canonical fungible token program for mint, transfer, burn, and allowance flows.
3. `Public Minting Module`
   Controlled mint gateway for public or app-mediated mint issuance.
4. `AEKO-721 Program`
   Canonical NFT program for unique assets, creator royalties, and metadata validation.

## 1. Tokenomics Foundation Spec

### 1.1 Source of Truth

The tokenomics layer must define:

- max supply
- genesis circulating supply
- allocation buckets
- vesting policy
- inflation schedule
- validator rewards
- fee split
- treasury routing
- burn logic
- subsidy logic
- slashing destination

Implementation should treat tokenomics as configuration and policy, not scattered constants.

### 1.2 Baseline Economic Constants

- Max supply: `500,000,000,000 AEKO`
- Allocation:
  - Validator Rewards: `150B`
  - Community & SocialFi Rewards: `125B`
  - Treasury: `100B`
  - Team & Contributors: `60B`
  - Ecosystem / Grants: `40B`
  - Public Sale / TGE: `25B`
- Team vesting: `1-2 years` with `12-month cliff`
- Inflation curve:
  - Year 1: `8%`
  - Year 2: `6%`
  - Year 3: `4%`
  - Year 4: `2%`
  - Year 5+: `1% floor`
- Fee split:
  - Burn: `40%`
  - Treasury: `40%`
  - Validator tip: `20%`
- Base transaction fee target: `0.00025 AEKO`

### 1.3 Required Data Model

The tokenomics implementation must provide a canonical config object with at least:

```rust
pub struct TokenomicsConfig {
    pub max_supply: u128,
    pub base_tx_fee: u64,
    pub fee_burn_bps: u16,
    pub fee_treasury_bps: u16,
    pub fee_validator_tip_bps: u16,
    pub annual_inflation_schedule: Vec<InflationEpochBand>,
    pub emissions_reserve: u128,
    pub treasury_account: Pubkey,
    pub validator_rewards_account: Pubkey,
    pub community_rewards_account: Pubkey,
    pub subsidy_policy: SubsidyPolicy,
}
```

Supporting types:

```rust
pub struct InflationEpochBand {
    pub start_epoch: u64,
    pub end_epoch: Option<u64>,
    pub annual_rate_bps: u16,
}

pub struct SubsidyPolicy {
    pub enabled: bool,
    pub monthly_cap: u128,
    pub per_app_cap: u128,
    pub max_subsidy_per_tx: u64,
}
```

### 1.4 Supply Rules

Implementation must answer one unresolved policy question before code freeze:

- Is `500B` a hard cap that excludes future floor inflation?
- Or is `500B` the initial governed supply target, with post-reserve floor inflation allowed beyond it?

Until signed off, contracts should implement this as an explicit policy field, not a hidden assumption.

Suggested flag:

```rust
pub enum SupplyModel {
    HardCap,
    ManagedCapWithFloorInflation,
}
```

### 1.5 Epoch Emission Logic

Annual inflation must be translated into deterministic epoch emissions.

Implementation requirements:

- define `epochs_per_year`
- derive `emission_per_epoch`
- round deterministically
- track emitted totals
- stop reserve emissions when the validator rewards bucket is depleted
- continue floor inflation only if approved by tokenomics policy

Suggested formula:

```text
epoch_emission = floor((annual_emission_target / epochs_per_year))
```

with remainder handling documented and accumulated safely.

### 1.6 Validator Rewards

Validator rewards logic must support:

- base epoch emission distribution
- validator commission
- delegator proportional rewards
- uptime bonus
- slashing

Suggested reward flow:

1. Determine total epoch reward pool
2. Split by validator stake weight
3. Apply uptime multiplier
4. Apply commission to delegator-earned portion
5. Credit validator and delegator balances

Required uptime rule:

- uptime above `99%` qualifies for bonus multiplier

Implementation must define:

- uptime measurement window
- bonus multiplier cap
- whether slashed validators lose epoch rewards entirely or partially

### 1.7 Fee Routing

Every fee-bearing transaction must route collected fees in this order:

1. calculate base fee
2. add optional priority fee
3. apply subsidy if eligible
4. split net collected fee:
   - `40%` burn
   - `40%` treasury
   - `20%` validator tip

Implementation requirement:

- fee routing must be atomic and auditable
- all fee destinations must be emitted as structured events

### 1.8 Treasury and Slashing

Treasury must receive:

- treasury portion of transaction fees
- slashed balances
- optionally unclaimed or expired emissions if policy requires it

Implementation must define whether slashed balances are:

- transferred directly to treasury
- burned partially and sent partially to treasury

Current baseline says slashed amount goes to treasury.

### 1.9 Subsidy Logic

The subsidy mechanism should not live inside arbitrary app code. It should be enforced through a treasury-approved registry and a chain-level subsidy policy.

Suggested model:

```rust
pub struct SubsidizedApp {
    pub app_id: Pubkey,
    pub active: bool,
    pub monthly_cap: u128,
    pub spent_this_month: u128,
    pub expires_at_epoch: Option<u64>,
}
```

Eligibility checks:

- app is registered and active
- app monthly cap not exceeded
- treasury subsidy pool has available balance
- transaction category is eligible

## 2. AEKO-20 Implementation Spec

### 2.1 Objective

AEKO-20 is the canonical fungible asset standard on AEKO Chain.

It must support:

- mint
- transfer
- burn
- allowance
- optional permission and identity hooks
- integration with tokenomics-driven emissions

### 2.2 Core Accounts / State

Suggested state objects:

```rust
pub struct Aeko20Mint {
    pub mint_authority: Option<Pubkey>,
    pub freeze_authority: Option<Pubkey>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub supply_cap: Option<u128>,
    pub metadata_uri: Option<String>,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub required_clearance: Option<u8>,
    pub mint_policy: MintPolicy,
    pub is_initialized: bool,
}

pub struct Aeko20Account {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub balance: u128,
    pub frozen: bool,
}

pub struct AllowanceRecord {
    pub owner: Pubkey,
    pub spender: Pubkey,
    pub mint: Pubkey,
    pub amount: u128,
    pub expires_at_epoch: Option<u64>,
}
```

### 2.3 Mint Policy

Minting must be policy-driven.

Suggested policy enum:

```rust
pub enum MintPolicy {
    FixedSupply,
    AuthorityGated,
    EmissionsControlled,
    PublicMintControlled,
}
```

Rules:

- `FixedSupply`: mint disabled after initial issuance
- `AuthorityGated`: only authorized mint authority may mint
- `EmissionsControlled`: minting only through validator reward scheduler
- `PublicMintControlled`: minting only through the public minting module

### 2.4 Metadata Requirements

Minimum fungible token metadata:

- `name`
- `symbol`
- `decimals`
- `supply_cap`
- optional `metadata_uri`

Validation:

- symbol length and character set constrained
- decimals bounded
- supply cap cannot exceed approved tokenomics or program-specific mint policy

### 2.5 Instruction Surface

Minimum AEKO-20 instructions:

- `InitializeMint`
- `InitializeAccount`
- `MintTo`
- `Transfer`
- `Burn`
- `Approve`
- `Revoke`
- `TransferFrom`
- `FreezeAccount`
- `ThawAccount`
- `SetMintAuthority`
- `SetTransferHook`

### 2.6 Transfer Rules

Transfer must enforce:

- sender owns source account or has approved allowance
- sufficient balance
- source not frozen
- destination account matches mint
- optional identity and clearance constraints if configured

If transfer hooks are enabled:

- hook execution must happen before final balance mutation
- hook failure aborts the transfer atomically

### 2.7 Burn Rules

Burn must:

- reduce account balance
- reduce mint total supply
- emit burn event
- optionally route accounting metadata to tokenomics burn metrics

Burning does not itself replace chain transaction fee burn. These are separate mechanisms and must be tracked separately.

### 2.8 Allowance Rules

Allowance design should include:

- exact approved amount
- decrement on `transferFrom`
- optional expiry
- optional revocation

Implementation must prevent:

- overspending
- mismatched mint allowance use
- replay after expiry

### 2.9 Validator Emissions Integration

AEKO-20 must expose a controlled path for validator reward minting.

Recommended design:

- emissions mint authority is held by a governance- or runtime-controlled authority
- only the reward distributor can invoke emissions minting
- each epoch reward issuance writes an auditable event

Required event fields:

- epoch
- total emitted
- validator share
- delegator share
- commission retained

## 3. Public Token Minting Module Spec

### 3.1 Objective

Provide a secure and rate-limited minting gateway for public-facing issuance flows after AEKO-20 is in place.

### 3.2 Responsibilities

The module must:

- authorize mint requests
- enforce rate limits
- run abuse checks
- optionally apply fee subsidies
- delegate actual mint execution to AEKO-20

This module should not duplicate token balance logic. It should orchestrate mint policy and then call the AEKO-20 program.

### 3.3 Suggested State

```rust
pub struct PublicMintPolicy {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub enabled: bool,
    pub per_wallet_limit: u128,
    pub window_seconds: i64,
    pub cooldown_seconds: i64,
    pub requires_allowlist: bool,
    pub fee_subsidy_enabled: bool,
}

pub struct WalletMintWindow {
    pub wallet: Pubkey,
    pub mint: Pubkey,
    pub window_start_ts: i64,
    pub minted_in_window: u128,
    pub last_mint_ts: i64,
    pub anomaly_score: u32,
    pub blocked: bool,
}
```

### 3.4 Mint Flow

Suggested flow:

1. validate target mint supports `PublicMintControlled`
2. validate policy is enabled
3. validate caller eligibility
4. validate wallet is not blocked
5. validate per-wallet mint amount limit
6. validate time window and cooldown
7. run anomaly or abuse checks
8. optionally apply fee subsidy
9. invoke AEKO-20 `MintTo`
10. emit public mint event

### 3.5 Abuse Prevention

Minimum controls:

- blocklist
- cooldowns
- per-wallet caps
- per-window caps
- anomaly flags

Suggested anomaly triggers:

- too many mint attempts in a short period
- repeated failures
- patterns across linked wallets if identity hooks exist

Implementation should separate:

- automatic soft flags
- hard blocks
- governance/admin review actions

### 3.6 Fee Subsidy Hook

If subsidy is enabled:

- check app registration
- check remaining monthly cap
- check per-transaction cap
- debit treasury subsidy allocation
- record app subsidy usage

Subsidy should fail closed if treasury accounting state is missing or inconsistent.

### 3.7 API / Endpoint Surface

The “public mint endpoint” may be exposed at RPC or application API level, but the final authority must remain on-chain policy plus contract checks.

Recommended split:

- off-chain endpoint handles UX and request shaping
- on-chain module enforces policy and mint validity

## 4. AEKO-721 Implementation Spec

### 4.1 Objective

AEKO-721 defines the non-fungible token standard for creator assets, social objects, collectibles, and platform-native NFTs.

### 4.2 Minimum State

```rust
pub struct Aeko721Collection {
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub royalty_bps: u16,
    pub royalty_recipient: Pubkey,
    pub metadata_policy: MetadataPolicy,
}

pub struct Aeko721Token {
    pub collection: Pubkey,
    pub token_id: u128,
    pub owner: Pubkey,
    pub creator: Pubkey,
    pub metadata_uri: String,
    pub content_hash: Option<[u8; 32]>,
    pub minted_at_slot: u64,
    pub frozen: bool,
}
```

### 4.3 Metadata Requirements

Split metadata into:

- on-chain required fields
- off-chain JSON document

Required on-chain fields:

- collection id
- token id
- owner
- creator
- metadata URI
- royalty basis points
- optional content hash

Required off-chain fields:

- name
- description
- media URI
- creator fields
- attributes

Validation rules:

- URI must use approved scheme or format
- required fields must exist
- royalty bps must be bounded
- token ID must be unique per collection

### 4.4 Instruction Surface

Minimum AEKO-721 instructions:

- `InitializeCollection`
- `MintNft`
- `TransferNft`
- `BurnNft`
- `UpdateMetadataUri`
- `FreezeNft`
- `ThawNft`
- `SetRoyalty`

### 4.5 Mint Rules

Minting must enforce:

- valid collection authority
- unique token ID generation
- metadata validation
- creator attribution
- optional content hash integrity check

Token ID generation options:

- monotonic counter per collection
- deterministic hash-derived ID

Recommended default:

- monotonic per-collection counter for simplicity and auditability

### 4.6 Transfer Rules

Transfer must:

- verify current owner authorization
- update owner atomically
- emit transfer event
- reject transfer if frozen

If creator royalty logic depends on marketplace settlement rather than bare transfers, that boundary must be documented in `aeko-721.md`.

### 4.7 Royalty Logic

Royalty support must store:

- creator or royalty recipient
- basis points

This spec recommends:

- store royalty terms on-chain
- enforce royalty reporting at protocol-supported sale paths
- if universal enforcement is not possible in base transfer, document marketplace-level enforcement clearly

### 4.8 SocialFi Integration

AEKO-721 should optionally support:

- creator attribution
- content hash anchoring
- reputation-linked minting
- reward routing metadata for future SocialFi reward layers

These integrations should be optional extensions, not required for baseline NFT transfers.

## 5. Cross-Cutting Concerns

### 5.1 Events

All programs must emit structured events for:

- mint
- transfer
- burn
- approval
- fee routing
- reward distribution
- subsidy usage
- slashing

### 5.2 Governance Controls

Governance-adjustable parameters should be isolated and explicit:

- base fee
- burn ratio
- subsidy caps
- validator commission bounds if globally constrained
- slashing parameters
- mint policy toggles

### 5.3 Security Requirements

All implementations must protect against:

- unauthorized minting
- integer overflow and underflow
- allowance misuse
- replay of expired permissions
- supply cap bypass
- double reward issuance in an epoch
- duplicate NFT token IDs
- fee-routing inconsistencies

### 5.4 Testing Requirements

Minimum testing layers:

- unit tests for state transitions
- property tests for supply and fee invariants
- integration tests for epoch rewards
- abuse tests for public mint limits
- metadata validation tests for AEKO-721
- testnet deployment verification for reference implementations

## 6. Build Sequence

### Stage A

- [x] Define Phase 2 planning baseline and implementation boundaries
- [x] Draft `tokenomics.md`
- [ ] Finalize `tokenomics.md`
- [x] Define epoch math
- [x] Define config and governance parameter storage

### Stage B

- write `aeko-20.md`
- implement AEKO-20 mint/account/allowance state
- implement mint, transfer, burn, approve, transferFrom
- integrate emissions authority path

### Stage C

- implement public minting policy state
- implement rate limiting and abuse controls
- implement subsidy hook
- document permissioned mint flow

### Stage D

- write `aeko-721.md`
- implement collection and NFT state
- implement mint, transfer, metadata validation, royalty storage
- deploy NFT mint demo to testnet

## 7. Open Decisions Requiring Sign-Off

- whether AEKO-721 royalties are protocol-enforced only on supported sale paths or globally targeted
- exact eligibility rules for social app subsidy enrollment

## 8. Exit Criteria

Phase 2 is complete only when:

- `tokenomics.md` is approved
- `aeko-20.md` is approved
- `aeko-721.md` is approved
- AEKO-20 reference implementation passes tests and is deployed to testnet
- public minting module passes abuse and rate-limit tests
- AEKO-721 reference implementation passes tests and demo deployment succeeds
- all economic and mint policies match the signed-off tokenomics configuration
