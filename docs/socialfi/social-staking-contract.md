# Social Staking Contract Specification

## Purpose

This document defines the Phase 5 social staking contract or module that allows users to stake AEKO behind creators and receive creator-aligned yield.

It should stay aligned with:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- [`tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md)

## Responsibilities

The social staking contract is responsible for:

- opening creator-linked stake positions
- holding staked funds or references to them
- managing cooldown and unstake rules
- tracking yield entitlement
- allowing stakers to claim yield
- recording creator-linked staking metrics

It is not responsible for:

- validator staking
- generic treasury staking
- app-level recommendation or leaderboard ranking logic

## Core State

Suggested state:

```rust
pub struct SocialStakeConfig {
    pub authority: Pubkey,
    pub stake_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub min_stake_amount: u64,
    pub cooldown_epochs: u64,
    pub staking_enabled: bool,
}

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

## Instruction Surface

Minimum instruction set:

- `InitializeSocialStakeConfig`
- `OpenSocialStakePosition`
- `IncreaseSocialStake`
- `RequestUnstake`
- `FinalizeUnstake`
- `RecordStakeYield`
- `ClaimStakeYield`
- `SlashStakeYield`
- `ReadStakePosition`

## Staking Rules

- a position is always tied to both a `staker` and a `creator`
- only active positions participate in reward accrual
- unstake should follow a cooldown unless governance signs off on a different policy
- creator-linked penalties should affect yield rules before principal rules
- staker principal should not be slashable in Phase 5 unless explicitly approved

## Yield Model

Yield may come from:

- designated creator reward sharing pools
- campaign-based incentives
- protocol-defined staking reward allocations

Yield should not automatically include:

- direct tips
- subscription revenue
- unrelated tokenomics emissions

Suggested accounting:

```rust
pub struct StakeYieldRecord {
    pub epoch: u64,
    pub position_id: [u8; 32],
    pub creator: Pubkey,
    pub staker: Pubkey,
    pub yield_amount: u64,
}
```

## Events

Minimum events:

- `SocialStakeOpened`
- `SocialStakeIncreased`
- `SocialUnstakeRequested`
- `SocialUnstakeFinalized`
- `SocialStakeYieldRecorded`
- `SocialStakeYieldClaimed`

## RPC and Indexer Consequences

This contract is the source of truth for:

- `getSocialStakePositions`
- `stakeBehindCreator`
- `unstakeBehindCreator`
- `claimSocialStakeYield`

The explorer backend should index:

- active positions
- yield history
- creator staking totals
- cooling-down positions

## Phase 5 Status

This contract spec is required before social staking RPC methods and explorer views can be treated as real product surfaces.

Current implementation progress:

- social staking program scaffold added in [`programs/social-staking`](/Users/ok/Documents/projects/aeko-chain/programs/social-staking)
- stake open, cooldown, finalize-unstake, yield record, and claim invariants tightened
- processor tests added for cooldown lifecycle, yield accounting, and creator/staker consistency checks
