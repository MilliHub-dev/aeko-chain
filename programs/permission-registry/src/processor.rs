use {
    crate::{
        error::PermissionRegistryError,
        instruction::PermissionRegistryInstruction,
        state::{
            deserialize_clearance_sbt, deserialize_issuer_record, deserialize_role_assignment,
            deserialize_role_entry, verify_issuer, RegistryConfig,
        },
    },
    aeko_permission_types::{
        AccessDeniedReason, AccessResult, ClearanceSbt, ClearanceTier, IssuerRecord, RoleEntry,
        WalletRoleAssignment,
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

        let instruction_data = instruction_context.get_instruction_data();
        let instruction = PermissionRegistryInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            PermissionRegistryInstruction::InitializeRegistry { current_slot } => {
                Self::process_initialize_registry(invoke_context, current_slot)
            }
            PermissionRegistryInstruction::RegisterIssuer {
                authority,
                tier,
                label,
                current_slot,
            } => Self::process_register_issuer(invoke_context, authority, tier, label, current_slot),
            PermissionRegistryInstruction::DeactivateIssuer { authority, tier } => {
                Self::process_deactivate_issuer(invoke_context, authority, tier)
            }
            PermissionRegistryInstruction::IssueClearance {
                holder,
                tier,
                valid_until_slot,
                revocation_registry,
                current_slot,
            } => Self::process_issue_clearance(
                invoke_context,
                holder,
                tier,
                valid_until_slot,
                revocation_registry,
                current_slot,
            ),
            PermissionRegistryInstruction::RevokeClearance { holder, tier } => {
                Self::process_revoke_clearance(invoke_context, holder, tier)
            }
            PermissionRegistryInstruction::RegisterRole {
                role_id,
                label,
                min_clearance,
                max_clearance,
                subnet_bindings,
                current_slot,
            } => Self::process_register_role(
                invoke_context,
                role_id,
                label,
                min_clearance,
                max_clearance,
                subnet_bindings,
                current_slot,
            ),
            PermissionRegistryInstruction::DeactivateRole { role_id } => {
                Self::process_deactivate_role(invoke_context, role_id)
            }
            PermissionRegistryInstruction::AssignRole {
                wallet,
                role_id,
                current_slot,
            } => Self::process_assign_role(invoke_context, wallet, role_id, current_slot),
            PermissionRegistryInstruction::RevokeRole { wallet, role_id } => {
                Self::process_revoke_role(invoke_context, wallet, role_id)
            }
            PermissionRegistryInstruction::EvaluateAccess {
                wallet,
                required_tier,
                required_role_id,
                subnet_id,
                current_slot,
            } => Self::process_evaluate_access(
                invoke_context,
                wallet,
                required_tier,
                required_role_id,
                subnet_id,
                current_slot,
            ),
            PermissionRegistryInstruction::DecryptHeader { envelope_header } => {
                Self::process_decrypt_header(invoke_context, envelope_header)
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn map_err(e: aeko_sdk::program_error::ProgramError) -> InstructionError {
        match e {
            aeko_sdk::program_error::ProgramError::Custom(code) => InstructionError::Custom(code),
            _ => InstructionError::InvalidArgument,
        }
    }

    fn write_account(
        account_data: &mut [u8],
        serialized: &[u8],
    ) -> Result<(), InstructionError> {
        if serialized.len() > account_data.len() {
            return Err(InstructionError::AccountDataTooSmall);
        }
        account_data.fill(0);
        account_data[..serialized.len()].copy_from_slice(serialized);
        Ok(())
    }

    // ── InitializeRegistry ────────────────────────────────────────────────────

    fn process_initialize_registry(
        invoke_context: &mut InvokeContext,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let upgrade_authority = {
            let acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            if !acc.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *acc.get_key()
        };

        let mut config_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = RegistryConfig::deserialize_padded(config_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::AlreadyInitialized as u32,
                ));
            }
        }

        let config = RegistryConfig::new(upgrade_authority, current_slot);
        let serialized = to_vec(&config).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(config_account.get_data_mut()?, &serialized)
    }

    // ── RegisterIssuer ────────────────────────────────────────────────────────

    fn process_register_issuer(
        invoke_context: &mut InvokeContext,
        authority: Pubkey,
        tier: ClearanceTier,
        label: String,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let config = {
            let acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            RegistryConfig::deserialize_padded(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            config.ensure_upgrade_authority(signer.get_key()).map_err(Self::map_err)?;
        }

        let record = IssuerRecord {
            authority,
            tier,
            label,
            is_active: true,
            registered_at_slot: current_slot,
        };
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;

        let mut issuer_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        Self::write_account(issuer_account.get_data_mut()?, &serialized)
    }

    // ── DeactivateIssuer ──────────────────────────────────────────────────────

    fn process_deactivate_issuer(
        invoke_context: &mut InvokeContext,
        _authority: Pubkey,
        _tier: ClearanceTier,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let config = {
            let acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            RegistryConfig::deserialize_padded(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            config.ensure_upgrade_authority(signer.get_key()).map_err(Self::map_err)?;
        }

        let mut issuer_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_issuer_record(issuer_account.get_data()).map_err(Self::map_err)?;
        record.is_active = false;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(issuer_account.get_data_mut()?, &serialized)
    }

    // ── IssueClearance ────────────────────────────────────────────────────────

    fn process_issue_clearance(
        invoke_context: &mut InvokeContext,
        holder: Pubkey,
        tier: ClearanceTier,
        valid_until_slot: Option<u64>,
        revocation_registry: Pubkey,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let (issuer_record, issuer_pubkey) = {
            let issuer_acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            let record =
                deserialize_issuer_record(issuer_acc.get_data()).map_err(Self::map_err)?;
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            let pubkey = *signer.get_key();
            (record, pubkey)
        };

        verify_issuer(&issuer_record, &issuer_pubkey, tier).map_err(Self::map_err)?;

        let mut sbt_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        // Do not re-issue an already active SBT.
        if let Ok(existing) = deserialize_clearance_sbt(sbt_account.get_data()) {
            if existing.is_active {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::SbtAlreadyExists as u32,
                ));
            }
        }

        let sbt = ClearanceSbt {
            holder,
            tier,
            issuer: issuer_pubkey,
            issued_at_slot: current_slot,
            valid_until_slot,
            revocation_registry,
            is_active: true,
        };
        let serialized = to_vec(&sbt).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(sbt_account.get_data_mut()?, &serialized)
    }

    // ── RevokeClearance ───────────────────────────────────────────────────────

    fn process_revoke_clearance(
        invoke_context: &mut InvokeContext,
        _holder: Pubkey,
        _tier: ClearanceTier,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let signer_pubkey = {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut sbt_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut sbt = deserialize_clearance_sbt(sbt_account.get_data()).map_err(Self::map_err)?;

        if sbt.issuer != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        sbt.is_active = false;
        let serialized = to_vec(&sbt).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(sbt_account.get_data_mut()?, &serialized)
    }

    // ── RegisterRole ──────────────────────────────────────────────────────────

    fn process_register_role(
        invoke_context: &mut InvokeContext,
        role_id: [u8; 32],
        label: String,
        min_clearance: ClearanceTier,
        max_clearance: ClearanceTier,
        subnet_bindings: Vec<[u8; 32]>,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let authority = {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut role_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_role_entry(role_account.get_data()) {
            if existing.is_active {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::RoleAlreadyExists as u32,
                ));
            }
        }

        let entry = RoleEntry {
            role_id,
            authority,
            label,
            min_clearance,
            max_clearance,
            subnet_bindings,
            created_at_slot: current_slot,
            is_active: true,
        };
        let serialized = to_vec(&entry).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(role_account.get_data_mut()?, &serialized)
    }

    // ── DeactivateRole ────────────────────────────────────────────────────────

    fn process_deactivate_role(
        invoke_context: &mut InvokeContext,
        _role_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let signer_pubkey = {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut role_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut entry = deserialize_role_entry(role_account.get_data()).map_err(Self::map_err)?;

        if entry.authority != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        entry.is_active = false;
        let serialized = to_vec(&entry).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(role_account.get_data_mut()?, &serialized)
    }

    // ── AssignRole ────────────────────────────────────────────────────────────

    fn process_assign_role(
        invoke_context: &mut InvokeContext,
        wallet: Pubkey,
        role_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        // Account 1: role_entry PDA — verify role is active
        let role_min_clearance = {
            let role_acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            let role = deserialize_role_entry(role_acc.get_data()).map_err(Self::map_err)?;
            if !role.is_active {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::RoleInactive as u32,
                ));
            }
            if role.role_id != role_id {
                return Err(InstructionError::InvalidArgument);
            }
            role.min_clearance
        };

        // Account 2: caller's clearance_sbt — verify clearance >= role.min_clearance
        {
            let sbt_acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 2)?;
            let caller_sbt =
                deserialize_clearance_sbt(sbt_acc.get_data()).map_err(Self::map_err)?;
            if !caller_sbt.is_active {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::ClearanceMissing as u32,
                ));
            }
            if !caller_sbt.tier.satisfies(role_min_clearance) {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::ClearanceOutOfRoleRange as u32,
                ));
            }
        }

        // Account 3: assigning authority (signer)
        let assigned_by = {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 3)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        // Account 0: role_assignment PDA (writable)
        let mut assign_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_role_assignment(assign_account.get_data()) {
            if existing.is_active {
                return Err(InstructionError::Custom(
                    PermissionRegistryError::AssignmentAlreadyExists as u32,
                ));
            }
        }

        let assignment = WalletRoleAssignment {
            wallet,
            role_id,
            assigned_at_slot: current_slot,
            assigned_by,
            is_active: true,
        };
        let serialized =
            to_vec(&assignment).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(assign_account.get_data_mut()?, &serialized)
    }

    // ── RevokeRole ────────────────────────────────────────────────────────────

    fn process_revoke_role(
        invoke_context: &mut InvokeContext,
        _wallet: Pubkey,
        _role_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let role_authority = {
            let role_acc = instruction_context
                .try_borrow_instruction_account(transaction_context, 1)?;
            let role = deserialize_role_entry(role_acc.get_data()).map_err(Self::map_err)?;
            role.authority
        };

        let signer_pubkey = {
            let signer = instruction_context
                .try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        if role_authority != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }

        let mut assign_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut assignment =
            deserialize_role_assignment(assign_account.get_data()).map_err(Self::map_err)?;
        assignment.is_active = false;
        let serialized =
            to_vec(&assignment).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(assign_account.get_data_mut()?, &serialized)
    }

    // ── EvaluateAccess ────────────────────────────────────────────────────────

    /// Implements the 4-step policy chain from security-architecture.md §3.
    ///
    /// Accounts:
    ///   0. clearance_sbt PDA — may have empty data for L0 callers
    ///   1. role_assignment PDA — empty data → RoleMissing
    ///   2. role_entry PDA
    ///   3. subnet_record PDA — owner must be subnet-registry program
    fn process_evaluate_access(
        invoke_context: &mut InvokeContext,
        _wallet: Pubkey,
        required_tier: ClearanceTier,
        required_role_id: [u8; 32],
        _subnet_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let result = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(4)?;

            if required_tier == ClearanceTier::Public {
                // L0: no checks required.
                AccessResult::Granted
            } else {
                // ── Step 1: Clearance ─────────────────────────────────────────
                let clearance_result = {
                    let sbt_acc = instruction_context
                        .try_borrow_instruction_account(transaction_context, 0)?;
                    let data = sbt_acc.get_data();
                    if data.iter().all(|&b| b == 0) || data.is_empty() {
                        AccessResult::Denied(AccessDeniedReason::ClearanceMissing)
                    } else {
                        match deserialize_clearance_sbt(data) {
                            Err(_) => AccessResult::Denied(AccessDeniedReason::ClearanceMissing),
                            Ok(sbt) => {
                                if !sbt.is_active {
                                    AccessResult::Denied(AccessDeniedReason::ClearanceRevoked)
                                } else if !sbt.is_valid_at(current_slot) {
                                    AccessResult::Denied(AccessDeniedReason::ClearanceExpired)
                                } else if !sbt.tier.satisfies(required_tier) {
                                    AccessResult::Denied(AccessDeniedReason::ClearanceMissing)
                                } else {
                                    AccessResult::Granted
                                }
                            }
                        }
                    }
                };

                if clearance_result != AccessResult::Granted {
                    clearance_result
                } else {
                    // ── Step 2: Role ──────────────────────────────────────────
                    let role_result = {
                        let assign_acc = instruction_context
                            .try_borrow_instruction_account(transaction_context, 1)?;
                        let data = assign_acc.get_data();
                        if data.iter().all(|&b| b == 0) || data.is_empty() {
                            AccessResult::Denied(AccessDeniedReason::RoleMissing)
                        } else {
                            match deserialize_role_assignment(data) {
                                Err(_) => AccessResult::Denied(AccessDeniedReason::RoleMissing),
                                Ok(a) => {
                                    if !a.is_active || a.role_id != required_role_id {
                                        AccessResult::Denied(AccessDeniedReason::RoleMissing)
                                    } else {
                                        AccessResult::Granted
                                    }
                                }
                            }
                        }
                    };

                    if role_result != AccessResult::Granted {
                        role_result
                    } else {
                        // Verify role entry is active.
                        let role_check = {
                            let role_acc = instruction_context
                                .try_borrow_instruction_account(transaction_context, 2)?;
                            match deserialize_role_entry(role_acc.get_data()) {
                                Err(_) => AccessResult::Denied(AccessDeniedReason::RoleMissing),
                                Ok(r) => {
                                    if !r.is_active {
                                        AccessResult::Denied(AccessDeniedReason::RoleInactive)
                                    } else {
                                        AccessResult::Granted
                                    }
                                }
                            }
                        };

                        if role_check != AccessResult::Granted {
                            role_check
                        } else {
                            // ── Step 3: Subnet ────────────────────────────────
                            // Read is_frozen from byte 1 of SubnetRecord.
                            // SubnetRecord layout (borsh): is_initialized(bool=1 byte),
                            // is_frozen(bool=1 byte), ...
                            let subnet_acc = instruction_context
                                .try_borrow_instruction_account(transaction_context, 3)?;
                            let data = subnet_acc.get_data();
                            if data.len() >= 2 && data[1] != 0 {
                                AccessResult::Denied(AccessDeniedReason::SubnetFrozen)
                            } else {
                                AccessResult::Granted
                            }
                        }
                    }
                }
            }
        };

        // Emit result via return data so CPI callers can inspect it.
        let result_bytes = to_vec(&result).map_err(|_| InstructionError::InvalidAccountData)?;
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), result_bytes)?;

        match result {
            AccessResult::Granted => Ok(()),
            AccessResult::Denied(reason) => Err(InstructionError::Custom(reason as u32)),
        }
    }

    // ── DecryptHeader ─────────────────────────────────────────────────────────

    /// Validates an `EncryptedPayloadEnvelope` header (security-architecture.md §4.4).
    ///
    /// Account 0: key_record PDA in revocation-registry (readonly).
    /// Returns the `key_id` via return data for the Encryption Module to use.
    fn process_decrypt_header(
        invoke_context: &mut InvokeContext,
        envelope_header: Vec<u8>,
    ) -> Result<(), InstructionError> {
        use aeko_permission_types::EncryptedPayloadEnvelope;

        let envelope = EncryptedPayloadEnvelope::try_from_slice(&envelope_header)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        if !envelope.is_valid_version() {
            return Err(InstructionError::Custom(
                PermissionRegistryError::InvalidEnvelopeVersion as u32,
            ));
        }

        let key_id = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(1)?;

            let key_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let key_data = key_acc.get_data();

            // KeyRecord layout: key_id([u8;32]), then KeyState(u8 discriminant).
            // KeyState::Active = 0 — any other value means the key is unusable.
            // If the account has no data the key was never registered; allow it
            // (forward-compatibility for session keys).
            if key_data.len() >= 33 {
                let state_byte = key_data[32];
                if state_byte != 0 {
                    return Err(InstructionError::Custom(
                        PermissionRegistryError::KeyRevoked as u32,
                    ));
                }
            }
            envelope.key_id
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), key_id.to_vec())?;
        Ok(())
    }
}
