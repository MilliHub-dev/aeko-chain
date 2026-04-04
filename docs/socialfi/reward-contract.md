# Creator Reward Contract Specification

## Purpose

This document defines the Phase 5 reward contract or reward module that calculates, settles, and exposes creator rewards for AEKO SocialFi applications.

It should stay aligned with:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- [`docs/tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md)
- [`docs/socialfi/reward-model.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/reward-model.md)

## Responsibilities

The reward contract is responsible for:

- ingesting epoch-finalized engagement totals
- calculating creator reward allocations
- recording claimable balances
- preventing double counting
- supporting creator reward claims
- emitting structured settlement and claim events

It is not responsible for:

- raw feed ranking
- app-specific recommendation logic
- direct tips or subscriptions unless explicitly bridged into the same accounting layer

## Inputs

The reward contract should consume:

- finalized epoch id
- creator engagement totals
- engagement quality multipliers
- reputation-based eligibility adjustments if approved
- anti-spam penalties or exclusion flags
- reward pool amount for the epoch

Suggested settlement input:

```rust
pub struct RewardSettlementInput {
    pub epoch: u64,
    pub reward_pool_amount: u64,
    pub creator_entries: Vec<CreatorEpochInput>,
}

pub struct CreatorEpochInput {
    pub creator: Pubkey,
    pub earned_points: u128,
    pub penalty_bps: u16,
    pub reputation_multiplier_bps: u16,
}
```

## Core State

Suggested state:

```rust
pub struct RewardConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub reward_vault: Pubkey,
    pub settlement_authority: Pubkey,
    pub min_claim_amount: u64,
    pub rewards_enabled: bool,
}

pub struct CreatorRewardAccount {
    pub creator: Pubkey,
    pub total_earned: u128,
    pub total_claimed: u128,
    pub claimable_amount: u64,
    pub last_settled_epoch: u64,
}

pub struct CreatorRewardEpochRecord {
    pub epoch: u64,
    pub creator: Pubkey,
    pub earned_points: u128,
    pub reward_amount: u64,
    pub claimed_amount: u64,
    pub penalty_bps: u16,
}
```

## Instruction Surface

Minimum instruction set:

- `InitializeRewardConfig`
- `SetRewardPolicy`
- `SettleRewardEpoch`
- `RecordCreatorReward`
- `ClaimCreatorReward`
- `PauseRewards`
- `ResumeRewards`
- `ReadCreatorRewardState`

## Settlement Rules

- settlement is epoch-based
- each epoch may only be settled once unless an explicit correction flow exists
- a creator's reward for an epoch is derived from:
  - earned points
  - approved multipliers
  - penalties
  - available reward pool
- excluded or spam-flagged activity must not increase reward totals
- settlement must be deterministic and replay-safe

Suggested reward formula:

```text
creator_reward = floor((creator_effective_points / total_effective_points) * epoch_reward_pool)
```

Where:

```text
creator_effective_points = earned_points * reputation_multiplier - penalties
```

## Claim Rules

- creator may claim available reward balance after epoch settlement
- claim should fail if:
  - rewards are paused
  - claimable balance is zero
  - claim amount exceeds claimable balance
- claim should transfer reward tokens from the reward vault to the creator-designated destination
- claim event must include creator, amount, epoch range or claim reference

## Events

Minimum events:

- `RewardEpochSettled`
- `CreatorRewardRecorded`
- `CreatorRewardClaimed`
- `RewardPolicyUpdated`

## RPC and Indexer Consequences

This contract is the source of truth for:

- `getCreatorRewards`
- `getCreatorRewardEpoch`
- `getClaimableRewards`
- reward history on creator explorer pages

The explorer indexer should persist:

- settlement events
- creator reward balances
- claim events
- per-epoch creator reward records

## Phase 5 Status

This contract spec is required before SocialFi reward RPC endpoints can be treated as canonical rather than provisional.

Current implementation progress:

- reward program scaffold added in [`programs/social-rewards`](/Users/ok/Documents/projects/aeko-chain/programs/social-rewards)
- deterministic epoch settlement flow added
- creator claimable balance accounting added
- processor tests added for settlement math and duplicate-epoch rejection
