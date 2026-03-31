use {
    crate::{
        error::TokenomicsError,
        instruction::{update_config_value, validate_governable_update, TokenomicsInstruction},
        rewards,
        state::TokenomicsStateAccount,
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
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = TokenomicsInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            TokenomicsInstruction::InitializeAccount { state } => {
                Self::process_initialize(invoke_context, state)
            }
            TokenomicsInstruction::ReadConfig => Self::process_read_config(invoke_context),
            TokenomicsInstruction::SettleEpochEmission { epoch } => {
                Self::process_settle_epoch_emission(invoke_context, epoch)
            }
            TokenomicsInstruction::RecordValidatorReward { reward } => {
                Self::process_record_validator_reward(invoke_context, reward)
            }
            TokenomicsInstruction::UpdateField { field, value } => {
                Self::process_update_field(invoke_context, field, value)
            }
        }
    }

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        state: TokenomicsStateAccount,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if !state_account.is_writable() {
            return Err(InstructionError::InvalidArgument);
        }

        let governance_authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let governance_authority_key = *governance_authority.get_key();
        if !governance_authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(governance_authority);

        let current_data = state_account.get_data();
        if !current_data.is_empty()
            && current_data.iter().any(|byte| *byte != 0)
            && TokenomicsStateAccount::deserialize_padded(current_data)
                .map(|stored| stored.is_initialized)
                .unwrap_or(false)
        {
            return Err(InstructionError::AccountAlreadyInitialized);
        }

        if state.config.governance_program_id != governance_authority_key
            && state.config.authority != governance_authority_key
        {
            return Err(InstructionError::IncorrectAuthority);
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

    fn process_read_config(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;

            let state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }

            let state = TokenomicsStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            if !state.is_initialized {
                return Err(InstructionError::UninitializedAccount);
            }
            to_vec(&state.config).map_err(|_| InstructionError::InvalidAccountData)?
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn process_update_field(
        invoke_context: &mut InvokeContext,
        field: crate::GovernableField,
        value: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let governance_authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let governance_authority_key = *governance_authority.get_key();
        if !governance_authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(governance_authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if !state_account.is_writable() {
            return Err(InstructionError::InvalidArgument);
        }

        let mut state =
            TokenomicsStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        state
            .ensure_initialized()
            .map_err(Self::map_program_error)?;
        state
            .ensure_can_update(&governance_authority_key)
            .map_err(Self::map_program_error)?;
        validate_governable_update(&state.config, field, value).map_err(Self::map_program_error)?;

        let old_value = match field {
            crate::GovernableField::BaseFee => state.config.base_fee_atomic as u128,
            crate::GovernableField::BurnRate => state.config.burn_rate_bps as u128,
            crate::GovernableField::TreasuryRate => state.config.treasury_rate_bps as u128,
            crate::GovernableField::SocialSubsidyMonthlyCap => {
                state.config.social_subsidy_default_monthly_cap
            }
            crate::GovernableField::EpochDuration => state.config.epoch_duration_seconds as u128,
            crate::GovernableField::FloorInflationRate => {
                state.config.floor_inflation_rate_bps as u128
            }
        };

        update_config_value(&mut state.config, field, value);
        state.pending_updates.push(crate::PendingGovernanceUpdate {
            proposal_id: governance_authority_key,
            field,
            old_value,
            new_value: value,
            executable_at_epoch: state.emission.current_epoch,
            executed: true,
        });

        let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > state_account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }

        let data = state_account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn process_settle_epoch_emission(
        invoke_context: &mut InvokeContext,
        epoch: u64,
    ) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(2)?;

            let governance_authority =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            let governance_authority_key = *governance_authority.get_key();
            if !governance_authority.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            drop(governance_authority);

            let mut state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            if !state_account.is_writable() {
                return Err(InstructionError::InvalidArgument);
            }

            let mut state = TokenomicsStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state
                .ensure_initialized()
                .map_err(Self::map_program_error)?;
            state
                .ensure_can_update(&governance_authority_key)
                .map_err(Self::map_program_error)?;

            let settlement =
                rewards::settle_epoch_emission(&mut state, epoch).map_err(Self::map_program_error)?;

            let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?;
            if serialized.len() > state_account.get_data().len() {
                return Err(InstructionError::AccountDataTooSmall);
            }

            let data = state_account.get_data_mut()?;
            data.fill(0);
            data[..serialized.len()].copy_from_slice(&serialized);

            to_vec(&settlement).map_err(|_| InstructionError::InvalidAccountData)?
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn process_record_validator_reward(
        invoke_context: &mut InvokeContext,
        reward: crate::ValidatorEpochReward,
    ) -> Result<(), InstructionError> {
        let return_data = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(2)?;

            let governance_authority =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            let governance_authority_key = *governance_authority.get_key();
            if !governance_authority.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            drop(governance_authority);

            let mut state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            if *state_account.get_owner() != crate::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            if !state_account.is_writable() {
                return Err(InstructionError::InvalidArgument);
            }

            let mut state = TokenomicsStateAccount::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            state
                .ensure_initialized()
                .map_err(Self::map_program_error)?;
            state
                .ensure_can_update(&governance_authority_key)
                .map_err(Self::map_program_error)?;

            state.push_recorded_reward(reward.clone());

            let serialized = to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?;
            if serialized.len() > state_account.get_data().len() {
                return Err(InstructionError::AccountDataTooSmall);
            }

            let data = state_account.get_data_mut()?;
            data.fill(0);
            data[..serialized.len()].copy_from_slice(&serialized);

            to_vec(&reward).map_err(|_| InstructionError::InvalidAccountData)?
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::AccountAlreadyInitialized => {
                InstructionError::AccountAlreadyInitialized
            }
            aeko_sdk::program_error::ProgramError::UninitializedAccount => {
                InstructionError::UninitializedAccount
            }
            aeko_sdk::program_error::ProgramError::InvalidAccountOwner => {
                InstructionError::InvalidAccountOwner
            }
            aeko_sdk::program_error::ProgramError::IncorrectAuthority => {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::InvalidArgument => {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::AccountDataTooSmall => {
                InstructionError::AccountDataTooSmall
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == TokenomicsError::InvalidGovernanceAuthority as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == TokenomicsError::AlreadyInitialized as u32 =>
            {
                InstructionError::AccountAlreadyInitialized
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == TokenomicsError::UninitializedState as u32 =>
            {
                InstructionError::UninitializedAccount
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == TokenomicsError::EpochAlreadySettled as u32 =>
            {
                InstructionError::InvalidArgument
            }
            _ => InstructionError::InvalidInstructionData,
        }
    }
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        crate::{instruction, state::TokenomicsStateAccount, id},
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount},
            instruction::AccountMeta,
            pubkey::Pubkey,
            signature::{Keypair, Signer},
        },
        borsh::to_vec,
    };

    const STATE_ACCOUNT_SPACE: usize = 16_384;

    fn default_state(governance_authority: Pubkey) -> TokenomicsStateAccount {
        TokenomicsStateAccount::signed_off_defaults(
            governance_authority,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            governance_authority,
            Pubkey::new_unique(),
            250_000,
        )
    }

    fn process_instruction(
        instruction_data: &[u8],
        transaction_accounts: Vec<(Pubkey, AccountSharedData)>,
        instruction_accounts: Vec<AccountMeta>,
        expected_result: Result<(), InstructionError>,
        post: impl FnOnce(&mut InvokeContext),
    ) -> Vec<AccountSharedData> {
        mock_process_instruction(
            &id(),
            Vec::new(),
            instruction_data,
            transaction_accounts,
            instruction_accounts,
            expected_result,
            Entrypoint::vm,
            |_invoke_context| {},
            post,
        )
    }

    #[test]
    fn initialize_writes_state_account() {
        let governance = Keypair::new();
        let governance_pubkey = governance.pubkey();
        let payer = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance_pubkey);
        let instruction = instruction::initialize_account(
            &id(),
            &state_pubkey,
            &payer.pubkey(),
            &governance_pubkey,
            state.clone(),
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (state_pubkey, AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id())),
                (payer.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (
                    governance_pubkey,
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(governance_pubkey, true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let stored = TokenomicsStateAccount::deserialize_padded(accounts[0].data()).unwrap();
        assert!(stored.is_initialized);
        assert_eq!(stored.config.governance_program_id, governance_pubkey);
        assert_eq!(stored.config.base_fee_atomic, 250_000);
    }

    #[test]
    fn read_config_sets_return_data() {
        let governance = Pubkey::new_unique();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance);
        let mut state_account = AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id());
        let serialized = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..serialized.len()].copy_from_slice(&serialized);
        let instruction = instruction::read_config(&id(), &state_pubkey);

        process_instruction(
            &instruction.data,
            vec![(state_pubkey, state_account)],
            vec![AccountMeta::new_readonly(state_pubkey, false)],
            Ok(()),
            |invoke_context| {
                let (program_id, data) = invoke_context.transaction_context.get_return_data();
                assert_eq!(*program_id, id());
                let config = crate::TokenomicsConfig::try_from_slice(data).unwrap();
                assert_eq!(config.governance_program_id, governance);
                assert_eq!(config.base_fee_atomic, 250_000);
            },
        );
    }

    #[test]
    fn update_field_requires_governance_signer_and_mutates_config() {
        let governance = Keypair::new();
        let governance_pubkey = governance.pubkey();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance_pubkey);
        let mut state_account = AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id());
        let serialized = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..serialized.len()].copy_from_slice(&serialized);

        let instruction = instruction::update_field(
            &id(),
            &state_pubkey,
            &governance_pubkey,
            crate::GovernableField::BaseFee,
            500_000,
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (state_pubkey, state_account),
                (
                    governance_pubkey,
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(governance_pubkey, true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let stored = TokenomicsStateAccount::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(stored.config.base_fee_atomic, 500_000);
        assert_eq!(stored.pending_updates.len(), 1);
        assert_eq!(
            stored.pending_updates[0].field,
            crate::GovernableField::BaseFee
        );
    }

    #[test]
    fn update_field_rejects_unauthorized_signer() {
        let governance = Pubkey::new_unique();
        let unauthorized = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance);
        let mut state_account = AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id());
        let serialized = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..serialized.len()].copy_from_slice(&serialized);

        let instruction = instruction::update_field(
            &id(),
            &state_pubkey,
            &unauthorized.pubkey(),
            crate::GovernableField::BaseFee,
            500_000,
        );

        process_instruction(
            &instruction.data,
            vec![
                (state_pubkey, state_account),
                (
                    unauthorized.pubkey(),
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(unauthorized.pubkey(), true),
            ],
            Err(InstructionError::IncorrectAuthority),
            |_invoke_context| {},
        );
    }

    #[test]
    fn settle_epoch_emission_updates_state_and_return_data() {
        let governance = Keypair::new();
        let governance_pubkey = governance.pubkey();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance_pubkey);
        let mut state_account = AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id());
        let serialized = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..serialized.len()].copy_from_slice(&serialized);

        let instruction =
            crate::instruction::settle_epoch_emission(&id(), &state_pubkey, &governance_pubkey, 0);

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (state_pubkey, state_account),
                (
                    governance_pubkey,
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(governance_pubkey, true),
            ],
            Ok(()),
            |invoke_context| {
                let (program_id, data) = invoke_context.transaction_context.get_return_data();
                assert_eq!(*program_id, id());
                let settlement = crate::EpochSettlement::try_from_slice(data).unwrap();
                assert_eq!(settlement.epoch, 0);
                assert_eq!(settlement.emission_band, crate::EmissionBand::Year1);
            },
        );

        let stored = TokenomicsStateAccount::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(stored.emission.last_emitted_epoch, Some(0));
        assert_eq!(
            stored.emission.total_emitted_from_validator_bucket,
            crate::YEAR_1_EPOCH_EMISSION_AEKO
        );
    }

    #[test]
    fn record_validator_reward_persists_recent_distribution() {
        let governance = Keypair::new();
        let governance_pubkey = governance.pubkey();
        let state_pubkey = Pubkey::new_unique();
        let state = default_state(governance_pubkey);
        let mut state_account = AccountSharedData::new(1, STATE_ACCOUNT_SPACE, &id());
        let serialized = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..serialized.len()].copy_from_slice(&serialized);

        let reward = crate::rewards::calculate_validator_epoch_reward(
            0,
            Pubkey::new_unique(),
            200_000_000_000,
            2_000_000_000,
            crate::YEAR_1_EPOCH_EMISSION_AEKO,
            9_950,
            800,
            false,
        )
        .unwrap();

        let instruction = crate::instruction::record_validator_reward(
            &id(),
            &state_pubkey,
            &governance_pubkey,
            reward.clone(),
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (state_pubkey, state_account),
                (
                    governance_pubkey,
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(governance_pubkey, true),
            ],
            Ok(()),
            |invoke_context| {
                let (_, data) = invoke_context.transaction_context.get_return_data();
                let returned = crate::ValidatorEpochReward::try_from_slice(data).unwrap();
                assert_eq!(returned.validator_take, reward.validator_take);
            },
        );

        let stored = TokenomicsStateAccount::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(stored.recent_rewards.len(), 1);
        assert_eq!(stored.recent_rewards[0].gross_reward, reward.gross_reward);
    }
}
