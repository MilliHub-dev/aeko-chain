use {
    crate::{
        error::Token20Error,
        instruction::Token20Instruction,
        state::{Aeko20Account, Aeko20Mint, MintPolicy},
    },
    aeko_tokenomics_program::state::TokenomicsStateAccount,
    aeko_program_runtime::{ic_msg, invoke_context::InvokeContext},
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = Token20Instruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            Token20Instruction::InitializeMint {
                name,
                symbol,
                decimals,
                supply_cap,
                metadata_uri,
                mint_policy,
            } => Self::process_initialize_mint(
                invoke_context,
                name,
                symbol,
                decimals,
                supply_cap,
                metadata_uri,
                mint_policy,
            ),
            Token20Instruction::InitializeAccount => Self::process_initialize_account(invoke_context),
            Token20Instruction::MintTo { amount } => Self::process_mint_to(invoke_context, amount),
            Token20Instruction::MintPublicTo { amount } => {
                Self::process_mint_public_to(invoke_context, amount)
            }
            Token20Instruction::MintEmissionsTo { amount } => {
                Self::process_mint_emissions_to(invoke_context, amount)
            }
            Token20Instruction::Transfer { amount } => {
                Self::process_transfer(invoke_context, amount)
            }
            Token20Instruction::Burn { amount } => Self::process_burn(invoke_context, amount),
            Token20Instruction::Approve {
                amount,
                expires_at_epoch,
            } => Self::process_approve(invoke_context, amount, expires_at_epoch),
            Token20Instruction::Revoke => Self::process_revoke(invoke_context),
            Token20Instruction::TransferFrom { amount } => {
                Self::process_transfer_from(invoke_context, amount)
            }
            Token20Instruction::FreezeAccount => Self::process_freeze_account(invoke_context),
            Token20Instruction::ThawAccount => Self::process_thaw_account(invoke_context),
            Token20Instruction::SetMintAuthority { new_authority } => {
                Self::process_set_mint_authority(invoke_context, new_authority)
            }
        }
    }

    fn process_initialize_mint(
        invoke_context: &mut InvokeContext,
        name: String,
        symbol: String,
        decimals: u8,
        supply_cap: Option<u128>,
        metadata_uri: Option<String>,
        mint_policy: MintPolicy,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *mint_account.get_owner() != crate::id() {
            ic_msg!(invoke_context, "Mint account has invalid owner");
            return Err(InstructionError::InvalidAccountOwner);
        }
        if !mint_account.is_writable() {
            return Err(InstructionError::InvalidArgument);
        }
        if !name.is_empty()
            && mint_account.get_data().iter().any(|byte| *byte != 0)
            && Aeko20Mint::deserialize_padded(mint_account.get_data())
                .map(|mint| mint.is_initialized)
                .unwrap_or(false)
        {
            return Err(InstructionError::AccountAlreadyInitialized);
        }

        let mint = Aeko20Mint {
            mint_authority: Some(authority_key),
            freeze_authority: Some(authority_key),
            name,
            symbol,
            decimals,
            total_supply: 0,
            supply_cap,
            metadata_uri,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy,
            is_initialized: true,
        };
        Self::write_borsh_account(&mut mint_account, &mint)
    }

    fn process_initialize_account(
        invoke_context: &mut InvokeContext,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        let mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let mint_key = *mint_account.get_key();
        let mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !mint.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        drop(mint_account);

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *token_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if !token_account.is_writable() {
            return Err(InstructionError::InvalidArgument);
        }
        if token_account.get_data().iter().any(|byte| *byte != 0)
            && Aeko20Account::deserialize_padded(token_account.get_data())
                .map(|account| account.balance > 0 || account.frozen || account.owner != aeko_sdk::pubkey::Pubkey::default())
                .unwrap_or(false)
        {
            return Err(InstructionError::AccountAlreadyInitialized);
        }

        let account = Aeko20Account {
            owner: owner_key,
            mint: mint_key,
            balance: 0,
            frozen: false,
        };
        Self::write_borsh_account(&mut token_account, &account)
    }

    fn process_mint_to(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !mint.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if mint.mint_policy != MintPolicy::AuthorityGated {
            return Err(InstructionError::InvalidArgument);
        }
        if mint.mint_authority != Some(authority_key) {
            return Err(InstructionError::IncorrectAuthority);
        }
        if let Some(cap) = mint.supply_cap {
            if mint.total_supply.saturating_add(amount) > cap {
                return Err(InstructionError::InvalidArgument);
            }
        }

        let mut destination_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut destination = Aeko20Account::deserialize_padded(destination_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if destination.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if destination.mint != *mint_account.get_key() {
            return Err(InstructionError::InvalidAccountData);
        }

        mint.total_supply = mint.total_supply.saturating_add(amount);
        destination.balance = destination.balance.saturating_add(amount);

        Self::write_borsh_account(&mut mint_account, &mint)?;
        Self::write_borsh_account(&mut destination_account, &destination)
    }

    fn process_mint_public_to(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let public_mint_state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if *public_mint_state_account.get_owner() == crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if public_mint_state_account.get_data().iter().all(|byte| *byte == 0) {
            return Err(InstructionError::InvalidAccountData);
        }
        drop(public_mint_state_account);

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !mint.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if mint.mint_policy != MintPolicy::PublicMintControlled {
            return Err(InstructionError::InvalidArgument);
        }
        if mint.mint_authority != Some(authority_key) {
            return Err(InstructionError::IncorrectAuthority);
        }
        if let Some(cap) = mint.supply_cap {
            if mint.total_supply.saturating_add(amount) > cap {
                return Err(InstructionError::InvalidArgument);
            }
        }

        let mut destination_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut destination = Aeko20Account::deserialize_padded(destination_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if destination.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if destination.mint != *mint_account.get_key() {
            return Err(InstructionError::InvalidAccountData);
        }

        mint.total_supply = mint.total_supply.saturating_add(amount);
        destination.balance = destination.balance.saturating_add(amount);

        Self::write_borsh_account(&mut mint_account, &mint)?;
        Self::write_borsh_account(&mut destination_account, &destination)
    }

    fn process_transfer(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        let mut source_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut source = Aeko20Account::deserialize_padded(source_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if source.owner != owner_key {
            return Err(Self::map_program_error(Token20Error::InvalidTokenOwner.into()));
        }
        if source.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if source.balance < amount {
            return Err(Self::map_program_error(Token20Error::InsufficientBalance.into()));
        }

        let mut destination_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut destination = Aeko20Account::deserialize_padded(destination_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if destination.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if source.mint != destination.mint {
            return Err(InstructionError::InvalidAccountData);
        }

        source.balance = source.balance.saturating_sub(amount);
        destination.balance = destination.balance.saturating_add(amount);

        Self::write_borsh_account(&mut source_account, &source)?;
        Self::write_borsh_account(&mut destination_account, &destination)
    }

    fn process_mint_emissions_to(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let tokenomics_state_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        if *tokenomics_state_account.get_owner() != aeko_tokenomics_program::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        let tokenomics_state =
            TokenomicsStateAccount::deserialize_padded(tokenomics_state_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        drop(tokenomics_state_account);

        let governance_authority =
            instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
        let governance_key = *governance_authority.get_key();
        if !governance_authority.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        if governance_key != tokenomics_state.config.governance_program_id
            && governance_key != tokenomics_state.config.authority
        {
            return Err(InstructionError::IncorrectAuthority);
        }
        drop(governance_authority);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if !mint.is_initialized {
            return Err(InstructionError::UninitializedAccount);
        }
        if mint.mint_policy != MintPolicy::EmissionsControlled {
            return Err(InstructionError::InvalidInstructionData);
        }

        let mut destination_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut destination = Aeko20Account::deserialize_padded(destination_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if destination.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if destination.mint != *mint_account.get_key() {
            return Err(InstructionError::InvalidAccountData);
        }

        if let Some(cap) = mint.supply_cap {
            if mint.total_supply.saturating_add(amount) > cap {
                return Err(InstructionError::InvalidArgument);
            }
        }

        mint.total_supply = mint.total_supply.saturating_add(amount);
        destination.balance = destination.balance.saturating_add(amount);

        Self::write_borsh_account(&mut mint_account, &mint)?;
        Self::write_borsh_account(&mut destination_account, &destination)
    }

    fn process_burn(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;

        let mut source_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut source = Aeko20Account::deserialize_padded(source_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if source.owner != owner_key {
            return Err(Self::map_program_error(Token20Error::InvalidTokenOwner.into()));
        }
        if source.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if source.mint != *mint_account.get_key() {
            return Err(InstructionError::InvalidAccountData);
        }
        if source.balance < amount || mint.total_supply < amount {
            return Err(Self::map_program_error(Token20Error::InsufficientBalance.into()));
        }

        source.balance = source.balance.saturating_sub(amount);
        mint.total_supply = mint.total_supply.saturating_sub(amount);

        Self::write_borsh_account(&mut source_account, &source)?;
        Self::write_borsh_account(&mut mint_account, &mint)
    }

    fn process_approve(
        invoke_context: &mut InvokeContext,
        amount: u128,
        expires_at_epoch: Option<u64>,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let source_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let source = Aeko20Account::deserialize_padded(source_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        drop(source_account);

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        if source.owner != owner_key {
            return Err(Self::map_program_error(Token20Error::InvalidTokenOwner.into()));
        }

        let spender_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
        let spender_key = *spender_account.get_key();
        drop(spender_account);

        let mut allowance_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *allowance_account.get_owner() != crate::id() {
            return Err(InstructionError::InvalidAccountOwner);
        }
        if !allowance_account.is_writable() {
            return Err(InstructionError::InvalidArgument);
        }

        let allowance = crate::state::AllowanceRecord {
            owner: owner_key,
            spender: spender_key,
            mint: source.mint,
            amount,
            expires_at_epoch,
        };
        Self::write_borsh_account(&mut allowance_account, &allowance)
    }

    fn process_revoke(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let owner_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let owner_key = *owner_account.get_key();
        if !owner_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(owner_account);

        let mut allowance_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let allowance = crate::state::AllowanceRecord::deserialize_padded(allowance_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if allowance.owner != owner_key {
            return Err(Self::map_program_error(Token20Error::InvalidTokenOwner.into()));
        }

        let data = allowance_account.get_data_mut()?;
        data.fill(0);
        Ok(())
    }

    fn process_transfer_from(
        invoke_context: &mut InvokeContext,
        amount: u128,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let spender_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
        let spender_key = *spender_account.get_key();
        if !spender_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(spender_account);

        let mut allowance_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut allowance =
            crate::state::AllowanceRecord::deserialize_padded(allowance_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        if allowance.spender != spender_key {
            return Err(Self::map_program_error(Token20Error::InvalidTokenOwner.into()));
        }
        if allowance.amount < amount {
            return Err(Self::map_program_error(Token20Error::AllowanceExceeded.into()));
        }

        let mut source_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut source = Aeko20Account::deserialize_padded(source_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if source.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if source.balance < amount {
            return Err(Self::map_program_error(Token20Error::InsufficientBalance.into()));
        }
        if source.mint != allowance.mint || source.owner != allowance.owner {
            return Err(InstructionError::InvalidAccountData);
        }

        let mut destination_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let mut destination = Aeko20Account::deserialize_padded(destination_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if destination.frozen {
            return Err(Self::map_program_error(Token20Error::AccountFrozen.into()));
        }
        if destination.mint != source.mint {
            return Err(InstructionError::InvalidAccountData);
        }

        source.balance = source.balance.saturating_sub(amount);
        destination.balance = destination.balance.saturating_add(amount);
        allowance.amount = allowance.amount.saturating_sub(amount);

        Self::write_borsh_account(&mut source_account, &source)?;
        Self::write_borsh_account(&mut destination_account, &destination)?;
        Self::write_borsh_account(&mut allowance_account, &allowance)
    }

    fn process_freeze_account(
        invoke_context: &mut InvokeContext,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        let mint_key = *mint_account.get_key();
        drop(mint_account);

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        if mint.freeze_authority != Some(authority_key) {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut token = Aeko20Account::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if token.mint != mint_key {
            return Err(InstructionError::InvalidAccountData);
        }

        token.frozen = true;
        Self::write_borsh_account(&mut token_account, &token)
    }

    fn process_thaw_account(
        invoke_context: &mut InvokeContext,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        let mint_key = *mint_account.get_key();
        drop(mint_account);

        let authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let authority_key = *authority_account.get_key();
        if !authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(authority_account);

        if mint.freeze_authority != Some(authority_key) {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut token_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut token = Aeko20Account::deserialize_padded(token_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if token.mint != mint_key {
            return Err(InstructionError::InvalidAccountData);
        }

        token.frozen = false;
        Self::write_borsh_account(&mut token_account, &token)
    }

    fn process_set_mint_authority(
        invoke_context: &mut InvokeContext,
        new_authority: Option<Pubkey>,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let current_authority_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let current_authority_key = *current_authority_account.get_key();
        if !current_authority_account.is_signer() {
            return Err(InstructionError::MissingRequiredSignature);
        }
        drop(current_authority_account);

        let mut mint_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut mint = Aeko20Mint::deserialize_padded(mint_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        if mint.mint_authority != Some(current_authority_key) {
            return Err(InstructionError::IncorrectAuthority);
        }

        mint.mint_authority = new_authority;
        Self::write_borsh_account(&mut mint_account, &mint)
    }

    fn write_borsh_account<T: borsh::BorshSerialize>(
        account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        value: &T,
    ) -> Result<(), InstructionError> {
        let serialized = to_vec(value).map_err(|_| InstructionError::InvalidAccountData)?;
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
            aeko_sdk::program_error::ProgramError::AccountDataTooSmall => {
                InstructionError::AccountDataTooSmall
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token20Error::InvalidTokenOwner as u32 =>
            {
                InstructionError::IncorrectAuthority
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token20Error::InsufficientBalance as u32 =>
            {
                InstructionError::InsufficientFunds
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token20Error::AllowanceExceeded as u32 =>
            {
                InstructionError::InsufficientFunds
            }
            aeko_sdk::program_error::ProgramError::Custom(code)
                if code == Token20Error::AccountFrozen as u32 =>
            {
                InstructionError::Immutable
            }
            _ => InstructionError::InvalidInstructionData,
        }
    }
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        crate::{
            id,
            instruction,
            state::{Aeko20Account, Aeko20Mint, MintPolicy},
        },
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount},
            instruction::AccountMeta,
            pubkey::Pubkey,
            signature::{Keypair, Signer},
        },
        borsh::to_vec,
    };

    const ACCOUNT_SPACE: usize = 4096;

    fn process_instruction(
        instruction_data: &[u8],
        transaction_accounts: Vec<(Pubkey, AccountSharedData)>,
        instruction_accounts: Vec<AccountMeta>,
        expected_result: Result<(), InstructionError>,
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
            |_invoke_context| {},
        )
    }

    #[test]
    fn initialize_mint_writes_mint_state() {
        let authority = Keypair::new();
        let mint_pubkey = Pubkey::new_unique();
        let instruction = instruction::initialize_mint(
            &id(),
            &mint_pubkey,
            &authority.pubkey(),
            "AEKO".to_string(),
            "AEKO".to_string(),
            9,
            Some(500_000_000_000),
            None,
            MintPolicy::AuthorityGated,
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (mint_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(mint_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );

        let mint = Aeko20Mint::deserialize_padded(accounts[0].data()).unwrap();
        assert!(mint.is_initialized);
        assert_eq!(mint.symbol, "AEKO");
        assert_eq!(mint.total_supply, 0);
    }

    #[test]
    fn initialize_account_mint_transfer_and_burn_flow() {
        let authority = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();
        let mint_pubkey = Pubkey::new_unique();
        let alice_account_pubkey = Pubkey::new_unique();
        let bob_account_pubkey = Pubkey::new_unique();

        let mint = Aeko20Mint {
            mint_authority: Some(authority.pubkey()),
            freeze_authority: Some(authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: Some(500_000_000_000),
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::AuthorityGated,
            is_initialized: true,
        };
        let mut mint_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_account.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let initialize_alice = instruction::initialize_account(
            &id(),
            &alice_account_pubkey,
            &alice.pubkey(),
            &mint_pubkey,
        );
        let accounts = process_instruction(
            &initialize_alice.data,
            vec![
                (alice_account_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (alice.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (mint_pubkey, mint_account.clone()),
            ],
            vec![
                AccountMeta::new(alice_account_pubkey, false),
                AccountMeta::new_readonly(alice.pubkey(), true),
                AccountMeta::new_readonly(mint_pubkey, false),
            ],
            Ok(()),
        );
        let alice_account = accounts[0].clone();

        let initialize_bob = instruction::initialize_account(
            &id(),
            &bob_account_pubkey,
            &bob.pubkey(),
            &mint_pubkey,
        );
        let accounts = process_instruction(
            &initialize_bob.data,
            vec![
                (bob_account_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (bob.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (mint_pubkey, mint_account.clone()),
            ],
            vec![
                AccountMeta::new(bob_account_pubkey, false),
                AccountMeta::new_readonly(bob.pubkey(), true),
                AccountMeta::new_readonly(mint_pubkey, false),
            ],
            Ok(()),
        );
        let bob_account = accounts[0].clone();

        let mint_to = instruction::mint_to(
            &id(),
            &mint_pubkey,
            &alice_account_pubkey,
            &authority.pubkey(),
            1_000,
        );
        let accounts = process_instruction(
            &mint_to.data,
            vec![
                (mint_pubkey, mint_account),
                (alice_account_pubkey, alice_account),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(mint_pubkey, false),
                AccountMeta::new(alice_account_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );
        let mint_account = accounts[0].clone();
        let alice_account = accounts[1].clone();

        let transfer = instruction::transfer(
            &id(),
            &alice_account_pubkey,
            &bob_account_pubkey,
            &alice.pubkey(),
            400,
        );
        let accounts = process_instruction(
            &transfer.data,
            vec![
                (alice_account_pubkey, alice_account),
                (bob_account_pubkey, bob_account),
                (alice.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(alice_account_pubkey, false),
                AccountMeta::new(bob_account_pubkey, false),
                AccountMeta::new_readonly(alice.pubkey(), true),
            ],
            Ok(()),
        );
        let alice_account = accounts[0].clone();
        let bob_account = accounts[1].clone();

        let burn = instruction::burn(
            &id(),
            &mint_pubkey,
            &alice_account_pubkey,
            &alice.pubkey(),
            100,
        );
        let accounts = process_instruction(
            &burn.data,
            vec![
                (mint_pubkey, mint_account),
                (alice_account_pubkey, alice_account),
                (alice.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(mint_pubkey, false),
                AccountMeta::new(alice_account_pubkey, false),
                AccountMeta::new_readonly(alice.pubkey(), true),
            ],
            Ok(()),
        );

        let final_mint = Aeko20Mint::deserialize_padded(accounts[0].data()).unwrap();
        let final_alice = Aeko20Account::deserialize_padded(accounts[1].data()).unwrap();
        let final_bob = Aeko20Account::deserialize_padded(bob_account.data()).unwrap();

        assert_eq!(final_mint.total_supply, 900);
        assert_eq!(final_alice.balance, 500);
        assert_eq!(final_bob.balance, 400);
    }

    #[test]
    fn approve_transfer_from_and_revoke_flow() {
        let owner = Keypair::new();
        let spender = Keypair::new();
        let mint_pubkey = Pubkey::new_unique();
        let owner_account_pubkey = Pubkey::new_unique();
        let destination_account_pubkey = Pubkey::new_unique();
        let allowance_pubkey = Pubkey::new_unique();

        let owner_account = Aeko20Account {
            owner: owner.pubkey(),
            mint: mint_pubkey,
            balance: 1_000,
            frozen: false,
        };
        let destination_account = Aeko20Account {
            owner: Pubkey::new_unique(),
            mint: mint_pubkey,
            balance: 0,
            frozen: false,
        };

        let mut owner_state = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let owner_bytes = to_vec(&owner_account).unwrap();
        owner_state.data_as_mut_slice()[..owner_bytes.len()].copy_from_slice(&owner_bytes);

        let mut destination_state = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let destination_bytes = to_vec(&destination_account).unwrap();
        destination_state.data_as_mut_slice()[..destination_bytes.len()]
            .copy_from_slice(&destination_bytes);

        let approve = instruction::approve(
            &id(),
            &allowance_pubkey,
            &owner_account_pubkey,
            &owner.pubkey(),
            &spender.pubkey(),
            300,
            Some(10),
        );
        let accounts = process_instruction(
            &approve.data,
            vec![
                (allowance_pubkey, AccountSharedData::new(1, ACCOUNT_SPACE, &id())),
                (owner_account_pubkey, owner_state),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
                (spender.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(allowance_pubkey, false),
                AccountMeta::new_readonly(owner_account_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
                AccountMeta::new_readonly(spender.pubkey(), false),
            ],
            Ok(()),
        );
        let allowance_state = accounts[0].clone();

        let transfer_from = instruction::transfer_from(
            &id(),
            &allowance_pubkey,
            &owner_account_pubkey,
            &destination_account_pubkey,
            &spender.pubkey(),
            200,
        );
        let accounts = process_instruction(
            &transfer_from.data,
            vec![
                (allowance_pubkey, allowance_state),
                (owner_account_pubkey, accounts[1].clone()),
                (destination_account_pubkey, destination_state),
                (spender.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(allowance_pubkey, false),
                AccountMeta::new(owner_account_pubkey, false),
                AccountMeta::new(destination_account_pubkey, false),
                AccountMeta::new_readonly(spender.pubkey(), true),
            ],
            Ok(()),
        );

        let updated_allowance =
            crate::state::AllowanceRecord::deserialize_padded(accounts[0].data()).unwrap();
        let updated_owner = Aeko20Account::deserialize_padded(accounts[1].data()).unwrap();
        let updated_destination = Aeko20Account::deserialize_padded(accounts[2].data()).unwrap();

        assert_eq!(updated_allowance.amount, 100);
        assert_eq!(updated_owner.balance, 800);
        assert_eq!(updated_destination.balance, 200);

        let revoke = instruction::revoke(&id(), &allowance_pubkey, &owner.pubkey());
        let accounts = process_instruction(
            &revoke.data,
            vec![
                (allowance_pubkey, accounts[0].clone()),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(allowance_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Ok(()),
        );

        assert!(accounts[0].data().iter().all(|byte| *byte == 0));
    }

    #[test]
    fn freeze_and_thaw_account_updates_frozen_state() {
        let authority = Keypair::new();
        let mint_pubkey = Pubkey::new_unique();
        let token_account_pubkey = Pubkey::new_unique();

        let mint = Aeko20Mint {
            mint_authority: Some(authority.pubkey()),
            freeze_authority: Some(authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: None,
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::AuthorityGated,
            is_initialized: true,
        };
        let token = Aeko20Account {
            owner: Pubkey::new_unique(),
            mint: mint_pubkey,
            balance: 10,
            frozen: false,
        };

        let mut mint_state = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_state.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let mut token_state = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let token_bytes = to_vec(&token).unwrap();
        token_state.data_as_mut_slice()[..token_bytes.len()].copy_from_slice(&token_bytes);

        let freeze = instruction::freeze_account(
            &id(),
            &mint_pubkey,
            &token_account_pubkey,
            &authority.pubkey(),
        );
        let accounts = process_instruction(
            &freeze.data,
            vec![
                (mint_pubkey, mint_state.clone()),
                (token_account_pubkey, token_state),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(token_account_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );

        let frozen = Aeko20Account::deserialize_padded(accounts[1].data()).unwrap();
        assert!(frozen.frozen);

        let thaw = instruction::thaw_account(
            &id(),
            &mint_pubkey,
            &token_account_pubkey,
            &authority.pubkey(),
        );
        let accounts = process_instruction(
            &thaw.data,
            vec![
                (mint_pubkey, mint_state),
                (token_account_pubkey, accounts[1].clone()),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new_readonly(mint_pubkey, false),
                AccountMeta::new(token_account_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );

        let thawed = Aeko20Account::deserialize_padded(accounts[1].data()).unwrap();
        assert!(!thawed.frozen);
    }

    #[test]
    fn set_mint_authority_rotates_authority() {
        let authority = Keypair::new();
        let new_authority = Keypair::new();
        let mint_pubkey = Pubkey::new_unique();

        let mint = Aeko20Mint {
            mint_authority: Some(authority.pubkey()),
            freeze_authority: Some(authority.pubkey()),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: None,
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::AuthorityGated,
            is_initialized: true,
        };
        let mut mint_state = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_state.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let set_authority = instruction::set_mint_authority(
            &id(),
            &mint_pubkey,
            &authority.pubkey(),
            Some(new_authority.pubkey()),
        );
        let accounts = process_instruction(
            &set_authority.data,
            vec![
                (mint_pubkey, mint_state),
                (authority.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(mint_pubkey, false),
                AccountMeta::new_readonly(authority.pubkey(), true),
            ],
            Ok(()),
        );

        let updated = Aeko20Mint::deserialize_padded(accounts[0].data()).unwrap();
        assert_eq!(updated.mint_authority, Some(new_authority.pubkey()));
    }

    #[test]
    fn emissions_controlled_mint_uses_tokenomics_authority() {
        let governance = Keypair::new();
        let governance_pubkey = governance.pubkey();
        let mint_pubkey = Pubkey::new_unique();
        let destination_pubkey = Pubkey::new_unique();
        let tokenomics_state_pubkey = Pubkey::new_unique();

        let mint = Aeko20Mint {
            mint_authority: Some(governance_pubkey),
            freeze_authority: Some(governance_pubkey),
            name: "AEKO".to_string(),
            symbol: "AEKO".to_string(),
            decimals: 9,
            total_supply: 0,
            supply_cap: Some(500_000_000_000),
            metadata_uri: None,
            transfer_hook_program_id: None,
            required_clearance: None,
            mint_policy: MintPolicy::EmissionsControlled,
            is_initialized: true,
        };
        let mut mint_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let mint_bytes = to_vec(&mint).unwrap();
        mint_account.data_as_mut_slice()[..mint_bytes.len()].copy_from_slice(&mint_bytes);

        let destination = Aeko20Account {
            owner: Pubkey::new_unique(),
            mint: mint_pubkey,
            balance: 0,
            frozen: false,
        };
        let mut destination_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let destination_bytes = to_vec(&destination).unwrap();
        destination_account.data_as_mut_slice()[..destination_bytes.len()]
            .copy_from_slice(&destination_bytes);

        let tokenomics_state = aeko_tokenomics_program::state::TokenomicsStateAccount::signed_off_defaults(
            governance_pubkey,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            governance_pubkey,
            Pubkey::new_unique(),
            250_000,
        );
        let mut tokenomics_account = AccountSharedData::new(
            1,
            ACCOUNT_SPACE,
            &aeko_tokenomics_program::id(),
        );
        let tokenomics_bytes = to_vec(&tokenomics_state).unwrap();
        tokenomics_account.data_as_mut_slice()[..tokenomics_bytes.len()]
            .copy_from_slice(&tokenomics_bytes);

        let instruction = instruction::mint_emissions_to(
            &id(),
            &mint_pubkey,
            &destination_pubkey,
            &tokenomics_state_pubkey,
            &governance_pubkey,
            1_500,
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (mint_pubkey, mint_account),
                (destination_pubkey, destination_account),
                (tokenomics_state_pubkey, tokenomics_account),
                (governance_pubkey, AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(mint_pubkey, false),
                AccountMeta::new(destination_pubkey, false),
                AccountMeta::new_readonly(tokenomics_state_pubkey, false),
                AccountMeta::new_readonly(governance_pubkey, true),
            ],
            Ok(()),
        );

        let updated_mint = Aeko20Mint::deserialize_padded(accounts[0].data()).unwrap();
        let updated_destination = Aeko20Account::deserialize_padded(accounts[1].data()).unwrap();

        assert_eq!(updated_mint.total_supply, 1_500);
        assert_eq!(updated_destination.balance, 1_500);
    }
}
