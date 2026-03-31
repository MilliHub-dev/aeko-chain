use {
    crate::{
        error::PublicMintError,
        instruction::PublicMintInstruction,
        state::{PublicMintPolicy, PublicMintState},
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    aeko_token_20_program::{instruction as token20_instruction, state::Aeko20Account},
    aeko_tokenomics_program::state::TokenomicsStateAccount,
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = PublicMintInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            PublicMintInstruction::InitializePolicy { state } => {
                Self::process_initialize_policy(invoke_context, state)
            }
            PublicMintInstruction::UpdatePolicy { policy } => {
                Self::process_update_policy(invoke_context, policy)
            }
            PublicMintInstruction::AddToBlocklist { wallet } => {
                Self::process_add_to_blocklist(invoke_context, wallet)
            }
            PublicMintInstruction::RemoveFromBlocklist { wallet } => {
                Self::process_remove_from_blocklist(invoke_context, wallet)
            }
            PublicMintInstruction::AddToAllowlist { wallet } => {
                Self::process_add_to_allowlist(invoke_context, wallet)
            }
            PublicMintInstruction::RemoveFromAllowlist { wallet } => {
                Self::process_remove_from_allowlist(invoke_context, wallet)
            }
            PublicMintInstruction::PublicMint {
                current_epoch,
                amount,
                app_id,
                requested_subsidy,
            } => Self::process_public_mint(
                invoke_context,
                current_epoch,
                amount,
                app_id,
                requested_subsidy,
            ),
        }
    }

    fn process_initialize_policy(
        invoke_context: &mut InvokeContext,
        state: PublicMintState,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *state_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if state_account.get_data().iter().any(|byte| *byte != 0)
            && PublicMintState::deserialize_padded(state_account.get_data())
                .map(|stored| stored.policy.is_initialized)
                .unwrap_or(false)
        {
            return Err(InstructionError::AccountAlreadyInitialized);
        }

        Self::write_state(&mut state_account, &state)
    }

    fn process_update_policy(
        invoke_context: &mut InvokeContext,
        policy: PublicMintPolicy,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = PublicMintState::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !state.policy.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        if policy.requires_allowlist && policy.authority == Pubkey::default() {
            return Err(InstructionError::InvalidArgument);
        }

        state.policy = policy;
        Self::write_state(&mut state_account, &state)
    }

    fn process_add_to_blocklist(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = PublicMintState::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        if !state.is_blocklisted(&wallet) {
            state.blocklist.push(wallet);
            if state.blocklist.len() > crate::MAX_BLOCKLISTED_WALLETS {
                state.blocklist.remove(0);
            }
        }
        Self::write_state(&mut state_account, &state)
    }

    fn process_remove_from_blocklist(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = PublicMintState::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        state.blocklist.retain(|blocked| blocked != &wallet);
        Self::write_state(&mut state_account, &state)
    }

    fn process_add_to_allowlist(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = PublicMintState::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        if !state.is_allowlisted(&wallet) {
            state.allowlist.push(wallet);
            if state.allowlist.len() > crate::MAX_ALLOWLISTED_WALLETS {
                state.allowlist.remove(0);
            }
        }
        Self::write_state(&mut state_account, &state)
    }

    fn process_remove_from_allowlist(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority.get_key();
        if !authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority);

        let mut state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = PublicMintState::deserialize_padded(state_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if state.policy.authority != authority_key {
            return Err(InstructionError::IncorrectAuthority);
        }
        state.allowlist.retain(|allowed| allowed != &wallet);
        Self::write_state(&mut state_account, &state)
    }

    fn process_public_mint(
        invoke_context: &mut InvokeContext,
        current_epoch: u64,
        amount: u128,
        app_id: Option<Pubkey>,
        requested_subsidy: u128,
    ) -> Result<(), InstructionError> {
        let (mint_instruction, mint_authority_key, serialized_state, return_data) = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(7)?;

            let wallet_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 4)?;
            let wallet_key = *wallet_account.get_key();
            drop(wallet_account);

            let wallet_authority =
                instruction_context.try_borrow_instruction_account(transaction_context, 5)?;
            let wallet_authority_key = *wallet_authority.get_key();
            if !wallet_authority.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            if wallet_authority_key != wallet_key {
                return Err(InstructionError::IncorrectAuthority);
            }
            drop(wallet_authority);

            let mint_authority =
                instruction_context.try_borrow_instruction_account(transaction_context, 6)?;
            let mint_authority_key = *mint_authority.get_key();
            if !mint_authority.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            drop(mint_authority);

            let tokenomics_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
            if *tokenomics_account.get_owner() != aeko_tokenomics_program::id() {
                return Err(Self::map_program_error(PublicMintError::InvalidTokenomicsState.into()));
            }
            let tokenomics =
                TokenomicsStateAccount::deserialize_padded(tokenomics_account.get_data())
                    .map_err(|_| InstructionError::InvalidAccountData)?;
            drop(tokenomics_account);

            let mint_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if *mint_account.get_owner() != aeko_token_20_program::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            let mint_key = *mint_account.get_key();
            drop(mint_account);

            let destination_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if *destination_account.get_owner() != aeko_token_20_program::id() {
                return Err(InstructionError::InvalidAccountOwner);
            }
            let destination_key = *destination_account.get_key();
            let destination = Aeko20Account::deserialize_padded(destination_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            if destination.owner != wallet_key || destination.mint != mint_key {
                return Err(InstructionError::InvalidAccountData);
            }
            drop(destination_account);

            let mut state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let mut state = PublicMintState::deserialize_padded(state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
            if !state.policy.is_initialized {
                return Err(InstructionError::UninitializedAccount);
            }
            if !state.policy.enabled {
                return Err(Self::map_program_error(PublicMintError::PolicyDisabled.into()));
            }
            if state.policy.mint != mint_key {
                return Err(InstructionError::InvalidAccountData);
            }
            if state.is_blocklisted(&wallet_key) {
                return Err(Self::map_program_error(PublicMintError::WalletBlocked.into()));
            }
            let policy = state.policy.clone();
            if policy.requires_allowlist && !state.is_allowlisted(&wallet_key) {
                let _ = state.note_failed_attempt(wallet_key, policy.mint, current_epoch);
                Self::write_state(&mut state_account, &state)?;
                return Err(Self::map_program_error(PublicMintError::AllowlistRequired.into()));
            }

            let (wallet_blocked, last_mint_epoch, minted_in_window, subsidy_used_in_window) = {
                let window = state.upsert_wallet_window(wallet_key, policy.mint, current_epoch);
                (
                    window.blocked,
                    window.last_mint_epoch,
                    window.minted_in_window,
                    window.subsidy_used_in_window,
                )
            };
            if wallet_blocked {
                return Err(Self::map_program_error(PublicMintError::WalletBlocked.into()));
            }
            if policy.cooldown_epochs > 0
                && last_mint_epoch > 0
                && current_epoch.saturating_sub(last_mint_epoch) < policy.cooldown_epochs
            {
                let _ = state.note_failed_attempt(wallet_key, policy.mint, current_epoch);
                Self::write_state(&mut state_account, &state)?;
                return Err(Self::map_program_error(PublicMintError::CooldownActive.into()));
            }
            if minted_in_window.saturating_add(amount) > policy.per_wallet_limit {
                let _ = state.note_failed_attempt(wallet_key, policy.mint, current_epoch);
                Self::write_state(&mut state_account, &state)?;
                return Err(Self::map_program_error(PublicMintError::MintWindowExceeded.into()));
            }
            if requested_subsidy > 0 {
                if !policy.fee_subsidy_enabled || app_id != policy.subsidy_app {
                    let _ = state.note_failed_attempt(wallet_key, policy.mint, current_epoch);
                    Self::write_state(&mut state_account, &state)?;
                    return Err(Self::map_program_error(
                        PublicMintError::InvalidSubsidyPolicy.into(),
                    ));
                }
                let subsidy_cap = tokenomics.config.social_subsidy_default_monthly_cap;
                if subsidy_used_in_window.saturating_add(requested_subsidy) > subsidy_cap {
                    let _ = state.note_failed_attempt(wallet_key, policy.mint, current_epoch);
                    Self::write_state(&mut state_account, &state)?;
                    return Err(Self::map_program_error(
                        PublicMintError::InvalidSubsidyPolicy.into(),
                    ));
                }
            }

            let window = state.upsert_wallet_window(wallet_key, policy.mint, current_epoch);
            if requested_subsidy > 0 {
                window.subsidy_used_in_window = window
                    .subsidy_used_in_window
                    .saturating_add(requested_subsidy);
            }
            window.minted_in_window = window.minted_in_window.saturating_add(amount);
            window.last_mint_epoch = current_epoch;

            let return_data = to_vec(window).map_err(|_| InstructionError::InvalidAccountData)?;
            let serialized_state =
                to_vec(&state).map_err(|_| InstructionError::InvalidAccountData)?;
            if serialized_state.len() > state_account.get_data().len() {
                return Err(InstructionError::AccountDataTooSmall);
            }

            let mint_instruction = token20_instruction::mint_public_to(
                &aeko_token_20_program::id(),
                &mint_key,
                &destination_key,
                state_account.get_key(),
                &mint_authority_key,
                amount,
            );

            (
                mint_instruction,
                mint_authority_key,
                serialized_state,
                return_data,
            )
        };

        invoke_context.native_invoke(mint_instruction.into(), &[mint_authority_key])?;

        {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            let mut state_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let data = state_account.get_data_mut()?;
            data.fill(0);
            data[..serialized_state.len()].copy_from_slice(&serialized_state);
        }

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), return_data)?;
        Ok(())
    }

    fn write_state(
        account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        state: &PublicMintState,
    ) -> Result<(), InstructionError> {
        let serialized = to_vec(state).map_err(|_| InstructionError::InvalidAccountData)?;
        if serialized.len() > account.get_data().len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = account.get_data_mut()?;
        data.fill(0);
        data[..serialized.len()].copy_from_slice(&serialized);
        Ok(())
    }

    fn map_program_error(error: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match error {
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == PublicMintError::WalletBlocked as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == PublicMintError::CooldownActive as u32 =>
            {
                InstructionError::InvalidArgument
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == PublicMintError::AllowlistRequired as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == PublicMintError::MintWindowExceeded as u32 =>
            {
                InstructionError::InsufficientFunds
            }
            _ => InstructionError::InvalidInstructionData,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use {
        crate::{id, instruction, Entrypoint},
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount, WritableAccount},
            instruction::AccountMeta,
            signature::{Keypair, Signer},
        },
        aeko_token_20_program::state::{Aeko20Mint, MintPolicy},
        borsh::to_vec,
    };

    const ACCOUNT_SPACE: usize = 16_384;

    fn process_instruction(
        instruction_data: &[u8],
        transaction_accounts: Vec<(Pubkey, AccountSharedData)>,
        instruction_accounts: Vec<AccountMeta>,
        expected_result: Result<(), InstructionError>,
        post: impl FnMut(&mut InvokeContext),
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

    fn policy_state(authority: Pubkey, mint: Pubkey, subsidy_app: Option<Pubkey>) -> PublicMintState {
        PublicMintState {
            policy: PublicMintPolicy {
                mint,
                authority,
                enabled: true,
                per_wallet_limit: 1_000,
                window_epochs: 30,
                cooldown_epochs: 1,
                requires_allowlist: false,
                anomaly_threshold: 3,
                fee_subsidy_enabled: subsidy_app.is_some(),
                subsidy_app,
                is_initialized: true,
            },
            wallet_windows: Vec::new(),
            blocklist: Vec::new(),
            allowlist: Vec::new(),
        }
    }

    #[test]
    fn initialize_policy_writes_state() {
        let authority = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let state = policy_state(authority.pubkey(), mint_pubkey, None);
        let ix = instruction::initialize_policy(&id(), &state_pubkey, &authority.pubkey(), state);

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let stored = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(stored.policy.mint, mint_pubkey);
    }

    #[test]
    fn update_policy_rewrites_limits() {
        let authority = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let mut state = policy_state(authority.pubkey(), mint_pubkey, None);
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        state.policy.per_wallet_limit = 5_000;
        state.policy.cooldown_epochs = 3;
        state.policy.requires_allowlist = true;
        let ix = instruction::update_policy(&id(), &state_pubkey, &authority.pubkey(), state.policy.clone());

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, state_account),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let updated = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.policy.per_wallet_limit, 5_000);
        assert_eq!(updated.policy.cooldown_epochs, 3);
        assert!(updated.policy.requires_allowlist);
    }

    #[test]
    fn add_and_remove_blocklist_entry() {
        let authority = Keypair::new();
        let blocked_wallet = Pubkey::new_unique();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let state = policy_state(authority.pubkey(), mint_pubkey, None);
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let add_ix =
            instruction::add_to_blocklist(&id(), &state_pubkey, &authority.pubkey(), blocked_wallet);
        let accounts = process_instruction(
            &add_ix.data,
            vec![
                (state_pubkey, state_account),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let after_add = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert!(after_add.is_blocklisted(&blocked_wallet));

        let remove_ix = instruction::remove_from_blocklist(
            &id(),
            &state_pubkey,
            &authority.pubkey(),
            blocked_wallet,
        );
        let accounts = process_instruction(
            &remove_ix.data,
            vec![
                (state_pubkey, accounts[0].clone()),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let after_remove = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert!(!after_remove.is_blocklisted(&blocked_wallet));
    }

    #[test]
    fn add_and_remove_allowlist_entry() {
        let authority = Keypair::new();
        let allowed_wallet = Pubkey::new_unique();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let mut state = policy_state(authority.pubkey(), mint_pubkey, None);
        state.policy.requires_allowlist = true;
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let add_ix =
            instruction::add_to_allowlist(&id(), &state_pubkey, &authority.pubkey(), allowed_wallet);
        let accounts = process_instruction(
            &add_ix.data,
            vec![
                (state_pubkey, state_account),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let after_add = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert!(after_add.is_allowlisted(&allowed_wallet));

        let remove_ix = instruction::remove_from_allowlist(
            &id(),
            &state_pubkey,
            &authority.pubkey(),
            allowed_wallet,
        );
        let accounts = process_instruction(
            &remove_ix.data,
            vec![
                (state_pubkey, accounts[0].clone()),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let after_remove = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert!(!after_remove.is_allowlisted(&allowed_wallet));
    }

    #[test]
    fn public_mint_updates_wallet_window_and_subsidy_usage() {
        let authority = Keypair::new();
        let wallet = Keypair::new();
        let subsidy_app = Some(Pubkey::new_unique());
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let destination_pubkey = Pubkey::new_unique();
        let tokenomics_pubkey = Pubkey::new_unique();
        let mint_authority = Keypair::new();

        let state = policy_state(authority.pubkey(), mint_pubkey, subsidy_app);
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let tokenomics_state = TokenomicsStateAccount::signed_off_defaults(
            authority.pubkey(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            authority.pubkey(),
            Pubkey::new_unique(),
            250_000,
        );
        let mut tokenomics_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_tokenomics_program::id());
        let tokenomics_bytes = to_vec(&tokenomics_state).unwrap();
        tokenomics_account.data_as_mut_slice()[..tokenomics_bytes.len()]
            .copy_from_slice(&tokenomics_bytes);

        let mint = Aeko20Mint {
            mint_authority: Some(mint_authority.pubkey()),
            freeze_authority: Some(mint_authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: None,
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::PublicMintControlled,
            is_initialized: true,
        };
        let mut mint_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_account.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let destination = Aeko20Account {
            owner: wallet.pubkey(),
            mint: mint_pubkey,
            balance: 0,
            frozen: false,
        };
        let mut destination_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let destination_bytes = to_vec(&destination).unwrap();
        destination_account.data_as_mut_slice()[..destination_bytes.len()]
            .copy_from_slice(&destination_bytes);

        let ix = instruction::public_mint(
            &id(),
            &state_pubkey,
            &mint_pubkey,
            &destination_pubkey,
            &tokenomics_pubkey,
            &wallet.pubkey(),
            &wallet.pubkey(),
            &mint_authority.pubkey(),
            5,
            100,
            subsidy_app,
            10,
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, state_account),
                (mint_pubkey, mint_account),
                (destination_pubkey, destination_account),
                (tokenomics_pubkey, tokenomics_account),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (
                    mint_authority.pubkey(),
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(destination_pubkey, false),
                AccountMeta::new_readonly(tokenomics_pubkey, false),
                AccountMeta::new_readonly(wallet.pubkey(), false),
                AccountMeta::new_readonly(wallet.pubkey(), true),
                AccountMeta::new_readonly(mint_authority.pubkey(), true),
            ],
            Ok(()),
            |invoke_context| {
                let (_, data) = invoke_context.transaction_context.get_return_data();
                let window = crate::state::WalletMintWindow::try_from_slice(data).unwrap();
                assert_eq!(window.minted_in_window, 100);
                assert_eq!(window.subsidy_used_in_window, 10);
            },
        );

        let updated = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.wallet_windows.len(), 1);
        assert_eq!(updated.wallet_windows[0].minted_in_window, 100);
    }

    #[test]
    fn allowlisted_policy_rejects_non_allowlisted_wallets() {
        let authority = Keypair::new();
        let wallet = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let destination_pubkey = Pubkey::new_unique();
        let tokenomics_pubkey = Pubkey::new_unique();
        let mint_authority = Keypair::new();

        let mut state = policy_state(authority.pubkey(), mint_pubkey, None);
        state.policy.requires_allowlist = true;
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let tokenomics_state = TokenomicsStateAccount::signed_off_defaults(
            authority.pubkey(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            authority.pubkey(),
            Pubkey::new_unique(),
            250_000,
        );
        let mut tokenomics_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_tokenomics_program::id());
        let tokenomics_bytes = to_vec(&tokenomics_state).unwrap();
        tokenomics_account.data_as_mut_slice()[..tokenomics_bytes.len()]
            .copy_from_slice(&tokenomics_bytes);

        let mint = Aeko20Mint {
            mint_authority: Some(mint_authority.pubkey()),
            freeze_authority: Some(mint_authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: None,
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::PublicMintControlled,
            is_initialized: true,
        };
        let mut mint_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_account.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let destination = Aeko20Account {
            owner: wallet.pubkey(),
            mint: mint_pubkey,
            balance: 0,
            frozen: false,
        };
        let mut destination_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let destination_bytes = to_vec(&destination).unwrap();
        destination_account.data_as_mut_slice()[..destination_bytes.len()]
            .copy_from_slice(&destination_bytes);

        let ix = instruction::public_mint(
            &id(),
            &state_pubkey,
            &mint_pubkey,
            &destination_pubkey,
            &tokenomics_pubkey,
            &wallet.pubkey(),
            &wallet.pubkey(),
            &mint_authority.pubkey(),
            1,
            100,
            None,
            0,
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, state_account),
                (mint_pubkey, mint_account),
                (destination_pubkey, destination_account),
                (tokenomics_pubkey, tokenomics_account),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (
                    mint_authority.pubkey(),
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(destination_pubkey, false),
                AccountMeta::new_readonly(tokenomics_pubkey, false),
                AccountMeta::new_readonly(wallet.pubkey(), false),
                AccountMeta::new_readonly(wallet.pubkey(), true),
                AccountMeta::new_readonly(mint_authority.pubkey(), true),
            ],
            Err(InstructionError::IncorrectAuthority),
            |_invoke_context| {},
        );

        let updated = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.wallet_windows.len(), 1);
        assert_eq!(updated.wallet_windows[0].anomaly_score, 1);
    }

    #[test]
    fn repeated_failed_attempts_auto_block_wallet() {
        let authority = Keypair::new();
        let wallet = Keypair::new();
        let state_pubkey = Pubkey::new_unique();
        let mint_pubkey = Pubkey::new_unique();
        let destination_pubkey = Pubkey::new_unique();
        let tokenomics_pubkey = Pubkey::new_unique();
        let mint_authority = Keypair::new();

        let mut state = policy_state(authority.pubkey(), mint_pubkey, None);
        state.policy.anomaly_threshold = 2;
        let mut state_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        state_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let tokenomics_state = TokenomicsStateAccount::signed_off_defaults(
            authority.pubkey(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            authority.pubkey(),
            Pubkey::new_unique(),
            250_000,
        );
        let tokenomics_bytes = to_vec(&tokenomics_state).unwrap();
        let mut tokenomics_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_tokenomics_program::id());
        tokenomics_account.data_as_mut_slice()[..tokenomics_bytes.len()]
            .copy_from_slice(&tokenomics_bytes);

        let mint = Aeko20Mint {
            mint_authority: Some(mint_authority.pubkey()),
            freeze_authority: Some(mint_authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: None,
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::PublicMintControlled,
            is_initialized: true,
        };
        let mut mint_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_account.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let destination = Aeko20Account {
            owner: wallet.pubkey(),
            mint: mint_pubkey,
            balance: 0,
            frozen: false,
        };
        let mut destination_account =
            AccountSharedData::new(1, ACCOUNT_SPACE, &aeko_token_20_program::id());
        let destination_bytes = to_vec(&destination).unwrap();
        destination_account.data_as_mut_slice()[..destination_bytes.len()]
            .copy_from_slice(&destination_bytes);

        let ix = instruction::public_mint(
            &id(),
            &state_pubkey,
            &mint_pubkey,
            &destination_pubkey,
            &tokenomics_pubkey,
            &wallet.pubkey(),
            &wallet.pubkey(),
            &mint_authority.pubkey(),
            1,
            2_000,
            None,
            0,
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, state_account),
                (mint_pubkey, mint_account.clone()),
                (destination_pubkey, destination_account.clone()),
                (tokenomics_pubkey, tokenomics_account.clone()),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (
                    mint_authority.pubkey(),
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(destination_pubkey, false),
                AccountMeta::new_readonly(tokenomics_pubkey, false),
                AccountMeta::new_readonly(wallet.pubkey(), false),
                AccountMeta::new_readonly(wallet.pubkey(), true),
                AccountMeta::new_readonly(mint_authority.pubkey(), true),
            ],
            Err(InstructionError::InsufficientFunds),
            |_invoke_context| {},
        );

        let accounts = process_instruction(
            &ix.data,
            vec![
                (state_pubkey, accounts[0].clone()),
                (mint_pubkey, mint_account),
                (destination_pubkey, destination_account),
                (tokenomics_pubkey, tokenomics_account),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (wallet.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (
                    mint_authority.pubkey(),
                    AccountSharedData::new(1, 0, &Pubkey::new_unique()),
                ),
            ],
            vec![
                AccountMeta::new(state_pubkey, false),
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(destination_pubkey, false),
                AccountMeta::new_readonly(tokenomics_pubkey, false),
                AccountMeta::new_readonly(wallet.pubkey(), false),
                AccountMeta::new_readonly(wallet.pubkey(), true),
                AccountMeta::new_readonly(mint_authority.pubkey(), true),
            ],
            Err(InstructionError::InsufficientFunds),
            |_invoke_context| {},
        );

        let updated = PublicMintState::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.wallet_windows[0].anomaly_score, 2);
        assert!(updated.wallet_windows[0].blocked);
    }
}
