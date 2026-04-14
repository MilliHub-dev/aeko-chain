use {
    crate::{
        error::RevocationRegistryError,
        instruction::RevocationRegistryInstruction,
        state::{
            deserialize_key_record, deserialize_rotation_approval, deserialize_rotation_intent,
            KeyRecord, RevRegistryConfig, RotationApproval, RotationIntent,
        },
    },
    aeko_permission_types::{KeyAlgorithm, KeyState, KeyType},
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
        let instruction = RevocationRegistryInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            RevocationRegistryInstruction::InitializeRegistry { current_slot } => {
                Self::process_initialize_registry(invoke_context, current_slot)
            }
            RevocationRegistryInstruction::RegisterKey {
                key_id,
                key_type,
                key_algorithm,
                public_key_bytes,
                expires_at_slot,
                current_slot,
            } => Self::process_register_key(
                invoke_context,
                key_id,
                key_type,
                key_algorithm,
                public_key_bytes,
                expires_at_slot,
                current_slot,
            ),
            RevocationRegistryInstruction::InitiateRotation {
                key_id,
                successor_key_id,
                required_approvals,
                ttl_slots,
                current_slot,
            } => Self::process_initiate_rotation(
                invoke_context,
                key_id,
                successor_key_id,
                required_approvals,
                ttl_slots,
                current_slot,
            ),
            RevocationRegistryInstruction::ApproveRotation { key_id, current_slot } => {
                Self::process_approve_rotation(invoke_context, key_id, current_slot)
            }
            RevocationRegistryInstruction::ExecuteRotation { key_id, current_slot } => {
                Self::process_execute_rotation(invoke_context, key_id, current_slot)
            }
            RevocationRegistryInstruction::RevokeKey { key_id } => {
                Self::process_revoke_key(invoke_context, key_id)
            }
            RevocationRegistryInstruction::MarkCompromised { key_id, reason_code } => {
                Self::process_mark_compromised(invoke_context, key_id, reason_code)
            }
            RevocationRegistryInstruction::IsRevoked { key_id } => {
                Self::process_is_revoked(invoke_context, key_id)
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
            let acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if !acc.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *acc.get_key()
        };

        let mut config_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = RevRegistryConfig::deserialize_padded(config_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    RevocationRegistryError::AlreadyInitialized as u32,
                ));
            }
        }

        let config = RevRegistryConfig::new(upgrade_authority, current_slot);
        let serialized = to_vec(&config).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(config_account.get_data_mut()?, &serialized)
    }

    // ── RegisterKey ───────────────────────────────────────────────────────────

    fn process_register_key(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
        key_type: KeyType,
        key_algorithm: KeyAlgorithm,
        public_key_bytes: Vec<u8>,
        expires_at_slot: Option<u64>,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let owner = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut key_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        // Prevent double-registration of an active key.
        if let Ok(existing) = deserialize_key_record(key_account.get_data()) {
            if !existing.is_revoked() {
                return Err(InstructionError::Custom(
                    RevocationRegistryError::KeyAlreadyExists as u32,
                ));
            }
        }

        let record = KeyRecord {
            key_id,
            owner,
            key_type,
            key_algorithm,
            public_key_bytes,
            state: KeyState::Active,
            created_at_slot: current_slot,
            expires_at_slot,
            successor_key_id: None,
        };
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(key_account.get_data_mut()?, &serialized)
    }

    // ── InitiateRotation ──────────────────────────────────────────────────────

    fn process_initiate_rotation(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
        successor_key_id: [u8; 32],
        required_approvals: u8,
        ttl_slots: u64,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        // Verify signer is key owner.
        let signer_pubkey = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        // Transition key record to PendingRotation.
        let mut key_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_key_record(key_account.get_data()).map_err(Self::map_err)?;

        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        if record.key_id != key_id {
            return Err(InstructionError::InvalidArgument);
        }
        record.initiate_rotation().map_err(Self::map_err)?;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(key_account.get_data_mut()?, &serialized)?;
        drop(key_account);

        // Write rotation intent.
        let intent = RotationIntent {
            key_id,
            successor_key_id,
            initiator: signer_pubkey,
            created_at_slot: current_slot,
            expires_at_slot: current_slot.saturating_add(ttl_slots),
            required_approvals,
            approval_count: 0,
            is_executed: false,
        };
        let serialized = to_vec(&intent).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut intent_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        Self::write_account(intent_account.get_data_mut()?, &serialized)
    }

    // ── ApproveRotation ───────────────────────────────────────────────────────

    fn process_approve_rotation(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let approver = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        // Check intent is not expired and not already executed.
        let mut intent_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut intent =
            deserialize_rotation_intent(intent_account.get_data()).map_err(Self::map_err)?;

        if intent.key_id != key_id {
            return Err(InstructionError::InvalidArgument);
        }
        if intent.is_executed {
            return Err(InstructionError::Custom(
                RevocationRegistryError::RotationAlreadyApproved as u32,
            ));
        }
        if intent.is_expired(current_slot) {
            return Err(InstructionError::Custom(
                RevocationRegistryError::RotationExpired as u32,
            ));
        }

        intent.approval_count = intent.approval_count.saturating_add(1);
        let serialized = to_vec(&intent).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(intent_account.get_data_mut()?, &serialized)?;
        drop(intent_account);

        // Record the individual approval.
        let approval = RotationApproval {
            key_id,
            approver,
            approved_at_slot: current_slot,
        };
        let serialized = to_vec(&approval).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut approval_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        Self::write_account(approval_account.get_data_mut()?, &serialized)
    }

    // ── ExecuteRotation ───────────────────────────────────────────────────────

    fn process_execute_rotation(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        // Signer check.
        {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
        }

        // Read intent and verify quorum + not expired + not already executed.
        let successor_key_id = {
            let intent_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            let intent =
                deserialize_rotation_intent(intent_acc.get_data()).map_err(Self::map_err)?;
            if intent.key_id != key_id {
                return Err(InstructionError::InvalidArgument);
            }
            if intent.is_executed {
                return Err(InstructionError::Custom(
                    RevocationRegistryError::RotationAlreadyApproved as u32,
                ));
            }
            if intent.is_expired(current_slot) {
                return Err(InstructionError::Custom(
                    RevocationRegistryError::RotationExpired as u32,
                ));
            }
            if !intent.quorum_met() {
                return Err(InstructionError::Custom(
                    RevocationRegistryError::QuorumNotMet as u32,
                ));
            }
            intent.successor_key_id
        };

        // Transition old key → Rotated.
        let mut old_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut old_record =
            deserialize_key_record(old_account.get_data()).map_err(Self::map_err)?;
        if old_record.key_id != key_id {
            return Err(InstructionError::InvalidArgument);
        }
        old_record.complete_rotation(successor_key_id).map_err(Self::map_err)?;
        let serialized = to_vec(&old_record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(old_account.get_data_mut()?, &serialized)?;
        drop(old_account);

        // Mark the rotation intent as executed.
        let mut intent_acc =
            instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
        let mut intent =
            deserialize_rotation_intent(intent_acc.get_data()).map_err(Self::map_err)?;
        intent.is_executed = true;
        let serialized = to_vec(&intent).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(intent_acc.get_data_mut()?, &serialized)?;
        drop(intent_acc);

        // Ensure successor key exists and is Active (or was registered as Active).
        let mut succ_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let succ_record =
            deserialize_key_record(succ_account.get_data()).map_err(Self::map_err)?;
        if succ_record.key_id != successor_key_id {
            return Err(InstructionError::InvalidArgument);
        }
        // Successor remains Active — no state change needed.
        drop(succ_account);

        Ok(())
    }

    // ── RevokeKey ─────────────────────────────────────────────────────────────

    fn process_revoke_key(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let signer_pubkey = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut key_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_key_record(key_account.get_data()).map_err(Self::map_err)?;

        if record.key_id != key_id {
            return Err(InstructionError::InvalidArgument);
        }
        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        record.revoke().map_err(Self::map_err)?;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(key_account.get_data_mut()?, &serialized)
    }

    // ── MarkCompromised ───────────────────────────────────────────────────────

    fn process_mark_compromised(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
        _reason_code: u16,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        // Verify upgrade authority.
        let config = {
            let config_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            RevRegistryConfig::deserialize_padded(config_acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            config.ensure_upgrade_authority(signer.get_key()).map_err(Self::map_err)?;
        }

        let mut key_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_key_record(key_account.get_data()).map_err(Self::map_err)?;

        if record.key_id != key_id {
            return Err(InstructionError::InvalidArgument);
        }
        record.mark_compromised().map_err(Self::map_err)?;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(key_account.get_data_mut()?, &serialized)
    }

    // ── IsRevoked ─────────────────────────────────────────────────────────────

    fn process_is_revoked(
        invoke_context: &mut InvokeContext,
        key_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(1)?;

        let is_revoked = {
            let key_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let data = key_acc.get_data();
            if data.iter().all(|b| *b == 0) || data.is_empty() {
                // Key not registered — treat as not revoked.
                false
            } else {
                match deserialize_key_record(data) {
                    Ok(record) => {
                        if record.key_id != key_id {
                            return Err(InstructionError::InvalidArgument);
                        }
                        record.is_revoked()
                    }
                    Err(_) => return Err(InstructionError::InvalidAccountData),
                }
            }
        };

        invoke_context
            .transaction_context
            .set_return_data(crate::id(), vec![is_revoked as u8])?;
        Ok(())
    }
}
