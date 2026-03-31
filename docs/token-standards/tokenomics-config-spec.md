# Tokenomics Config and State Spec

Status: Stage A design complete

Purpose: This document defines the canonical config, state, and governance storage model for AEKO tokenomics. It is the implementation bridge between [`tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md) and the Phase 2 contracts/programs that depend on it.

This spec does not implement the tokenomics program. It defines the data model and storage responsibilities that implementation must follow.

## 1. Design Goals

The tokenomics state layer must make the following explicit and auditable:

- supply baseline and circulating supply
- allocation buckets and remaining reserves
- annual and epoch emission schedule
- fee routing policy
- validator reward policy
- slashing policy
- subsidy policy
- governance-controlled parameter updates

The primary design rule is:

- economic policy lives in explicit state, not scattered constants

## 2. Proposed Architecture

The tokenomics layer should be implemented as a governance-controlled configuration program or module with four state groups:

1. Global Tokenomics Config
2. Supply and Reserve Accounting
3. Epoch Emission State
4. Subsidy and Governance Parameter State

AEKO-20, public minting, staking, treasury routing, and validator rewards should read from this layer rather than each carrying their own economic constants.

## 3. Core State Objects

### 3.1 Global Tokenomics Config

This account is the source of truth for economic policy.

```rust
pub struct TokenomicsConfig {
    pub version: u16,
    pub authority: Pubkey,
    pub treasury_account: Pubkey,
    pub validator_rewards_account: Pubkey,
    pub community_rewards_account: Pubkey,
    pub governance_program_id: Pubkey,
    pub supply_model: SupplyModel,
    pub epoch_duration_seconds: u64,
    pub epochs_per_year: u32,
    pub base_fee_atomic: u64,
    pub burn_rate_bps: u16,
    pub treasury_rate_bps: u16,
    pub validator_tip_rate_bps: u16,
    pub social_subsidy_enabled: bool,
    pub social_subsidy_default_monthly_cap: u128,
    pub floor_inflation_rate_bps: u16,
    pub min_commission_bps: u16,
    pub max_commission_bps: u16,
    pub uptime_bonus_threshold_bps: u16,
    pub slash_downtime_bps: u16,
    pub slash_double_sign_bps: u16,
    pub slash_destination: Pubkey,
    pub bump: u8,
}
```

### 3.2 Supply Model

```rust
pub enum SupplyModel {
    ManagedCapWithFloorInflation,
}
```

For the current signed-off policy:

- `500B` is the initial governed supply target
- perpetual `1%` floor inflation may continue after reserve exhaustion

### 3.3 Supply and Reserve Accounting

This account tracks actual supply and bucket usage over time.

```rust
pub struct SupplyState {
    pub total_supply_target: u128,
    pub current_total_minted: u128,
    pub current_total_burned: u128,
    pub current_circulating_supply: u128,
    pub genesis_circulating_supply: u128,
    pub validator_bucket_total: u128,
    pub validator_bucket_remaining: u128,
    pub community_bucket_total: u128,
    pub community_bucket_remaining: u128,
    pub treasury_bucket_total: u128,
    pub treasury_bucket_remaining: u128,
    pub team_bucket_total: u128,
    pub team_bucket_remaining: u128,
    pub ecosystem_bucket_total: u128,
    pub ecosystem_bucket_remaining: u128,
    pub public_sale_bucket_total: u128,
    pub public_sale_bucket_remaining: u128,
    pub floor_inflation_minted_total: u128,
    pub bump: u8,
}
```

### 3.4 Epoch Emission State

This state ensures deterministic per-epoch issuance and prevents duplicate reward minting.

```rust
pub struct EmissionState {
    pub current_epoch: u64,
    pub current_emission_band: EmissionBand,
    pub epochs_per_year: u32,
    pub epoch_emission_atomic: u128,
    pub annual_emission_target: u128,
    pub annual_remainder_carry: u128,
    pub last_emitted_epoch: Option<u64>,
    pub total_emitted_from_validator_bucket: u128,
    pub total_emitted_from_floor_inflation: u128,
    pub validator_bucket_exhausted: bool,
    pub bump: u8,
}
```

### 3.5 Emission Band

```rust
pub enum EmissionBand {
    Year1,
    Year2,
    Year3,
    Year4,
    Year5Floor,
}
```

Signed-off epoch emissions:

- Year 1: `109,589,041 AEKO`
- Year 2: `82,191,780 AEKO`
- Year 3: `54,794,520 AEKO`
- Year 4: `27,397,260 AEKO`
- Year 5+: `13,698,630 AEKO`

### 3.6 Subsidy Registry State

This state tracks per-app treasury-backed gas subsidies.

```rust
pub struct SubsidizedApp {
    pub app_id: Pubkey,
    pub authority: Pubkey,
    pub active: bool,
    pub monthly_cap: u128,
    pub spent_this_month: u128,
    pub current_month_index: u64,
    pub expires_at_epoch: Option<u64>,
    pub bump: u8,
}
```

### 3.7 Governance Parameter Update State

Governance-triggered updates should be explicit and time-delayed where required.

```rust
pub struct PendingGovernanceUpdate {
    pub proposal_id: Pubkey,
    pub field: GovernableField,
    pub old_value: u128,
    pub new_value: u128,
    pub executable_at_epoch: u64,
    pub executed: bool,
    pub bump: u8,
}
```

### 3.8 Governable Fields

```rust
pub enum GovernableField {
    BaseFee,
    BurnRate,
    TreasuryRate,
    SocialSubsidyMonthlyCap,
    EpochDuration,
    FloorInflationRate,
}
```

These match the signed-off governable set in [`tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md).

## 4. Canonical Values

### 4.1 Supply Baseline

```text
total_supply_target      = 500,000,000,000 AEKO
genesis_circulating      = 25,000,000,000 AEKO
validator_bucket         = 150,000,000,000 AEKO
community_bucket         = 125,000,000,000 AEKO
treasury_bucket          = 100,000,000,000 AEKO
team_bucket              =  60,000,000,000 AEKO
ecosystem_bucket         =  40,000,000,000 AEKO
public_sale_bucket       =  25,000,000,000 AEKO
```

### 4.2 Epoch and Fee Baseline

```text
epoch_duration_seconds   = 86,400
epochs_per_year          = 365
base_fee                 = 0.00025 AEKO
burn_rate                = 40%
treasury_rate            = 40%
validator_tip_rate       = 20%
social_subsidy_enabled   = true
social_subsidy_monthly_cap = 1,000,000 AEKO per registered app
```

### 4.3 Validator Baseline

```text
min_commission           = 5%
max_commission           = 10%
uptime_bonus_threshold   = 99%
slash_downtime           = 0.5%
slash_double_sign        = 5%
slash_destination        = treasury
```

## 5. Account Relationships

The following logical ownership model is recommended:

- `TokenomicsConfig` is governance-owned
- `SupplyState` is writable only by tokenomics authority
- `EmissionState` is writable only by reward distributor / epoch settlement path
- `SubsidizedApp` records are writable by governance or approved treasury controller
- `PendingGovernanceUpdate` records are created by governance execution flow

AEKO-20 should read:

- fee routing policy
- supply policy
- mint policy compatibility

Validator reward distribution should read:

- emission state
- commission bounds
- slashing parameters

Public minting should read:

- subsidy configuration
- supply state if public mints consume governed reserves

## 6. Required Instruction Surface

Minimum tokenomics-layer instructions:

- `InitializeTokenomicsConfig`
- `InitializeSupplyState`
- `InitializeEmissionState`
- `RegisterSubsidizedApp`
- `UpdateSubsidizedApp`
- `ResetMonthlySubsidyWindow`
- `RecordEpochEmission`
- `RecordBurn`
- `RecordTreasuryCredit`
- `QueueGovernanceUpdate`
- `ExecuteGovernanceUpdate`

## 7. Emission Processing Rules

Each epoch settlement must:

1. verify the epoch has not already been settled
2. resolve current emission band
3. calculate epoch emission
4. draw from validator bucket if available
5. if validator bucket is exhausted, mint from floor inflation path
6. update emission totals
7. emit an auditable event

Required invariants:

- no epoch may be emitted twice
- reserve depletion must be monotonic
- floor inflation minting must be tracked separately from reserve emissions

## 8. Validator Reward Settlement Rules

The signed-off validator reward model is:

```text
stake_weight = validator_stake / total_staked_supply
gross_reward = (stake_weight × epoch_emission) × uptime_multiplier
validator_take = gross_reward × commission_rate
delegator_pool = gross_reward × (1 - commission_rate)
delegator_reward = delegator_pool × (delegator_stake / total_validator_stake)
```

### 8.1 Uptime Multipliers

```text
uptime >= 99%  -> 1.10
uptime >= 95%  -> 1.00
uptime <  95%  -> 0.80
uptime <  80%  -> 0.00
```

Implementation note:

- evaluate the `< 80%` condition before the `< 95%` condition in code

### 8.2 Slashing Rule

If a validator is slashed during the epoch:

- epoch reward is `0`
- uptime multiplier is ignored
- slash amount routes to treasury

### 8.3 Recommended Reward Settlement Struct

```rust
pub struct ValidatorEpochReward {
    pub epoch: u64,
    pub validator: Pubkey,
    pub total_staked_supply: u128,
    pub validator_stake: u128,
    pub epoch_emission: u128,
    pub uptime_bps: u16,
    pub uptime_multiplier_bps: u16,
    pub gross_reward: u128,
    pub commission_bps: u16,
    pub validator_take: u128,
    pub delegator_pool: u128,
    pub slashed: bool,
}
```

### 8.4 Deterministic Math Requirements

Implementation must:

- use integer math only
- store rates in basis points or fixed-point units
- document multiplication and division order
- document rounding direction
- ensure total distributed rewards do not exceed gross reward

Recommended basis point representation:

- `1.10` multiplier -> `11000 bps`
- `1.00` multiplier -> `10000 bps`
- `0.80` multiplier -> `8000 bps`
- `0.00` multiplier -> `0 bps`

## 9. Fee Routing Rules

A fee-routing helper or policy reader should expose:

```rust
pub struct FeeRoutingBreakdown {
    pub burn_amount: u64,
    pub treasury_amount: u64,
    pub validator_tip_amount: u64,
}
```

For each fee-bearing transaction:

- calculate total fee
- split by signed-off percentages
- route atomically
- record accounting event

## 10. Team Vesting State

The tokenomics layer should not directly manage every vesting wallet, but it should define the canonical team vesting policy consumed by any vesting program.

Suggested vesting policy object:

```rust
pub struct VestingPolicy {
    pub total_allocation: u128,
    pub cliff_months: u16,
    pub total_vesting_months: u16,
    pub unlock_mode: UnlockMode,
}

pub enum UnlockMode {
    CliffUnlock,
    LinearMonthly,
}
```

Signed-off team vesting policy:

- `cliff_months = 12`
- `total_vesting_months = 12`
- `unlock_mode = CliffUnlock`

## 11. Governance Update Rules

The following fields are governable:

- base fee
- burn rate
- treasury rate
- social subsidy monthly cap
- epoch duration
- floor inflation rate

Recommended governance execution rules:

- proposal approved on-chain
- update queued in `PendingGovernanceUpdate`
- timelock period applied
- update executed and event emitted

## 12. Events

The tokenomics layer should emit:

- `TokenomicsInitialized`
- `SupplyStateInitialized`
- `EmissionRecorded`
- `ValidatorRewardSettled`
- `BurnRecorded`
- `TreasuryCredited`
- `SubsidyApplied`
- `SubsidizedAppRegistered`
- `GovernanceUpdateQueued`
- `GovernanceUpdateExecuted`

## 13. Invariants

Implementation must enforce:

- fee rates sum to `100%`
- bucket totals never go negative
- current emitted total matches reserve changes
- burned total only increases
- floor inflation total only increases after reserve exhaustion or approved path
- commission bounds stay within policy limits
- governable field changes only happen through governance flow
- slashed epochs distribute no validator reward
- validator plus delegator distributions never exceed gross reward

## 14. Recommended Build Order

1. define structs and serialization
2. initialize tokenomics accounts at genesis or network bootstrap
3. implement epoch emission settlement path
4. implement fee routing accounting path
5. implement subsidy registry and monthly reset logic
6. implement governance update queue and execution flow
7. integrate AEKO-20 and validator reward distribution against this state

## 15. Completion Status

- [x] Canonical tokenomics config model defined
- [x] Canonical supply and reserve accounting model defined
- [x] Canonical emission state model defined
- [x] Canonical subsidy registry model defined
- [x] Governable fields mapped into explicit update state
- [x] Validator reward settlement model defined
- [ ] Tokenomics program/module implemented
- [ ] Genesis/bootstrap initialization path implemented
- [ ] Epoch settlement path implemented
- [ ] Governance update execution path implemented
