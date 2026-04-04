use {
    crate::{
        error::SocialAntiSpamError,
        instruction::SocialAntiSpamInstruction,
        state::{AntiSpamMode, AntiSpamProfile, SocialAntiSpamStateAccount},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction = SocialAntiSpamInstruction::try_from_slice(
            instruction_context.get_instruction_data(),
        )
        .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            SocialAntiSpamInstruction::InitializeConfig { state } => {
                Self::process_initialize(invoke_context, state)
            }
            SocialAntiSpamInstruction::CheckPostEligibility {
                wallet,
                current_epoch,
                reputation_score,
                staked_amount,
            } => Self::process_check(invoke_context, wallet, current_epoch, reputation_score, staked_amount),
            SocialAntiSpamInstruction::CheckEngagementEligibility {
                wallet,
                current_epoch,
                reputation_score,
                staked_amount,
            } => Self::process_check(invoke_context, wallet, current_epoch, reputation_score, staked_amount),
            SocialAntiSpamInstruction::FlagSpamBehavior { wallet, timestamp } => {
                Self::process_flag(invoke_context, wallet, timestamp)
            }
            SocialAntiSpamInstruction::ApplyCooldown {
                wallet,
                gated_until_epoch,
            } => Self::process_apply_cooldown(invoke_context, wallet, gated_until_epoch),
            SocialAntiSpamInstruction::ClearCooldown { wallet } => {
                Self::process_clear_cooldown(invoke_context, wallet)
            }
            SocialAntiSpamInstruction::ApplySpamPenalty { wallet } => {
                Self::process_apply_penalty(invoke_context, wallet)
            }
            SocialAntiSpamInstruction::ReadAntiSpamProfile { wallet } => {
                Self::process_read(invoke_context, wallet)
            }
        }
    }

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        state: SocialAntiSpamStateAccount,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let authority_key = *authority.get_key();
        drop(authority);

        if authority_key != state.config.authority {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidInstructionData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn process_check(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
        current_epoch: u64,
        reputation_score: u16,
        staked_amount: u64,
    ) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;
            let state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            let state = SocialAntiSpamStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            Self::evaluate_eligibility(&state, wallet, current_epoch, reputation_score, staked_amount)
                .map_err(Self::map_program_error)?;

            to_vec(&true).map_err(|_| InstructionError::InvalidAccountData)?
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn process_flag(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
        timestamp: i64,
    ) -> Result<(), InstructionError> {
        Self::mutate_profile(invoke_context, |state, authority_key| {
            state.ensure_authority(&authority_key)?;
            let profile = Self::get_or_insert_profile(state, wallet);
            profile.spam_flags = profile.spam_flags.saturating_add(1);
            profile.last_flagged_at_unix = Some(timestamp);
            Ok(())
        })
    }

    fn process_apply_cooldown(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
        gated_until_epoch: u64,
    ) -> Result<(), InstructionError> {
        Self::mutate_profile(invoke_context, |state, authority_key| {
            state.ensure_authority(&authority_key)?;
            let profile = Self::get_or_insert_profile(state, wallet);
            profile.gated_until_epoch = Some(gated_until_epoch);
            Ok(())
        })
    }

    fn process_clear_cooldown(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        Self::mutate_profile(invoke_context, |state, authority_key| {
            state.ensure_authority(&authority_key)?;
            let profile = Self::get_or_insert_profile(state, wallet);
            profile.gated_until_epoch = None;
            Ok(())
        })
    }

    fn process_apply_penalty(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        Self::mutate_profile(invoke_context, |state, authority_key| {
            state.ensure_authority(&authority_key)?;
            if state.config.mode != AntiSpamMode::PenaltyEnabled {
                return Err(SocialAntiSpamError::NotAllowedByMode.into());
            }
            Self::apply_penalty_to_profile(state, wallet);
            Ok(())
        })
    }

    fn process_read(
        invoke_context: &mut InvokeContext,
        wallet: Option<Pubkey>,
    ) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;
            let state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            let state = SocialAntiSpamStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(wallet) = wallet {
                let maybe_profile = state.profiles.iter().find(|entry| entry.wallet == wallet).cloned();
                to_vec(&maybe_profile).map_err(|_| InstructionError::InvalidAccountData)?
            } else {
                to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?
            }
        };
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn mutate_profile<F>(
        invoke_context: &mut InvokeContext,
        mutator: F,
    ) -> Result<(), InstructionError>
    where
        F: FnOnce(&mut SocialAntiSpamStateAccount, Pubkey) -> Result<(), aeko_sdk::program_error::ProgramError>,
    {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let authority_key = *authority.get_key();
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialAntiSpamStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        mutator(&mut state, authority_key).map_err(Self::map_program_error)?;

        let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn get_or_insert_profile(
        state: &mut SocialAntiSpamStateAccount,
        wallet: Pubkey,
    ) -> &mut AntiSpamProfile {
        if let Some(index) = state.profiles.iter().position(|entry| entry.wallet == wallet) {
            return &mut state.profiles[index];
        }
        state.profiles.push(AntiSpamProfile {
            wallet,
            post_count_window: 0,
            engagement_count_window: 0,
            spam_flags: 0,
            gated_until_epoch: None,
            slash_count: 0,
            last_flagged_at_unix: None,
        });
        state.profiles.last_mut().expect("profile just inserted")
    }

    fn evaluate_eligibility(
        state: &SocialAntiSpamStateAccount,
        wallet: Pubkey,
        current_epoch: u64,
        reputation_score: u16,
        staked_amount: u64,
    ) -> Result<(), aeko_sdk::program_error::ProgramError> {
        if let Some(profile) = state.profile_for_wallet(&wallet) {
            if profile.gated_until_epoch.unwrap_or(0) > current_epoch {
                return Err(SocialAntiSpamError::CooldownActive.into());
            }
        }

        match state.config.mode {
            AntiSpamMode::ObserveOnly => Ok(()),
            AntiSpamMode::GateByReputation | AntiSpamMode::PenaltyEnabled => {
                if reputation_score < state.config.min_post_reputation {
                    Err(SocialAntiSpamError::ReputationTooLow.into())
                } else {
                    Ok(())
                }
            }
            AntiSpamMode::GateByStake => {
                if staked_amount < state.config.min_post_stake {
                    Err(SocialAntiSpamError::StakeTooLow.into())
                } else {
                    Ok(())
                }
            }
        }
    }

    fn apply_penalty_to_profile(state: &mut SocialAntiSpamStateAccount, wallet: Pubkey) {
        let cooldown_epochs = state.config.cooldown_epochs;
        let profile = Self::get_or_insert_profile(state, wallet);
        profile.slash_count = profile.slash_count.saturating_add(1);
        profile.spam_flags = profile.spam_flags.saturating_add(1);
        profile.gated_until_epoch = Some(cooldown_epochs);
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::Custom(code) => InstructionError::Custom(code),
            _ => InstructionError::InvalidArgument,
        }
    }
}

#[cfg(test)]
mod tests {
    use {
        super::Processor,
        crate::state::{AntiSpamConfig, AntiSpamMode, AntiSpamProfile, SocialAntiSpamStateAccount},
        aeko_sdk::pubkey::Pubkey,
    };

    fn test_state(mode: AntiSpamMode) -> SocialAntiSpamStateAccount {
        SocialAntiSpamStateAccount::new(AntiSpamConfig {
            authority: Pubkey::new_unique(),
            mode,
            min_post_stake: 500,
            min_post_reputation: 400,
            cooldown_epochs: 3,
            slash_bps: 100,
        })
    }

    #[test]
    fn gate_by_reputation_rejects_low_score() {
        let state = test_state(AntiSpamMode::GateByReputation);
        let result = Processor::evaluate_eligibility(
            &state,
            Pubkey::new_unique(),
            10,
            200,
            1_000,
        );
        assert!(result.is_err());
    }

    #[test]
    fn gate_by_stake_rejects_low_stake() {
        let state = test_state(AntiSpamMode::GateByStake);
        let result = Processor::evaluate_eligibility(
            &state,
            Pubkey::new_unique(),
            10,
            999,
            100,
        );
        assert!(result.is_err());
    }

    #[test]
    fn cooldown_profile_rejects_actions_until_epoch_passes() {
        let wallet = Pubkey::new_unique();
        let mut state = test_state(AntiSpamMode::ObserveOnly);
        state.profiles.push(AntiSpamProfile {
            wallet,
            post_count_window: 0,
            engagement_count_window: 0,
            spam_flags: 1,
            gated_until_epoch: Some(15),
            slash_count: 0,
            last_flagged_at_unix: None,
        });

        let blocked = Processor::evaluate_eligibility(&state, wallet, 14, 999, 999);
        assert!(blocked.is_err());

        let allowed = Processor::evaluate_eligibility(&state, wallet, 15, 999, 999);
        assert!(allowed.is_ok());
    }

    #[test]
    fn penalty_mode_updates_slash_and_cooldown_state() {
        let wallet = Pubkey::new_unique();
        let mut state = test_state(AntiSpamMode::PenaltyEnabled);
        Processor::apply_penalty_to_profile(&mut state, wallet);
        let profile = state.profile_for_wallet(&wallet).expect("profile");
        assert_eq!(profile.slash_count, 1);
        assert_eq!(profile.spam_flags, 1);
        assert_eq!(profile.gated_until_epoch, Some(3));
    }
}
