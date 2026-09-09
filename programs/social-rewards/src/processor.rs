use {
    crate::{
        error::SocialRewardsError,
        instruction::SocialRewardsInstruction,
        state::{CreatorEpochInput, CreatorRewardAccount, CreatorRewardEpochRecord, RewardEpochSettlement, RewardSettlementInput, SocialRewardsStateAccount},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let instruction = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            SocialRewardsInstruction::try_from_slice(instruction_context.get_instruction_data()).map_err(|_| InstructionError::InvalidInstructionData)?
        };
        match instruction {
            SocialRewardsInstruction::InitializeConfig { state } => Self::process_initialize(invoke_context, state),
            SocialRewardsInstruction::SettleRewardEpoch { input } => Self::process_settle_epoch(invoke_context, input),
            SocialRewardsInstruction::RecordRewardEpoch { record } => Self::process_record_epoch(invoke_context, record),
            SocialRewardsInstruction::ClaimCreatorReward { creator, amount } => Self::process_claim(invoke_context, creator, amount),
            SocialRewardsInstruction::ReadRewardState { creator } => Self::process_read(invoke_context, creator),
            SocialRewardsInstruction::UpdateVaults { treasury, reward_vault } => Self::process_update_vaults(invoke_context, treasury, reward_vault),
        }
    }

    fn process_initialize(invoke_context: &mut InvokeContext, state: SocialRewardsStateAccount) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;
        let authority = instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if !authority.is_signer() { return Err(InstructionError::MissingRequiredSignature); }
        let authority_key = *authority.get_key();
        drop(authority);
        if authority_key != state.config.authority && authority_key != state.config.settlement_authority { return Err(InstructionError::IncorrectAuthority); }
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        Self::write_back(&mut state_account, &state)
    }

    fn process_update_vaults(invoke_context: &mut InvokeContext, treasury: Pubkey, reward_vault: Pubkey) -> Result<(), InstructionError> {
        let authority_key = Self::signer_key(invoke_context, 1)?;
        Self::verify_owned_account(invoke_context, 2, treasury)?;
        Self::verify_owned_account(invoke_context, 3, reward_vault)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialRewardsStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if authority_key != state.config.authority && authority_key != state.config.settlement_authority { return Err(InstructionError::IncorrectAuthority); }
        state.config.treasury = treasury;
        state.config.reward_vault = reward_vault;
        Self::write_back(&mut state_account, &state)
    }

    fn process_settle_epoch(invoke_context: &mut InvokeContext, input: RewardSettlementInput) -> Result<(), InstructionError> {
        let return_data = {
            let authority_key = Self::signer_key(invoke_context, 1)?;
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(2)?;
            let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let mut state = SocialRewardsStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            state.ensure_authority(&authority_key).map_err(Self::map_program_error)?;
            let settlement = Self::settle_epoch_rewards(&mut state, input).map_err(Self::map_program_error)?;
            Self::write_back(&mut state_account, &state)?;
            to_vec(&settlement).map_err(|_| InstructionError::InvalidAccountData)?
        };
        invoke_context.transaction_context.set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn process_record_epoch(invoke_context: &mut InvokeContext, record: CreatorRewardEpochRecord) -> Result<(), InstructionError> {
        let authority_key = Self::signer_key(invoke_context, 1)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialRewardsStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_authority(&authority_key).map_err(Self::map_program_error)?;
        Self::apply_record(&mut state, record).map_err(Self::map_program_error)?;
        Self::write_back(&mut state_account, &state)
    }

    fn process_claim(invoke_context: &mut InvokeContext, creator: Pubkey, amount: u64) -> Result<(), InstructionError> {
        let authority_key = Self::signer_key(invoke_context, 3)?;
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;
        let mut state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
        let mut state = SocialRewardsStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        if !state.config.rewards_enabled { return Err(Self::map_program_error(SocialRewardsError::RewardsPaused.into())); }
        if authority_key != creator && authority_key != state.config.authority { return Err(Self::map_program_error(SocialRewardsError::Unauthorized.into())); }
        Self::verify_owned_account(invoke_context, 1, state.config.reward_vault)?;
        let reward_account = state.creators.iter_mut().find(|entry| entry.creator == creator).ok_or_else(|| Self::map_program_error(SocialRewardsError::NothingToClaim.into()))?;
        if amount < state.config.min_claim_amount { return Err(Self::map_program_error(SocialRewardsError::ClaimBelowMinimum.into())); }
        if reward_account.claimable_amount < amount || amount == 0 { return Err(Self::map_program_error(SocialRewardsError::NothingToClaim.into())); }
        reward_account.claimable_amount -= amount;
        reward_account.total_claimed = reward_account.total_claimed.saturating_add(amount as u128);
        Self::write_back(&mut state_account, &state)?;
        drop(state_account);
        Self::transfer_owned_lamports(invoke_context, 1, 2, amount)
    }

    fn process_read(invoke_context: &mut InvokeContext, creator: Option<Pubkey>) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;
            let state_account = instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() { return Err(InstructionError::InvalidAccountOwner); }
            let state = SocialRewardsStateAccount::deserialize_padded(state_account.get_data()).map_err(|_| InstructionError::InvalidAccountData)?;
            state.ensure_initialized().map_err(Self::map_program_error)?;
            if let Some(creator) = creator { to_vec(&state.creators.iter().find(|entry| entry.creator == creator).cloned()).map_err(|_| InstructionError::InvalidAccountData)? }
            else { to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)? }
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

    fn write_back(state_account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>, state: &SocialRewardsStateAccount) -> Result<(), InstructionError> {
        let serialized = to_vec(state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() { return Err(InstructionError::AccountDataTooSmall); }
        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn settle_epoch_rewards(state: &mut SocialRewardsStateAccount, input: RewardSettlementInput) -> Result<RewardEpochSettlement, aeko_sdk::program_error::ProgramError> {
        if !state.config.rewards_enabled || input.reward_pool_amount == 0 || input.creator_entries.is_empty() { return Err(SocialRewardsError::InvalidSettlementInput.into()); }
        if state.epoch_already_settled(input.epoch) { return Err(SocialRewardsError::EpochAlreadySettled.into()); }
        let effective_entries = input.creator_entries.iter().map(Self::to_effective_points).collect::<Vec<_>>();
        let total_effective_points = effective_entries.iter().fold(0u128, |acc, (_, points)| acc.saturating_add(*points));
        if total_effective_points == 0 { return Err(SocialRewardsError::InvalidSettlementInput.into()); }
        for (entry, effective_points) in effective_entries {
            let reward_amount = ((input.reward_pool_amount as u128).saturating_mul(effective_points) / total_effective_points) as u64;
            Self::apply_record(state, CreatorRewardEpochRecord { epoch: input.epoch, creator: entry.creator, earned_points: effective_points, reward_amount, claimed_amount: 0, penalty_bps: entry.penalty_bps })?;
        }
        let settlement = RewardEpochSettlement { epoch: input.epoch, reward_pool_amount: input.reward_pool_amount, total_effective_points, settled_creator_count: input.creator_entries.len() as u32 };
        state.settlements.push(settlement.clone());
        Ok(settlement)
    }

    fn to_effective_points(entry: &CreatorEpochInput) -> (CreatorEpochInput, u128) {
        let weighted = entry.earned_points.saturating_mul(entry.reputation_multiplier_bps.max(1) as u128) / 10_000u128;
        let penalty = weighted.saturating_mul(entry.penalty_bps as u128) / 10_000u128;
        (entry.clone(), weighted.saturating_sub(penalty))
    }

    fn apply_record(state: &mut SocialRewardsStateAccount, record: CreatorRewardEpochRecord) -> Result<(), aeko_sdk::program_error::ProgramError> {
        if state.epochs.iter().any(|existing| existing.epoch == record.epoch && existing.creator == record.creator) { return Err(SocialRewardsError::EpochAlreadyRecorded.into()); }
        if let Some(existing) = state.creators.iter_mut().find(|entry| entry.creator == record.creator) {
            existing.total_earned = existing.total_earned.saturating_add(record.reward_amount as u128);
            existing.claimable_amount = existing.claimable_amount.saturating_add(record.reward_amount);
            existing.last_settled_epoch = record.epoch;
        } else {
            state.creators.push(CreatorRewardAccount { creator: record.creator, total_earned: record.reward_amount as u128, total_claimed: 0, claimable_amount: record.reward_amount, last_settled_epoch: record.epoch });
        }
        state.epochs.push(record);
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error { aeko_sdk::program_error::ProgramError::Custom(code) => InstructionError::Custom(code), _ => InstructionError::InvalidArgument }
    }
}

#[cfg(test)]
mod tests {
    use super::Processor;
    use crate::state::{CreatorEpochInput, RewardConfig, RewardSettlementInput, SocialRewardsStateAccount};
    use aeko_sdk::pubkey::Pubkey;

    fn test_state() -> SocialRewardsStateAccount {
        SocialRewardsStateAccount::new(RewardConfig { authority: Pubkey::new_unique(), treasury: Pubkey::new_unique(), reward_vault: Pubkey::new_unique(), settlement_authority: Pubkey::new_unique(), min_claim_amount: 10, rewards_enabled: true })
    }
    #[test]
    fn settlement_distributes_by_effective_points() {
        let mut state = test_state(); let a = Pubkey::new_unique(); let b = Pubkey::new_unique();
        let settlement = Processor::settle_epoch_rewards(&mut state, RewardSettlementInput { epoch: 7, reward_pool_amount: 1000, creator_entries: vec![
            CreatorEpochInput { creator: a, earned_points: 100, penalty_bps: 0, reputation_multiplier_bps: 10_000 },
            CreatorEpochInput { creator: b, earned_points: 100, penalty_bps: 5_000, reputation_multiplier_bps: 10_000 },
        ]}).unwrap();
        assert_eq!(settlement.total_effective_points, 150);
        assert_eq!(state.creators.iter().find(|x| x.creator == a).unwrap().claimable_amount, 666);
        assert_eq!(state.creators.iter().find(|x| x.creator == b).unwrap().claimable_amount, 333);
    }
    #[test]
    fn duplicate_epoch_is_rejected() {
        let mut state = test_state(); let creator = Pubkey::new_unique();
        let input = RewardSettlementInput { epoch: 9, reward_pool_amount: 500, creator_entries: vec![CreatorEpochInput { creator, earned_points: 100, penalty_bps: 0, reputation_multiplier_bps: 10_000 }] };
        Processor::settle_epoch_rewards(&mut state, input.clone()).unwrap();
        assert!(Processor::settle_epoch_rewards(&mut state, input).is_err());
    }
}
