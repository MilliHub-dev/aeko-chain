use {
    crate::{
        error::TokenomicsError, state::TokenomicsStateAccount, EmissionBand, EmissionState,
        EpochSettlement, ValidatorEpochReward, EPOCHS_PER_YEAR, MAX_COMMISSION_BPS,
        MIN_COMMISSION_BPS, UPTIME_ZERO_MULTIPLIER_BPS,
    },
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
};

pub fn emission_band_for_epoch(epoch: u64) -> EmissionBand {
    match epoch / EPOCHS_PER_YEAR as u64 {
        0 => EmissionBand::Year1,
        1 => EmissionBand::Year2,
        2 => EmissionBand::Year3,
        3 => EmissionBand::Year4,
        _ => EmissionBand::Year5Floor,
    }
}

pub fn settle_epoch_emission(
    state: &mut TokenomicsStateAccount,
    epoch: u64,
) -> Result<EpochSettlement, ProgramError> {
    state.ensure_initialized()?;

    if let Some(last_epoch) = state.emission.last_emitted_epoch {
        if epoch <= last_epoch {
            return Err(TokenomicsError::EpochAlreadySettled.into());
        }
    }

    let emission_band = emission_band_for_epoch(epoch);
    let (annual_emission_target, epoch_emission) = EmissionState::emission_for_band(emission_band);

    let emitted_from_validator_bucket = state
        .supply
        .validator_bucket_remaining
        .min(epoch_emission);
    let emitted_from_floor_inflation = epoch_emission.saturating_sub(emitted_from_validator_bucket);

    state.emission.current_epoch = epoch;
    state.emission.current_emission_band = emission_band;
    state.emission.annual_emission_target = annual_emission_target;
    state.emission.epoch_emission_atomic = epoch_emission;
    state.emission.last_emitted_epoch = Some(epoch);

    state.supply.validator_bucket_remaining = state
        .supply
        .validator_bucket_remaining
        .saturating_sub(emitted_from_validator_bucket);
    state.supply.current_circulating_supply = state
        .supply
        .current_circulating_supply
        .saturating_add(epoch_emission);
    state.supply.floor_inflation_minted_total = state
        .supply
        .floor_inflation_minted_total
        .saturating_add(emitted_from_floor_inflation);
    state.supply.current_total_minted = state
        .supply
        .current_total_minted
        .saturating_add(emitted_from_floor_inflation);

    state.emission.total_emitted_from_validator_bucket = state
        .emission
        .total_emitted_from_validator_bucket
        .saturating_add(emitted_from_validator_bucket);
    state.emission.total_emitted_from_floor_inflation = state
        .emission
        .total_emitted_from_floor_inflation
        .saturating_add(emitted_from_floor_inflation);
    state.emission.validator_bucket_exhausted = state.supply.validator_bucket_remaining == 0;

    Ok(EpochSettlement {
        epoch,
        emission_band,
        epoch_emission,
        emitted_from_validator_bucket,
        emitted_from_floor_inflation,
        validator_bucket_remaining: state.supply.validator_bucket_remaining,
    })
}

pub fn calculate_validator_epoch_reward(
    epoch: u64,
    validator: Pubkey,
    total_staked_supply: u128,
    validator_stake: u128,
    epoch_emission: u128,
    uptime_bps: u16,
    commission_bps: u16,
    slashed: bool,
) -> Result<ValidatorEpochReward, ProgramError> {
    if total_staked_supply == 0 || validator_stake > total_staked_supply {
        return Err(TokenomicsError::InvalidStakeWeight.into());
    }
    if commission_bps < MIN_COMMISSION_BPS || commission_bps > MAX_COMMISSION_BPS {
        return Err(TokenomicsError::InvalidCommission.into());
    }

    let uptime_multiplier_bps = if slashed {
        UPTIME_ZERO_MULTIPLIER_BPS
    } else {
        crate::uptime_multiplier_bps(uptime_bps)
    };

    let gross_reward = if uptime_multiplier_bps == 0 {
        0
    } else {
        validator_stake
            .saturating_mul(epoch_emission)
            .saturating_mul(uptime_multiplier_bps as u128)
            / total_staked_supply
            / 10_000
    };

    let validator_take = gross_reward.saturating_mul(commission_bps as u128) / 10_000;
    let delegator_pool = gross_reward.saturating_sub(validator_take);

    Ok(ValidatorEpochReward {
        epoch,
        validator,
        total_staked_supply,
        validator_stake,
        epoch_emission,
        uptime_bps,
        uptime_multiplier_bps,
        gross_reward,
        commission_bps,
        validator_take,
        delegator_pool,
        slashed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_emission_band_by_epoch() {
        assert_eq!(emission_band_for_epoch(0), EmissionBand::Year1);
        assert_eq!(emission_band_for_epoch(364), EmissionBand::Year1);
        assert_eq!(emission_band_for_epoch(365), EmissionBand::Year2);
        assert_eq!(emission_band_for_epoch(730), EmissionBand::Year3);
        assert_eq!(emission_band_for_epoch(1460), EmissionBand::Year5Floor);
    }

    #[test]
    fn settles_from_validator_bucket_first() {
        let governance = Pubkey::new_unique();
        let mut state = TokenomicsStateAccount::signed_off_defaults(
            governance,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            governance,
            Pubkey::new_unique(),
            250_000,
        );
        let settlement = settle_epoch_emission(&mut state, 0).unwrap();

        assert_eq!(settlement.epoch_emission, crate::YEAR_1_EPOCH_EMISSION_AEKO);
        assert_eq!(
            settlement.emitted_from_validator_bucket,
            crate::YEAR_1_EPOCH_EMISSION_AEKO
        );
        assert_eq!(settlement.emitted_from_floor_inflation, 0);
    }

    #[test]
    fn settles_with_floor_after_bucket_exhaustion() {
        let governance = Pubkey::new_unique();
        let mut state = TokenomicsStateAccount::signed_off_defaults(
            governance,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            governance,
            Pubkey::new_unique(),
            250_000,
        );
        state.supply.validator_bucket_remaining = 1_000;

        let settlement = settle_epoch_emission(&mut state, 1460).unwrap();
        assert_eq!(settlement.emitted_from_validator_bucket, 1_000);
        assert_eq!(
            settlement.emitted_from_floor_inflation,
            crate::YEAR_5_PLUS_EPOCH_EMISSION_AEKO - 1_000
        );
        assert!(state.emission.validator_bucket_exhausted);
    }

    #[test]
    fn calculates_validator_reward_with_bonus_multiplier() {
        let reward = calculate_validator_epoch_reward(
            0,
            Pubkey::new_unique(),
            200_000_000_000,
            2_000_000_000,
            109_589_041,
            9_950,
            800,
            false,
        )
        .unwrap();

        assert_eq!(reward.uptime_multiplier_bps, UPTIME_BONUS_MULTIPLIER_BPS);
        assert_eq!(reward.gross_reward, 1_205_479);
        assert_eq!(reward.validator_take, 96_438);
        assert_eq!(reward.delegator_pool, 1_109_041);
    }

    #[test]
    fn slashed_validator_receives_zero_reward() {
        let reward = calculate_validator_epoch_reward(
            0,
            Pubkey::new_unique(),
            200_000_000_000,
            2_000_000_000,
            109_589_041,
            10_000,
            800,
            true,
        )
        .unwrap();

        assert_eq!(reward.uptime_multiplier_bps, UPTIME_ZERO_MULTIPLIER_BPS);
        assert_eq!(reward.gross_reward, 0);
        assert_eq!(reward.validator_take, 0);
        assert_eq!(reward.delegator_pool, 0);
    }
}
