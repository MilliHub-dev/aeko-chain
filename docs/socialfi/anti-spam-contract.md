# Anti-Spam Contract Specification

## Purpose

This document defines the Phase 5 anti-spam contract or module used when AEKO enforces posting and engagement anti-abuse rules at the protocol layer.

It should stay aligned with:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- [`docs/wallet/permission-controls-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permission-controls-spec.md)

## Responsibilities

The anti-spam contract is responsible for:

- enforcing protocol-level posting eligibility if enabled
- applying cooldowns, flags, and penalties
- recording spam-related protocol events
- exposing auditable anti-abuse state to RPC and explorers

It is not responsible for:

- app-only moderation policies
- feed ranking heuristics
- deleting chain history

## Enforcement Modes

Phase 5 should allow anti-spam policy to be configurable.

Supported modes:

- `ObserveOnly`
  - record spam indicators but do not block protocol actions
- `GateByReputation`
  - require minimum reputation for specific actions
- `GateByStake`
  - require stake-to-post or stake-to-engage for selected actions
- `PenaltyEnabled`
  - allow cooldowns, reduced eligibility, or slash-backed penalties if approved

Suggested enum:

```rust
pub enum AntiSpamMode {
    ObserveOnly,
    GateByReputation,
    GateByStake,
    PenaltyEnabled,
}
```

## Core State

Suggested state:

```rust
pub struct AntiSpamConfig {
    pub authority: Pubkey,
    pub mode: AntiSpamMode,
    pub min_post_stake: u64,
    pub min_post_reputation: u16,
    pub cooldown_epochs: u64,
    pub slash_bps: u16,
}

pub struct AntiSpamProfile {
    pub wallet: Pubkey,
    pub post_count_window: u32,
    pub engagement_count_window: u32,
    pub spam_flags: u16,
    pub gated_until_epoch: Option<u64>,
    pub slash_count: u16,
    pub last_flagged_at_unix: Option<i64>,
}
```

## Instruction Surface

Minimum instruction set:

- `InitializeAntiSpamConfig`
- `CheckPostEligibility`
- `CheckEngagementEligibility`
- `FlagSpamBehavior`
- `ApplyCooldown`
- `ClearCooldown`
- `ApplySpamPenalty`
- `ReadAntiSpamProfile`

## Enforcement Rules

- repeated posting bursts may trigger temporary gating
- self-engagement or replay behavior may be flagged
- low-reputation wallets may be denied selected actions depending on mode
- if stake gating is enabled, wallets below stake threshold should fail with a predictable error
- any slash or penalty must be explicit and auditable

## Events

Minimum events:

- `SpamFlagRaised`
- `CooldownApplied`
- `CooldownCleared`
- `SpamPenaltyApplied`
- `EligibilityCheckFailed`

## RPC and Indexer Consequences

This contract is the basis for:

- anti-spam eligibility RPC responses
- posting rejection diagnostics
- moderation and abuse explorer views
- reputation penalty indexing

Any RPC write endpoint blocked by anti-spam policy should produce:

- explicit error category
- policy reason
- retry or unlock conditions if applicable

## Phase 5 Status

This contract spec is required before protocol-enforced SocialFi anti-spam rules can be exposed as stable behavior.

Current implementation progress:

- anti-spam program scaffold added in [`programs/social-anti-spam`](/Users/ok/Documents/projects/aeko-chain/programs/social-anti-spam)
- mode-based eligibility checks added for reputation, stake, and cooldown gating
- penalty mode now updates slash and cooldown profile state
- processor tests added for reputation rejection, stake rejection, cooldown enforcement, and penalty mutation
