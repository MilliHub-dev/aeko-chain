use {
    crate::{
        instruction::WalletPermissionsInstruction,
        state::{
            AuditEventSummary, AuditEventType, PermissionStatus, WalletPermissionAccount,
            WalletPermissionAuditLogAccount,
        },
    },
    aeko_program_runtime::{ic_msg, invoke_context::InvokeContext},
    aeko_sdk::{instruction::InstructionError, program::set_return_data, pubkey::Pubkey},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let instruction_data = instruction_context.get_instruction_data();
        let instruction = WalletPermissionsInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            WalletPermissionsInstruction::InitializePermissionAccount {
                wallet,
                did,
                current_epoch,
                default_program_policy,
            } => Self::process_initialize_permission_account(
                invoke_context,
                wallet,
                did,
                current_epoch,
                default_program_policy,
            ),
            WalletPermissionsInstruction::GrantDelegate {
                delegate_permission,
                current_epoch,
                current_slot,
            } => Self::process_grant_delegate(
                invoke_context,
                delegate_permission,
                current_epoch,
                current_slot,
            ),
            WalletPermissionsInstruction::UpdateDelegate {
                delegate,
                role,
                label,
                valid_until_epoch,
                spend_limit,
                program_allowlist,
                token_allowlist,
                app_scope_hashes,
                requires_reauth,
                current_epoch,
                current_slot,
            } => Self::process_update_delegate(
                invoke_context,
                delegate,
                role,
                label,
                valid_until_epoch,
                spend_limit,
                program_allowlist,
                token_allowlist,
                app_scope_hashes,
                requires_reauth,
                current_epoch,
                current_slot,
            ),
            WalletPermissionsInstruction::RevokeDelegate {
                delegate,
                current_epoch,
                current_slot,
            } => Self::process_revoke_delegate(invoke_context, delegate, current_epoch, current_slot),
            WalletPermissionsInstruction::FreezeWallet {
                reason_code,
                reauth_required_until_epoch,
                current_epoch,
                current_slot,
            } => Self::process_freeze_wallet(
                invoke_context,
                reason_code,
                reauth_required_until_epoch,
                current_epoch,
                current_slot,
            ),
            WalletPermissionsInstruction::UnfreezeWallet {
                current_epoch,
                current_slot,
            } => Self::process_unfreeze_wallet(invoke_context, current_epoch, current_slot),
            WalletPermissionsInstruction::RecordDelegateUsage {
                delegate,
                target_program,
                mint,
                amount,
                day_index,
                current_epoch,
                current_slot,
            } => Self::process_record_delegate_usage(
                invoke_context,
                delegate,
                target_program,
                mint,
                amount,
                day_index,
                current_epoch,
                current_slot,
            ),
            WalletPermissionsInstruction::ReadEffectivePermissions {
                delegate,
                current_epoch,
            } => Self::process_read_effective_permissions(invoke_context, delegate, current_epoch),
        }
    }

    fn process_initialize_permission_account(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
        did: String,
        current_epoch: u64,
        default_program_policy: crate::state::ProgramPolicyMode,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        if *permission_account.get_owner() != crate::id() {
            ic_msg!(invoke_context, "Permission state account has invalid owner");
            return Err(InstructionError::InvalidAccountOwner);
        }

        let state = WalletPermissionAccount::new(
            wallet,
            did,
            owner_key,
            default_program_policy,
            current_epoch,
        );
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        if *audit_log_account.get_owner() != crate::id() {
            ic_msg!(invoke_context, "Audit log account has invalid owner");
            return Err(InstructionError::InvalidAccountOwner);
        }
        let mut audit_log = WalletPermissionAuditLogAccount::new(wallet);
        audit_log
            .append(
                owner_key,
                None,
                AuditEventType::PermissionUpdated,
                AuditEventSummary {
                    role: None,
                    status: None,
                    affected_programs: Vec::new(),
                    affected_mints: Vec::new(),
                    valid_until_epoch: None,
                    amount_hint: None,
                },
                current_epoch,
                0,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    fn process_grant_delegate(
        invoke_context: &mut InvokeContext,
        delegate_permission: crate::state::DelegatePermission,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&owner_key).map_err(Self::map_program_error)?;
        let delegate_pubkey = delegate_permission.delegate;
        let role = delegate_permission.role;
        let valid_until_epoch = delegate_permission.valid_until_epoch;
        let affected_programs = delegate_permission.program_allowlist.clone();
        let affected_mints = delegate_permission.token_allowlist.clone();
        state
            .grant_delegate(delegate_permission, current_epoch)
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                owner_key,
                Some(delegate_pubkey),
                AuditEventType::PermissionGranted,
                AuditEventSummary {
                    role: Some(role),
                    status: Some(PermissionStatus::Active),
                    affected_programs,
                    affected_mints,
                    valid_until_epoch,
                    amount_hint: state
                        .delegates
                        .iter()
                        .find(|delegate| delegate.delegate == delegate_pubkey)
                        .and_then(|delegate| delegate.spend_limit.max_single_tx_aeko),
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    fn process_revoke_delegate(
        invoke_context: &mut InvokeContext,
        delegate: Pubkey,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&owner_key).map_err(Self::map_program_error)?;
        let revoked = state
            .revoke_delegate(delegate, current_epoch)
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                owner_key,
                Some(delegate),
                AuditEventType::PermissionRevoked,
                AuditEventSummary {
                    role: Some(revoked.role),
                    status: Some(PermissionStatus::Revoked),
                    affected_programs: revoked.program_allowlist,
                    affected_mints: revoked.token_allowlist,
                    valid_until_epoch: revoked.valid_until_epoch,
                    amount_hint: revoked.spend_limit.max_single_tx_aeko,
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    #[allow(clippy::too_many_arguments)]
    fn process_update_delegate(
        invoke_context: &mut InvokeContext,
        delegate: Pubkey,
        role: Option<crate::state::PermissionRole>,
        label: Option<Option<String>>,
        valid_until_epoch: Option<Option<u64>>,
        spend_limit: Option<crate::state::SpendLimitPolicy>,
        program_allowlist: Option<Vec<Pubkey>>,
        token_allowlist: Option<Vec<Pubkey>>,
        app_scope_hashes: Option<Vec<[u8; 32]>>,
        requires_reauth: Option<bool>,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&owner_key).map_err(Self::map_program_error)?;
        let updated = state
            .update_delegate(
                delegate,
                role,
                label,
                valid_until_epoch,
                spend_limit,
                program_allowlist,
                token_allowlist,
                app_scope_hashes,
                requires_reauth,
                current_epoch,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                owner_key,
                Some(delegate),
                AuditEventType::PermissionUpdated,
                AuditEventSummary {
                    role: Some(updated.role),
                    status: Some(updated.status),
                    affected_programs: updated.program_allowlist,
                    affected_mints: updated.token_allowlist,
                    valid_until_epoch: updated.valid_until_epoch,
                    amount_hint: updated.spend_limit.max_single_tx_aeko,
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    fn process_freeze_wallet(
        invoke_context: &mut InvokeContext,
        reason_code: Option<u16>,
        reauth_required_until_epoch: Option<u64>,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&owner_key).map_err(Self::map_program_error)?;
        state.freeze(reason_code, reauth_required_until_epoch, current_epoch);
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                owner_key,
                None,
                AuditEventType::WalletFrozen,
                AuditEventSummary {
                    role: None,
                    status: Some(PermissionStatus::Frozen),
                    affected_programs: Vec::new(),
                    affected_mints: Vec::new(),
                    valid_until_epoch: reauth_required_until_epoch,
                    amount_hint: reason_code.map(u64::from),
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    fn process_unfreeze_wallet(
        invoke_context: &mut InvokeContext,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&owner_key).map_err(Self::map_program_error)?;
        state.unfreeze(current_epoch);
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                owner_key,
                None,
                AuditEventType::WalletUnfrozen,
                AuditEventSummary {
                    role: None,
                    status: Some(PermissionStatus::Active),
                    affected_programs: Vec::new(),
                    affected_mints: Vec::new(),
                    valid_until_epoch: None,
                    amount_hint: None,
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    #[allow(clippy::too_many_arguments)]
    fn process_record_delegate_usage(
        invoke_context: &mut InvokeContext,
        delegate: Pubkey,
        target_program: Option<Pubkey>,
        mint: Option<Pubkey>,
        amount: u64,
        day_index: u64,
        current_epoch: u64,
        current_slot: u64,
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

        let mut permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;
        state.ensure_owner(&authority_key).map_err(Self::map_program_error)?;
        let updated = state
            .record_usage(
                delegate,
                target_program,
                mint,
                amount,
                day_index,
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut permission_account, &state)?;
        drop(permission_account);

        let mut audit_log_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let mut audit_log =
            WalletPermissionAuditLogAccount::deserialize_padded(audit_log_account.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?;
        audit_log
            .append(
                authority_key,
                Some(delegate),
                AuditEventType::DelegateUsageRecorded,
                AuditEventSummary {
                    role: Some(updated.role),
                    status: Some(updated.status),
                    affected_programs: target_program.into_iter().collect(),
                    affected_mints: mint.into_iter().collect(),
                    valid_until_epoch: updated.valid_until_epoch,
                    amount_hint: Some(amount),
                },
                current_epoch,
                current_slot,
            )
            .map_err(Self::map_program_error)?;
        Self::write_borsh_account(&mut audit_log_account, &audit_log)
    }

    fn process_read_effective_permissions(
        invoke_context: &mut InvokeContext,
        delegate: Pubkey,
        current_epoch: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(1)?;

        let permission_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let state = WalletPermissionAccount::deserialize_padded(permission_account.get_data())
            .map_err(|_| InstructionError::InvalidAccountData)?;
        state.ensure_initialized().map_err(Self::map_program_error)?;

        let effective_permissions = state.effective_permissions(delegate, current_epoch);
        let response = to_vec(&effective_permissions)
            .map_err(|_| InstructionError::InvalidInstructionData)?;
        set_return_data(&response);
        Ok(())
    }

    fn write_borsh_account<T: borsh::BorshSerialize>(
        account: &mut aeko_sdk::transaction_context::BorrowedAccount<'_>,
        value: &T,
    ) -> Result<(), InstructionError> {
        let bytes = to_vec(value).map_err(|_| InstructionError::InvalidInstructionData)?;
        if account.get_data().len() < bytes.len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        let data = account.get_data_mut()?;
        data.fill(0);
        data[..bytes.len()].copy_from_slice(&bytes);
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
        super::*,
        crate::{
            id, instruction,
            state::{
                DelegatePermission, EffectivePermissionView, PermissionRole, PermissionStatus,
                ProgramPolicyMode, SpendLimitPolicy, TokenSpendCap, WalletPermissionAccount,
                WalletPermissionAuditLogAccount,
            },
        },
        aeko_program_runtime::invoke_context::mock_process_instruction,
        aeko_sdk::{
            account::{AccountSharedData, ReadableAccount},
            instruction::AccountMeta,
            signature::{Keypair, Signer},
        },
        borsh::to_vec,
    };

    const ACCOUNT_SPACE: usize = 16_384;

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

    fn sample_delegate(delegate: Pubkey) -> DelegatePermission {
        DelegatePermission {
            delegate,
            role: PermissionRole::Spender,
            label: Some("session".to_string()),
            status: PermissionStatus::Active,
            valid_from_epoch: 1,
            valid_until_epoch: Some(10),
            spend_limit: SpendLimitPolicy {
                max_single_tx_aeko: Some(100),
                max_daily_aeko: Some(500),
                token_caps: Vec::new(),
            },
            program_allowlist: Vec::new(),
            token_allowlist: Vec::new(),
            app_scope_hashes: Vec::new(),
            requires_reauth: false,
            last_used_epoch: None,
            last_used_slot: None,
        }
    }

    fn sample_token_delegate(delegate: Pubkey, mint: Pubkey) -> DelegatePermission {
        let mut permission = sample_delegate(delegate);
        permission.token_allowlist = vec![mint];
        permission.spend_limit.token_caps = vec![TokenSpendCap {
            mint,
            max_single_tx: Some(75),
            max_daily: Some(100),
        }];
        permission
    }

    fn initialized_accounts(
        owner: &Keypair,
        wallet: Pubkey,
        current_epoch: u64,
    ) -> (Pubkey, AccountSharedData, Pubkey, AccountSharedData) {
        let permission_pubkey = Pubkey::new_unique();
        let audit_pubkey = Pubkey::new_unique();
        let state = WalletPermissionAccount::new(
            wallet,
            format!("did:aeko:{wallet}"),
            owner.pubkey(),
            ProgramPolicyMode::DenyByDefault,
            current_epoch,
        );
        let mut permission_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let audit_log = WalletPermissionAuditLogAccount::new(wallet);
        let mut audit_account = AccountSharedData::new(1, ACCOUNT_SPACE, &id());
        let audit_bytes = to_vec(&audit_log).unwrap();
        audit_account.data_as_mut_slice()[..audit_bytes.len()].copy_from_slice(&audit_bytes);

        (permission_pubkey, permission_account, audit_pubkey, audit_account)
    }

    #[test]
    fn update_delegate_mutates_state_and_audit_log() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state.grant_delegate(sample_delegate(delegate), 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::update_delegate(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            Some(PermissionRole::Viewer),
            Some(Some("viewer".to_string())),
            Some(Some(20)),
            None,
            Some(vec![Pubkey::new_unique()]),
            None,
            None,
            Some(true),
            2,
            22,
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let updated = WalletPermissionAccount::deserialize_padded(accounts[0].data()).unwrap();
        let audit = WalletPermissionAuditLogAccount::deserialize_padded(accounts[1].data()).unwrap();
        let delegate_state = updated
            .delegates
            .iter()
            .find(|entry| entry.delegate == delegate)
            .unwrap();

        assert_eq!(delegate_state.role, PermissionRole::Viewer);
        assert_eq!(delegate_state.label.as_deref(), Some("viewer"));
        assert_eq!(delegate_state.valid_until_epoch, Some(20));
        assert!(delegate_state.requires_reauth);
        assert_eq!(audit.entries.len(), 1);
        assert_eq!(audit.entries[0].event_type, crate::state::AuditEventType::PermissionUpdated);
    }

    #[test]
    fn record_delegate_usage_rejects_amount_over_cap() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state.grant_delegate(sample_delegate(delegate), 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            None,
            None,
            101,
            1,
            2,
            30,
        );

        process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Err(InstructionError::Custom(
                crate::error::WalletPermissionsError::SpendLimitExceeded as u32,
            )),
            |_invoke_context| {},
        );
    }

    #[test]
    fn record_delegate_usage_rejects_program_when_deny_by_default() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let target_program = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state.grant_delegate(sample_delegate(delegate), 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            Some(target_program),
            None,
            50,
            1,
            2,
            31,
        );

        process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Err(InstructionError::Custom(
                crate::error::WalletPermissionsError::ProgramNotAllowed as u32,
            )),
            |_invoke_context| {},
        );
    }

    #[test]
    fn read_effective_permissions_returns_expired_view() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, _audit_pubkey, _audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state.grant_delegate(sample_delegate(delegate), 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::read_effective_permissions(&id(), &permission_pubkey, delegate, 11);

        process_instruction(
            &instruction.data,
            vec![(permission_pubkey, permission_account)],
            vec![AccountMeta::new_readonly(permission_pubkey, false)],
            Ok(()),
            |invoke_context| {
                let (program_id, data) = invoke_context.transaction_context.get_return_data();
                assert_eq!(*program_id, id());
                let view = EffectivePermissionView::try_from_slice(data).unwrap();
                assert_eq!(view.delegate, delegate);
                assert_eq!(view.status, Some(PermissionStatus::Expired));
                assert!(!view.active);
            },
        );
    }

    #[test]
    fn record_delegate_usage_appends_audit_entry_and_updates_window() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let target_program = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut delegate_permission = sample_delegate(delegate);
        delegate_permission.program_allowlist = vec![target_program];
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state.grant_delegate(delegate_permission, 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            Some(target_program),
            None,
            50,
            1,
            2,
            32,
        );

        let accounts = process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let updated = WalletPermissionAccount::deserialize_padded(accounts[0].data()).unwrap();
        let audit = WalletPermissionAuditLogAccount::deserialize_padded(accounts[1].data()).unwrap();
        assert_eq!(updated.usage_windows.len(), 1);
        assert_eq!(updated.usage_windows[0].aeko_spent_today, 50);
        assert_eq!(audit.entries.len(), 1);
        assert_eq!(
            audit.entries[0].event_type,
            crate::state::AuditEventType::DelegateUsageRecorded
        );
        assert_eq!(audit.entries[0].event_summary.amount_hint, Some(50));
    }

    #[test]
    fn record_delegate_usage_rejects_token_not_on_allowlist() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let allowed_mint = Pubkey::new_unique();
        let disallowed_mint = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state
            .grant_delegate(sample_token_delegate(delegate, allowed_mint), 1)
            .unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            None,
            Some(disallowed_mint),
            20,
            1,
            2,
            33,
        );

        process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Err(InstructionError::Custom(
                crate::error::WalletPermissionsError::TokenNotAllowed as u32,
            )),
            |_invoke_context| {},
        );
    }

    #[test]
    fn record_delegate_usage_rejects_token_daily_cap_exceeded() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        state
            .grant_delegate(sample_token_delegate(delegate, mint), 1)
            .unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let first = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            None,
            Some(mint),
            60,
            1,
            2,
            34,
        );

        let accounts = process_instruction(
            &first.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Ok(()),
            |_invoke_context| {},
        );

        let second = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            None,
            Some(mint),
            50,
            1,
            2,
            35,
        );

        process_instruction(
            &second.data,
            vec![
                (permission_pubkey, accounts[0].clone()),
                (audit_pubkey, accounts[1].clone()),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Err(InstructionError::Custom(
                crate::error::WalletPermissionsError::SpendLimitExceeded as u32,
            )),
            |_invoke_context| {},
        );
    }

    #[test]
    fn record_delegate_usage_rejects_delegate_before_valid_from_epoch() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, audit_pubkey, audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        let mut permission = sample_delegate(delegate);
        permission.valid_from_epoch = 5;
        permission.valid_until_epoch = Some(10);
        state.grant_delegate(permission, 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::record_delegate_usage(
            &id(),
            &permission_pubkey,
            &audit_pubkey,
            &owner.pubkey(),
            delegate,
            None,
            None,
            20,
            1,
            2,
            36,
        );

        process_instruction(
            &instruction.data,
            vec![
                (permission_pubkey, permission_account),
                (audit_pubkey, audit_account),
                (owner.pubkey(), AccountSharedData::new(1, 0, &Pubkey::new_unique())),
            ],
            vec![
                AccountMeta::new(permission_pubkey, false),
                AccountMeta::new(audit_pubkey, false),
                AccountMeta::new_readonly(owner.pubkey(), true),
            ],
            Err(InstructionError::Custom(
                crate::error::WalletPermissionsError::DelegateInactive as u32,
            )),
            |_invoke_context| {},
        );
    }

    #[test]
    fn read_effective_permissions_returns_inactive_view_before_valid_from_epoch() {
        let owner = Keypair::new();
        let wallet = owner.pubkey();
        let delegate = Pubkey::new_unique();
        let (permission_pubkey, mut permission_account, _audit_pubkey, _audit_account) =
            initialized_accounts(&owner, wallet, 0);
        let mut state = WalletPermissionAccount::deserialize_padded(permission_account.data()).unwrap();
        let mut permission = sample_delegate(delegate);
        permission.valid_from_epoch = 5;
        permission.valid_until_epoch = Some(10);
        state.grant_delegate(permission, 1).unwrap();
        let state_bytes = to_vec(&state).unwrap();
        permission_account.data_as_mut_slice()[..state_bytes.len()].copy_from_slice(&state_bytes);

        let instruction = instruction::read_effective_permissions(&id(), &permission_pubkey, delegate, 2);

        process_instruction(
            &instruction.data,
            vec![(permission_pubkey, permission_account)],
            vec![AccountMeta::new_readonly(permission_pubkey, false)],
            Ok(()),
            |invoke_context| {
                let (program_id, data) = invoke_context.transaction_context.get_return_data();
                assert_eq!(*program_id, id());
                let view = EffectivePermissionView::try_from_slice(data).unwrap();
                assert_eq!(view.delegate, delegate);
                assert_eq!(view.status, Some(PermissionStatus::Active));
                assert!(!view.active);
            },
        );
    }
}
