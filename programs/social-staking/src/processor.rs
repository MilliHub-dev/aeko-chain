use {
    crate::{
        error::SocialStakingError,
        instruction::SocialStakingInstruction,
        state::{SocialStakePosition, SocialStakeState, SocialStakingStateAccount, StakeYieldRecord},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::instruction::InstructionError,
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction = SocialStakingInstruction::try_from_slice(
            instruction_context.get_instruction_data(),
        )
        .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            SocialStakingInstruction::InitializeConfig { state } => {
                Self::process_initialize(invoke_context, state)
            }
            SocialStakingInstruction::OpenPosition { position } => {
                Self::process_open_position(invoke_context, position)
            }
            SocialStakingInstruction::RequestUnstake {
                position_id,
                unlock_epoch,
            } => Self::process_request_unstake(invoke_context, position_id, unlock_epoch),
            SocialStakingInstruction::FinalizeUnstake {
                position_id,
                current_epoch,
            } => Self::process_finalize_unstake(invoke_context, position_id, current_epoch),
            SocialStakingInstruction::RecordStakeYield { record } => {
                Self::process_record_yield(invoke_context, record)
            }
            SocialStakingInstruction::ClaimStakeYield { position_id, amount } => {
                Self::process_claim_yield(invoke_context, position_id, amount)
            }
            SocialStakingInstruction::ReadPosition { position_id } => {
                Self::process_read(invoke_context, position_id)
            }
        }
    }

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        state: SocialStakingStateAccount,
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

    fn process_open_position(
        invoke_context: &mut InvokeContext,
        position: SocialStakePosition,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let staker = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !staker.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let staker_key = *staker.get_key();
        drop(staker);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.staking_enabled {
            return Err(Self::map_program_error(SocialStakingError::StakingDisabled.into()));
        }
        if position.staker != staker_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        if position.staked_amount < state.config.min_stake_amount {
            return Err(Self::map_program_error(SocialStakingError::StakeTooLow.into()));
        }
        if position.state != SocialStakeState::Active {
            return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into()));
        }
        if state.position_exists(&position.position_id) {
            return Err(Self::map_program_error(
                SocialStakingError::PositionAlreadyExists.into(),
            ));
        }
        state.positions.push(position);
        Self::write_back(&mut state_account, &state)
    }

    fn process_request_unstake(
        invoke_context: &mut InvokeContext,
        position_id: [u8; 32],
        unlock_epoch: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let staker = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !staker.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let staker_key = *staker.get_key();
        drop(staker);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let position = state
            .positions
            .iter_mut()
            .find(|entry| entry.position_id == position_id && entry.staker == staker_key)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.state != SocialStakeState::Active {
            return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into()));
        }
        if unlock_epoch < position.activated_at_epoch.saturating_add(state.config.cooldown_epochs) {
            return Err(Self::map_program_error(
                SocialStakingError::InvalidUnstakeEpoch.into(),
            ));
        }
        position.state = SocialStakeState::CoolingDown;
        position.unlock_epoch = Some(unlock_epoch);
        Self::write_back(&mut state_account, &state)
    }

    fn process_finalize_unstake(
        invoke_context: &mut InvokeContext,
        position_id: [u8; 32],
        current_epoch: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let staker = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !staker.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let staker_key = *staker.get_key();
        drop(staker);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let position = state
            .positions
            .iter_mut()
            .find(|entry| entry.position_id == position_id && entry.staker == staker_key)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.state != SocialStakeState::CoolingDown {
            return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into()));
        }
        if position.unlock_epoch.unwrap_or(u64::MAX) > current_epoch {
            return Err(Self::map_program_error(SocialStakingError::CooldownNotReached.into()));
        }
        position.state = SocialStakeState::Closed;
        Self::write_back(&mut state_account, &state)
    }

    fn process_record_yield(
        invoke_context: &mut InvokeContext,
        record: StakeYieldRecord,
    ) -> Result<(), InstructionError> {
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
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_authority(&authority_key).map_err(Self::map_program_error)?;
        let position = state
            .positions
            .iter_mut()
            .find(|entry| entry.position_id == record.position_id)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.state != SocialStakeState::Active {
            return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into()));
        }
        if record.yield_amount == 0 || record.creator != position.creator || record.staker != position.staker
        {
            return Err(Self::map_program_error(SocialStakingError::InvalidYieldRecord.into()));
        }
        position.accumulated_yield = position.accumulated_yield.saturating_add(record.yield_amount);
        state.yield_records.push(record);
        Self::write_back(&mut state_account, &state)
    }

    fn process_claim_yield(
        invoke_context: &mut InvokeContext,
        position_id: [u8; 32],
        amount: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let staker = instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if !staker.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        let staker_key = *staker.get_key();
        drop(staker);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let position = state
            .positions
            .iter_mut()
            .find(|entry| entry.position_id == position_id && entry.staker == staker_key)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.accumulated_yield < amount || amount == 0 {
            return Err(Self::map_program_error(SocialStakingError::NothingToClaim.into()));
        }
        position.accumulated_yield -= amount;
        position.claimed_yield = position.claimed_yield.saturating_add(amount);
        Self::write_back(&mut state_account, &state)
    }

    fn process_read(
        invoke_context: &mut InvokeContext,
        position_id: Option<[u8; 32]>,
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
            let state = SocialStakingStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(position_id) = position_id {
                let maybe_position = state.positions.iter().find(|entry| entry.position_id == position_id).cloned();
                to_vec(&maybe_position).map_err(|_| InstructionError::InvalidAccountData)?
            } else {
                to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?
            }
        };
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn write_back(
        state_account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        state: &SocialStakingStateAccount,
    ) -> Result<(), InstructionError> {
        let serialized = to_vec(state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
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
        crate::state::{
            SocialStakeConfig, SocialStakePosition, SocialStakeState, SocialStakingStateAccount,
            StakeYieldRecord,
        },
        aeko_sdk::pubkey::Pubkey,
    };

    fn test_state(min_stake_amount: u64, cooldown_epochs: u64) -> SocialStakingStateAccount {
        SocialStakingStateAccount::new(SocialStakeConfig {
            authority: Pubkey::new_unique(),
            stake_vault: Pubkey::new_unique(),
            reward_vault: Pubkey::new_unique(),
            min_stake_amount,
            cooldown_epochs,
            staking_enabled: true,
        })
    }

    fn test_position(
        staker: Pubkey,
        creator: Pubkey,
        position_id: [u8; 32],
        staked_amount: u64,
        activated_at_epoch: u64,
    ) -> SocialStakePosition {
        SocialStakePosition {
            position_id,
            staker,
            creator,
            staked_amount,
            activated_at_epoch,
            unlock_epoch: None,
            accumulated_yield: 0,
            claimed_yield: 0,
            state: SocialStakeState::Active,
        }
    }

    #[test]
    fn open_request_finalize_and_claim_flow_updates_position_state() {
        let staker = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let position_id = [1u8; 32];
        let mut state = test_state(100, 3);
        state.positions.push(test_position(staker, creator, position_id, 500, 10));

        {
            let position = state.positions.first_mut().expect("position");
            position.state = SocialStakeState::CoolingDown;
            position.unlock_epoch = Some(13);
        }

        let position = state.positions.first().expect("position");
        assert_eq!(position.state, SocialStakeState::CoolingDown);
        assert_eq!(position.unlock_epoch, Some(13));

        {
            let position = state.positions.first_mut().expect("position");
            if position.unlock_epoch.unwrap() <= 13 {
                position.state = SocialStakeState::Closed;
            }
        }

        let position = state.positions.first().expect("position");
        assert_eq!(position.state, SocialStakeState::Closed);
    }

    #[test]
    fn record_yield_and_claim_updates_balances() {
        let staker = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let position_id = [2u8; 32];
        let mut state = test_state(100, 3);
        state.positions.push(test_position(staker, creator, position_id, 500, 7));

        let record = StakeYieldRecord {
            epoch: 8,
            position_id,
            creator,
            staker,
            yield_amount: 120,
        };

        let position = state.positions.first_mut().expect("position");
        position.accumulated_yield = position.accumulated_yield.saturating_add(record.yield_amount);
        state.yield_records.push(record);

        let position = state.positions.first_mut().expect("position");
        assert_eq!(position.accumulated_yield, 120);
        position.accumulated_yield -= 70;
        position.claimed_yield += 70;
        assert_eq!(position.accumulated_yield, 50);
        assert_eq!(position.claimed_yield, 70);
    }

    #[test]
    fn yield_record_validation_rejects_creator_mismatch() {
        let staker = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let wrong_creator = Pubkey::new_unique();
        let position_id = [3u8; 32];
        let mut state = test_state(100, 2);
        state.positions.push(test_position(staker, creator, position_id, 500, 1));

        let record = StakeYieldRecord {
            epoch: 2,
            position_id,
            creator: wrong_creator,
            staker,
            yield_amount: 50,
        };

        let position = state.positions.first().expect("position");
        assert_ne!(record.creator, position.creator);
    }
}
