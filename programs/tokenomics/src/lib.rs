#![allow(clippy::arithmetic_side_effects)]

pub mod error;
pub mod instruction;
pub mod processor;
pub mod rewards;
pub mod state;

use aeko_program_runtime::declare_process_instruction;
use aeko_sdk::pubkey::Pubkey;
use borsh::{BorshDeserialize, BorshSerialize};

pub const DEFAULT_COMPUTE_UNITS: u64 = 150;
pub const TOKENOMICS_PROGRAM_ID_BYTES: [u8; 32] = [7u8; 32];

pub fn id() -> Pubkey {
    Pubkey::new_from_array(TOKENOMICS_PROGRAM_ID_BYTES)
}

pub fn check_id(program_id: &Pubkey) -> bool {
    *program_id == id()
}

declare_process_instruction!(Entrypoint, DEFAULT_COMPUTE_UNITS, |_invoke_context| {
    processor::Processor::process(_invoke_context)
});

pub const GOVERNED_SUPPLY_TARGET_AEKO: u128 = 500_000_000_000;
pub const GENESIS_CIRCULATING_AEKO: u128 = 25_000_000_000;
pub const VALIDATOR_BUCKET_AEKO: u128 = 150_000_000_000;
pub const COMMUNITY_BUCKET_AEKO: u128 = 125_000_000_000;
pub const TREASURY_BUCKET_AEKO: u128 = 100_000_000_000;
pub const TEAM_BUCKET_AEKO: u128 = 60_000_000_000;
pub const ECOSYSTEM_BUCKET_AEKO: u128 = 40_000_000_000;
pub const PUBLIC_SALE_BUCKET_AEKO: u128 = 25_000_000_000;

pub const EPOCH_DURATION_SECONDS: u64 = 86_400;
pub const EPOCHS_PER_YEAR: u32 = 365;

pub const YEAR_1_EMISSION_AEKO: u128 = 40_000_000_000;
pub const YEAR_2_EMISSION_AEKO: u128 = 30_000_000_000;
pub const YEAR_3_EMISSION_AEKO: u128 = 20_000_000_000;
pub const YEAR_4_EMISSION_AEKO: u128 = 10_000_000_000;
pub const YEAR_5_PLUS_EMISSION_AEKO: u128 = 5_000_000_000;

pub const YEAR_1_EPOCH_EMISSION_AEKO: u128 = 109_589_041;
pub const YEAR_2_EPOCH_EMISSION_AEKO: u128 = 82_191_780;
pub const YEAR_3_EPOCH_EMISSION_AEKO: u128 = 54_794_520;
pub const YEAR_4_EPOCH_EMISSION_AEKO: u128 = 27_397_260;
pub const YEAR_5_PLUS_EPOCH_EMISSION_AEKO: u128 = 13_698_630;

pub const BURN_RATE_BPS: u16 = 4_000;
pub const TREASURY_RATE_BPS: u16 = 4_000;
pub const VALIDATOR_TIP_RATE_BPS: u16 = 2_000;

pub const MIN_COMMISSION_BPS: u16 = 500;
pub const MAX_COMMISSION_BPS: u16 = 1_000;
pub const UPTIME_BONUS_THRESHOLD_BPS: u16 = 9_900;
pub const UPTIME_NO_PENALTY_THRESHOLD_BPS: u16 = 9_500;
pub const UPTIME_ZERO_REWARD_THRESHOLD_BPS: u16 = 8_000;
pub const UPTIME_BONUS_MULTIPLIER_BPS: u16 = 11_000;
pub const UPTIME_NEUTRAL_MULTIPLIER_BPS: u16 = 10_000;
pub const UPTIME_PENALTY_MULTIPLIER_BPS: u16 = 8_000;
pub const UPTIME_ZERO_MULTIPLIER_BPS: u16 = 0;

pub const SLASH_DOWNTIME_BPS: u16 = 50;
pub const SLASH_DOUBLE_SIGN_BPS: u16 = 500;
pub const FLOOR_INFLATION_RATE_BPS: u16 = 100;
pub const SOCIAL_SUBSIDY_MONTHLY_CAP_AEKO: u128 = 1_000_000;
pub const MAX_RECORDED_VALIDATOR_REWARDS: usize = 512;

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SupplyModel {
    ManagedCapWithFloorInflation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum EmissionBand {
    Year1,
    Year2,
    Year3,
    Year4,
    Year5Floor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum UnlockMode {
    CliffUnlock,
    LinearMonthly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum GovernableField {
    BaseFee,
    BurnRate,
    TreasuryRate,
    SocialSubsidyMonthlyCap,
    EpochDuration,
    FloorInflationRate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct FeeRoutingBreakdown {
    pub burn_amount: u64,
    pub treasury_amount: u64,
    pub validator_tip_amount: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
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
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
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
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
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
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SubsidizedApp {
    pub app_id: Pubkey,
    pub authority: Pubkey,
    pub active: bool,
    pub monthly_cap: u128,
    pub spent_this_month: u128,
    pub current_month_index: u64,
    pub expires_at_epoch: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct PendingGovernanceUpdate {
    pub proposal_id: Pubkey,
    pub field: GovernableField,
    pub old_value: u128,
    pub new_value: u128,
    pub executable_at_epoch: u64,
    pub executed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct VestingPolicy {
    pub total_allocation: u128,
    pub cliff_months: u16,
    pub total_vesting_months: u16,
    pub unlock_mode: UnlockMode,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
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

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct EpochSettlement {
    pub epoch: u64,
    pub emission_band: EmissionBand,
    pub epoch_emission: u128,
    pub emitted_from_validator_bucket: u128,
    pub emitted_from_floor_inflation: u128,
    pub validator_bucket_remaining: u128,
}

impl TokenomicsConfig {
    pub fn signed_off_defaults(
        authority: Pubkey,
        treasury_account: Pubkey,
        validator_rewards_account: Pubkey,
        community_rewards_account: Pubkey,
        governance_program_id: Pubkey,
        slash_destination: Pubkey,
        base_fee_atomic: u64,
    ) -> Self {
        Self {
            version: 1,
            authority,
            treasury_account,
            validator_rewards_account,
            community_rewards_account,
            governance_program_id,
            supply_model: SupplyModel::ManagedCapWithFloorInflation,
            epoch_duration_seconds: EPOCH_DURATION_SECONDS,
            epochs_per_year: EPOCHS_PER_YEAR,
            base_fee_atomic,
            burn_rate_bps: BURN_RATE_BPS,
            treasury_rate_bps: TREASURY_RATE_BPS,
            validator_tip_rate_bps: VALIDATOR_TIP_RATE_BPS,
            social_subsidy_enabled: true,
            social_subsidy_default_monthly_cap: SOCIAL_SUBSIDY_MONTHLY_CAP_AEKO,
            floor_inflation_rate_bps: FLOOR_INFLATION_RATE_BPS,
            min_commission_bps: MIN_COMMISSION_BPS,
            max_commission_bps: MAX_COMMISSION_BPS,
            uptime_bonus_threshold_bps: UPTIME_BONUS_THRESHOLD_BPS,
            slash_downtime_bps: SLASH_DOWNTIME_BPS,
            slash_double_sign_bps: SLASH_DOUBLE_SIGN_BPS,
            slash_destination,
        }
    }
}

impl SupplyState {
    pub fn signed_off_defaults() -> Self {
        Self {
            total_supply_target: GOVERNED_SUPPLY_TARGET_AEKO,
            current_total_minted: GOVERNED_SUPPLY_TARGET_AEKO,
            current_total_burned: 0,
            current_circulating_supply: GENESIS_CIRCULATING_AEKO,
            genesis_circulating_supply: GENESIS_CIRCULATING_AEKO,
            validator_bucket_total: VALIDATOR_BUCKET_AEKO,
            validator_bucket_remaining: VALIDATOR_BUCKET_AEKO,
            community_bucket_total: COMMUNITY_BUCKET_AEKO,
            community_bucket_remaining: COMMUNITY_BUCKET_AEKO,
            treasury_bucket_total: TREASURY_BUCKET_AEKO,
            treasury_bucket_remaining: TREASURY_BUCKET_AEKO,
            team_bucket_total: TEAM_BUCKET_AEKO,
            team_bucket_remaining: TEAM_BUCKET_AEKO,
            ecosystem_bucket_total: ECOSYSTEM_BUCKET_AEKO,
            ecosystem_bucket_remaining: ECOSYSTEM_BUCKET_AEKO,
            public_sale_bucket_total: PUBLIC_SALE_BUCKET_AEKO,
            public_sale_bucket_remaining: 0,
            floor_inflation_minted_total: 0,
        }
    }
}

impl EmissionState {
    pub fn signed_off_defaults() -> Self {
        Self {
            current_epoch: 0,
            current_emission_band: EmissionBand::Year1,
            epochs_per_year: EPOCHS_PER_YEAR,
            epoch_emission_atomic: YEAR_1_EPOCH_EMISSION_AEKO,
            annual_emission_target: YEAR_1_EMISSION_AEKO,
            annual_remainder_carry: 0,
            last_emitted_epoch: None,
            total_emitted_from_validator_bucket: 0,
            total_emitted_from_floor_inflation: 0,
            validator_bucket_exhausted: false,
        }
    }

    pub fn emission_for_band(band: EmissionBand) -> (u128, u128) {
        match band {
            EmissionBand::Year1 => (YEAR_1_EMISSION_AEKO, YEAR_1_EPOCH_EMISSION_AEKO),
            EmissionBand::Year2 => (YEAR_2_EMISSION_AEKO, YEAR_2_EPOCH_EMISSION_AEKO),
            EmissionBand::Year3 => (YEAR_3_EMISSION_AEKO, YEAR_3_EPOCH_EMISSION_AEKO),
            EmissionBand::Year4 => (YEAR_4_EMISSION_AEKO, YEAR_4_EPOCH_EMISSION_AEKO),
            EmissionBand::Year5Floor => (
                YEAR_5_PLUS_EMISSION_AEKO,
                YEAR_5_PLUS_EPOCH_EMISSION_AEKO,
            ),
        }
    }
}

impl VestingPolicy {
    pub fn signed_off_team_policy() -> Self {
        Self {
            total_allocation: TEAM_BUCKET_AEKO,
            cliff_months: 12,
            total_vesting_months: 12,
            unlock_mode: UnlockMode::CliffUnlock,
        }
    }
}

pub fn fee_routing_breakdown(total_fee: u64) -> FeeRoutingBreakdown {
    let burn_amount = total_fee.saturating_mul(BURN_RATE_BPS as u64) / 10_000;
    let treasury_amount = total_fee.saturating_mul(TREASURY_RATE_BPS as u64) / 10_000;
    let validator_tip_amount = total_fee.saturating_sub(burn_amount + treasury_amount);

    FeeRoutingBreakdown {
        burn_amount,
        treasury_amount,
        validator_tip_amount,
    }
}

pub fn uptime_multiplier_bps(uptime_bps: u16) -> u16 {
    if uptime_bps < UPTIME_ZERO_REWARD_THRESHOLD_BPS {
        UPTIME_ZERO_MULTIPLIER_BPS
    } else if uptime_bps < UPTIME_NO_PENALTY_THRESHOLD_BPS {
        UPTIME_PENALTY_MULTIPLIER_BPS
    } else if uptime_bps < UPTIME_BONUS_THRESHOLD_BPS {
        UPTIME_NEUTRAL_MULTIPLIER_BPS
    } else {
        UPTIME_BONUS_MULTIPLIER_BPS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_breakdown_matches_signed_off_split() {
        let breakdown = fee_routing_breakdown(10_000);
        assert_eq!(breakdown.burn_amount, 4_000);
        assert_eq!(breakdown.treasury_amount, 4_000);
        assert_eq!(breakdown.validator_tip_amount, 2_000);
    }

    #[test]
    fn uptime_multiplier_matches_policy() {
        assert_eq!(uptime_multiplier_bps(10_000), UPTIME_BONUS_MULTIPLIER_BPS);
        assert_eq!(uptime_multiplier_bps(9_700), UPTIME_NEUTRAL_MULTIPLIER_BPS);
        assert_eq!(uptime_multiplier_bps(9_400), UPTIME_PENALTY_MULTIPLIER_BPS);
        assert_eq!(uptime_multiplier_bps(7_900), UPTIME_ZERO_MULTIPLIER_BPS);
    }
}
