use {
    crate::{error::TokenomicsError, state::TokenomicsStateAccount, GovernableField, TokenomicsConfig},
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        program_error::ProgramError,
        pubkey::Pubkey,
    },
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum TokenomicsInstruction {
    InitializeAccount {
        state: TokenomicsStateAccount,
    },
    ReadConfig,
    SettleEpochEmission {
        epoch: u64,
    },
    RecordValidatorReward {
        reward: crate::ValidatorEpochReward,
    },
    UpdateField {
        field: GovernableField,
        value: u128,
    },
}

pub fn initialize_account(
    program_id: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    governance_authority_pubkey: &Pubkey,
    state: TokenomicsStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &TokenomicsInstruction::InitializeAccount { state },
        vec![
            AccountMeta::new(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*governance_authority_pubkey, true),
        ],
    )
}

pub fn read_config(program_id: &Pubkey, tokenomics_state_pubkey: &Pubkey) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &TokenomicsInstruction::ReadConfig,
        vec![AccountMeta::new_readonly(*tokenomics_state_pubkey, false)],
    )
}

pub fn update_field(
    program_id: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    governance_authority_pubkey: &Pubkey,
    field: GovernableField,
    value: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &TokenomicsInstruction::UpdateField { field, value },
        vec![
            AccountMeta::new(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*governance_authority_pubkey, true),
        ],
    )
}

pub fn settle_epoch_emission(
    program_id: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    governance_authority_pubkey: &Pubkey,
    epoch: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &TokenomicsInstruction::SettleEpochEmission { epoch },
        vec![
            AccountMeta::new(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*governance_authority_pubkey, true),
        ],
    )
}

pub fn record_validator_reward(
    program_id: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    governance_authority_pubkey: &Pubkey,
    reward: crate::ValidatorEpochReward,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &TokenomicsInstruction::RecordValidatorReward { reward },
        vec![
            AccountMeta::new(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*governance_authority_pubkey, true),
        ],
    )
}

pub fn update_config_value(config: &mut TokenomicsConfig, field: GovernableField, value: u128) {
    match field {
        GovernableField::BaseFee => config.base_fee_atomic = value as u64,
        GovernableField::BurnRate => {
            config.burn_rate_bps = value as u16;
            config.validator_tip_rate_bps = 10_000u16.saturating_sub(
                config.burn_rate_bps.saturating_add(config.treasury_rate_bps),
            );
        }
        GovernableField::TreasuryRate => {
            config.treasury_rate_bps = value as u16;
            config.validator_tip_rate_bps = 10_000u16.saturating_sub(
                config.burn_rate_bps.saturating_add(config.treasury_rate_bps),
            );
        }
        GovernableField::SocialSubsidyMonthlyCap => config.social_subsidy_default_monthly_cap = value,
        GovernableField::EpochDuration => config.epoch_duration_seconds = value as u64,
        GovernableField::FloorInflationRate => config.floor_inflation_rate_bps = value as u16,
    }
}

pub fn validate_governable_update(
    config: &TokenomicsConfig,
    field: GovernableField,
    value: u128,
) -> Result<(), ProgramError> {
    match field {
        GovernableField::BurnRate => {
            let burn_rate_bps = value as u16;
            if burn_rate_bps.saturating_add(config.treasury_rate_bps) > 10_000 {
                return Err(TokenomicsError::InvalidFeeConfiguration.into());
            }
        }
        GovernableField::TreasuryRate => {
            let treasury_rate_bps = value as u16;
            if config.burn_rate_bps.saturating_add(treasury_rate_bps) > 10_000 {
                return Err(TokenomicsError::InvalidFeeConfiguration.into());
            }
        }
        _ => {}
    }

    Ok(())
}
