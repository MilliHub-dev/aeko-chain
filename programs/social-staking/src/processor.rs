use {
    crate::{
        error::SocialStakingError,
        instruction::SocialStakingInstruction,
        state::{SocialStakePosition, SocialStakeState, SocialStakingStateAccount, StakeYieldRecord},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey, system_instruction},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let instruction = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            SocialStakingInstruction::try_from_slice(instruction_context.get_instruction_data())
                .map_err(|_| InstructionError::InvalidInstructionData)?
        };
        match instruction {
            SocialStakingInstruction::InitializeConfig { state } => Self::process_initialize(invoke_context, state),
            SocialStakingInstruction::OpenPosition { position } => Self::process_open_position(invoke_context, position),
            SocialStakingInstruction::RequestUnstake { position_id, unlock_epoch } => Self::process_request_unstake(invoke_context, position_id, unlock_epoch),
            SocialStakingInstruction::FinalizeUnstake { position_id, current_epoch } => Self::process_finalize_unstake(invoke_context, position_id, current_epoch),
            SocialStakingInstruction::RecordStakeYield { record } => Self::process_record_yield(invoke_context, record),
            SocialStakingInstruction::ClaimStakeYield { position_id, amount } => Self::process_claim_yield(invoke_context, position_id, amount),
            SocialStakingInstruction::ReadPosition { position_id } => Self::process_read(invoke_context, position_id),
            SocialStakingInstruction::UpdateVaults { stake_vault, reward_vault } => Self::process_update_vaults(invoke_context, stake_vault, reward_vault),
        }
    }

    fn process_initialize(invoke_context: &mut InvokeContext, state: SocialStakingStateAccount) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;
        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if !authority.is_signer() { return Err(InstructionError::MissingRequiredSignature); }
        if *authority.get_key() != state.config.authority { return Err(InstructionError::IncorrectAuthority); }
        drop(authority);
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        Self::write_back(&mut state_account, &state)
    }

    fn process_update_vaults(invoke_context: &mut InvokeContext, stake_vault: Pubkey, reward_vault: Pubkey) -> Result<(), InstructionError> {
        let authority_key = Self::signer_key(invoke_context, 1)?;
        Self::verify_owned_account(invoke_context, 2, stake_vault)?;
        Self::verify_owned_account(invoke_context, 3, reward_vault)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if authority_key != state.config.authority { return Err(InstructionError::IncorrectAuthority); }
        state.config.stake_vault = stake_vault;
        state.config.reward_vault = reward_vault;
        Self::write_back(&mut state_account, &state)
    }

    fn process_open_position(invoke_context: &mut InvokeContext, position: SocialStakePosition) -> Result<(), InstructionError> {
        let staker_key = Self::signer_key(invoke_context, 1)?;
        if position.staker != staker_key { return Err(InstructionError::IncorrectAuthority); }
        let (stake_vault, amount) = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(3)?;
            let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if !state.config.staking_enabled { return Err(Self::map_program_error(SocialStakingError::StakingDisabled.into())); }
            if position.staked_amount == 0 || position.staked_amount < state.config.min_stake_amount { return Err(Self::map_program_error(SocialStakingError::StakeTooLow.into())); }
            if position.state != SocialStakeState::Active { return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into())); }
            if state.position_exists(&position.position_id) { return Err(Self::map_program_error(SocialStakingError::PositionAlreadyExists.into())); }
            let stake_vault = state.config.stake_vault;
            let amount = position.staked_amount;
            state.positions.push(position);
            Self::write_back(&mut state_account, &state)?;
            (stake_vault, amount)
        };
        Self::verify_owned_account(invoke_context, 2, stake_vault)?;
        Self::collect_from_signer(invoke_context, staker_key, stake_vault, amount)
    }

    fn process_request_unstake(invoke_context: &mut InvokeContext, position_id: [u8; 32], unlock_epoch: u64) -> Result<(), InstructionError> {
        let staker_key = Self::signer_key(invoke_context, 1)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        let cooldown_epochs = state.config.cooldown_epochs;
        let position = state.positions.iter_mut().find(|entry| entry.position_id == position_id && entry.staker == staker_key)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.state != SocialStakeState::Active { return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into())); }
        if unlock_epoch < position.activated_at_epoch.saturating_add(cooldown_epochs) { return Err(Self::map_program_error(SocialStakingError::InvalidUnstakeEpoch.into())); }
        position.state = SocialStakeState::CoolingDown;
        position.unlock_epoch = Some(unlock_epoch);
        Self::write_back(&mut state_account, &state)
    }

    fn process_finalize_unstake(invoke_context: &mut InvokeContext, position_id: [u8; 32], current_epoch: u64) -> Result<(), InstructionError> {
        let staker_key = Self::signer_key(invoke_context, 1)?;
        let (stake_vault, amount) = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(3)?;
            let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            let stake_vault = state.config.stake_vault;
            let position = state.positions.iter_mut().find(|entry| entry.position_id == position_id && entry.staker == staker_key)
                .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
            if position.state != SocialStakeState::CoolingDown { return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into())); }
            if position.unlock_epoch.unwrap_or(u64::MAX) > current_epoch { return Err(Self::map_program_error(SocialStakingError::CooldownNotReached.into())); }
            let amount = position.staked_amount;
            position.state = SocialStakeState::Closed;
            Self::write_back(&mut state_account, &state)?;
            (stake_vault, amount)
        };
        Self::verify_owned_account(invoke_context, 2, stake_vault)?;
        Self::transfer_owned_lamports(invoke_context, 2, 1, amount)
    }

    fn process_record_yield(invoke_context: &mut InvokeContext, record: StakeYieldRecord) -> Result<(), InstructionError> {
        let authority_key = Self::signer_key(invoke_context, 1)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_authority(&authority_key).map_err(Self::map_program_error)?;
        let position = state.positions.iter_mut().find(|entry| entry.position_id == record.position_id)
            .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
        if position.state != SocialStakeState::Active { return Err(Self::map_program_error(SocialStakingError::PositionNotActive.into())); }
        if record.yield_amount == 0 || record.creator != position.creator || record.staker != position.staker { return Err(Self::map_program_error(SocialStakingError::InvalidYieldRecord.into())); }
        position.accumulated_yield = position.accumulated_yield.saturating_add(record.yield_amount);
        state.yield_records.push(record);
        Self::write_back(&mut state_account, &state)
    }

    fn process_claim_yield(invoke_context: &mut InvokeContext, position_id: [u8; 32], amount: u64) -> Result<(), InstructionError> {
        let staker_key = Self::signer_key(invoke_context, 1)?;
        let reward_vault = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(3)?;
            let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let mut state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            let reward_vault = state.config.reward_vault;
            let position = state.positions.iter_mut().find(|entry| entry.position_id == position_id && entry.staker == staker_key)
                .ok_or_else(|| Self::map_program_error(SocialStakingError::PositionNotFound.into()))?;
            if position.accumulated_yield < amount || amount == 0 { return Err(Self::map_program_error(SocialStakingError::NothingToClaim.into())); }
            position.accumulated_yield -= amount;
            position.claimed_yield = position.claimed_yield.saturating_add(amount);
            Self::write_back(&mut state_account, &state)?;
            reward_vault
        };
        Self::verify_owned_account(invoke_context, 2, reward_vault)?;
        Self::transfer_owned_lamports(invoke_context, 2, 1, amount)
    }

    fn process_read(invoke_context: &mut InvokeContext, position_id: Option<[u8; 32]>) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;
            let state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let state = SocialStakingStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(position_id) = position_id {
                to_vec(&state.positions.iter().find(|entry| entry.position_id == position_id).cloned()).map_err(|_| InstructionError::InvalidAccountData)?
            } else { to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)? }
        };
        invoke_context.transaction_context.set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn signer_key(invoke_context: &InvokeContext, index: u16) -> Result<Pubkey, InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context.try_borrow_instruction_account(transaction_context, index)?;
        if !account.is_signer() { return Err(InstructionError::MissingRequiredSignature); }
        Ok(*account.get_key())
    }

    fn verify_owned_account(invoke_context: &InvokeContext, index: u16, expected: Pubkey) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context.try_borrow_instruction_account(transaction_context, index)?;
        if *account.get_key() != expected { return Err(InstructionError::InvalidArgument); }
        if *account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        Ok(())
    }

    fn collect_from_signer(invoke_context: &mut InvokeContext, source: Pubkey, destination: Pubkey, amount: u64) -> Result<(), InstructionError> {
        invoke_context.native_invoke(system_instruction::transfer(&source, &destination, amount).into(), &[source])
    }

    fn transfer_owned_lamports(invoke_context: &InvokeContext, source_index: u16, destination_index: u16, amount: u64) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let mut source = instruction_context.try_borrow_instruction_account(transaction_context, source_index)?;
        if *source.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        source.checked_sub_lamports(amount)?;
        drop(source);
        let mut destination = instruction_context.try_borrow_instruction_account(transaction_context, destination_index)?;
        destination.checked_add_lamports(amount)?;
        Ok(())
    }

    fn write_back(state_account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>, state: &SocialStakingStateAccount) -> Result<(), InstructionError> {
        let serialized = to_vec(state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() { return Err(InstructionError::AccountDataTooSmall); }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error { aeko_sdk::program_error::ProgramError::Custom(code) => InstructionError::Custom(code), _ => InstructionError::InvalidArgument }
    }
}

#[cfg(test)]
mod tests {
    use crate::state::{SocialStakeConfig, SocialStakePosition, SocialStakeState, SocialStakingStateAccount, StakeYieldRecord};
    use aeko_sdk::pubkey::Pubkey;

    fn test_state(min_stake_amount: u64, cooldown_epochs: u64) -> SocialStakingStateAccount {
        SocialStakingStateAccount::new(SocialStakeConfig { authority: Pubkey::new_unique(), stake_vault: Pubkey::new_unique(), reward_vault: Pubkey::new_unique(), min_stake_amount, cooldown_epochs, staking_enabled: true })
    }
    fn test_position(staker: Pubkey, creator: Pubkey, position_id: [u8; 32], staked_amount: u64, activated_at_epoch: u64) -> SocialStakePosition {
        SocialStakePosition { position_id, staker, creator, staked_amount, activated_at_epoch, unlock_epoch: None, accumulated_yield: 0, claimed_yield: 0, state: SocialStakeState::Active }
    }
    #[test]
    fn open_request_finalize_state_machine_is_consistent() {
        let staker = Pubkey::new_unique(); let creator = Pubkey::new_unique(); let id = [1u8; 32];
        let mut state = test_state(100, 3); state.positions.push(test_position(staker, creator, id, 500, 10));
        let p = state.positions.first_mut().unwrap(); p.state = SocialStakeState::CoolingDown; p.unlock_epoch = Some(13);
        assert_eq!(p.unlock_epoch, Some(13)); p.state = SocialStakeState::Closed; assert_eq!(p.state, SocialStakeState::Closed);
    }
    #[test]
    fn record_yield_updates_position() {
        let staker = Pubkey::new_unique(); let creator = Pubkey::new_unique(); let id = [2u8; 32];
        let mut state = test_state(100, 3); state.positions.push(test_position(staker, creator, id, 500, 7));
        let record = StakeYieldRecord { epoch: 8, position_id: id, creator, staker, yield_amount: 120 };
        state.positions.first_mut().unwrap().accumulated_yield += record.yield_amount; state.yield_records.push(record);
        assert_eq!(state.positions[0].accumulated_yield, 120);
    }
}
