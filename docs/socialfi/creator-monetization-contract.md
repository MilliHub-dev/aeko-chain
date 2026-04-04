# Creator Monetization Contract Specification

## Purpose

This document defines the Phase 5 creator monetization contract or module for tips, subscriptions, and paid content unlocks.

It should stay aligned with:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- [`docs/socialfi/creator-economy.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/creator-economy.md)
- [`docs/socialfi/monetization.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/monetization.md)

## Responsibilities

The monetization contract is responsible for:

- direct creator tipping
- subscription enrollment and renewal state
- paid content unlock tracking
- creator payout accounting for these flows
- optional treasury or platform fee routing if policy requires it

It is not responsible for:

- protocol engagement mining
- creator reward epoch settlement
- generic AEKO-20 token accounting outside the monetization flows it manages

## Core Monetization Primitives

### Tips

Rules:

- one-time payment
- immediately attributable to creator
- optionally fee-routed if monetization policy requires it

### Subscriptions

Rules:

- recurring or renewable payment authorization
- explicit subscription term
- active / expired / canceled states

### Paid Content Unlocks

Rules:

- one-time unlock payment
- unlock tied to wallet and content id
- unlock status must be queryable for app delivery

## Core State

Suggested state:

```rust
pub struct MonetizationConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub platform_fee_bps: u16,
    pub subscriptions_enabled: bool,
    pub paid_content_enabled: bool,
}

pub struct CreatorTipRecord {
    pub tip_id: [u8; 32],
    pub creator: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

pub struct SubscriptionRecord {
    pub subscription_id: [u8; 32],
    pub creator: Pubkey,
    pub subscriber: Pubkey,
    pub amount_per_period: u64,
    pub period_seconds: u64,
    pub started_at_unix: i64,
    pub valid_until_unix: i64,
    pub state: SubscriptionState,
}

pub struct PaidContentUnlockRecord {
    pub unlock_id: [u8; 32],
    pub content_id: [u8; 32],
    pub creator: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub unlocked_at_unix: i64,
}
```

## Instruction Surface

Minimum instruction set:

- `InitializeMonetizationConfig`
- `SendCreatorTip`
- `CreateSubscription`
- `RenewSubscription`
- `CancelSubscription`
- `UnlockPaidContent`
- `ClaimMonetizationPayout`
- `ReadMonetizationState`

## Payout Rules

- direct tips should be attributable immediately
- subscriptions should move through explicit active and expired states
- paid content unlocks should create an auditable receipt
- if fees apply, the fee split must be explicit and auditable
- monetization payouts should remain distinguishable from protocol reward payouts

## Events

Minimum events:

- `CreatorTipSent`
- `SubscriptionCreated`
- `SubscriptionRenewed`
- `SubscriptionCanceled`
- `PaidContentUnlocked`
- `MonetizationPayoutClaimed`

## RPC and Indexer Consequences

This contract enables truthful monetization views in:

- creator profiles
- creator reward and revenue history
- paid content access checks
- subscription dashboards

The explorer or SocialFi backend should index:

- tip history
- subscription state
- paid content unlock records
- creator revenue summaries

## Phase 5 Status

This contract spec is required before creator monetization endpoints should be exposed as canonical.

Current implementation progress:

- creator monetization program scaffold added in [`programs/social-monetization`](/Users/ok/Documents/projects/aeko-chain/programs/social-monetization)
- creator payout accounting now applies platform-fee routing to claimable creator balances
- duplicate tip / subscription / unlock guards and subscription state checks added
- processor tests added for fee routing, subscription lifecycle, and unlock uniqueness
