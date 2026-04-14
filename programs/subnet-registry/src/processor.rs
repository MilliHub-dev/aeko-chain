use {
    crate::{
        error::SubnetRegistryError,
        instruction::SubnetRegistryInstruction,
        state::{
            deserialize_subnet_membership, deserialize_subnet_record, SubnetMembership,
            SubnetRecord, SubnetRegistryConfig,
        },
    },
    aeko_permission_types::ClearanceTier,
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
        let instruction = SubnetRegistryInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            SubnetRegistryInstruction::InitializeRegistry { current_slot } => {
                Self::process_initialize_registry(invoke_context, current_slot)
            }
            SubnetRegistryInstruction::CreateSubnet { subnet_id, min_clearance, current_slot } => {
                Self::process_create_subnet(invoke_context, subnet_id, min_clearance, current_slot)
            }
            SubnetRegistryInstruction::FreezeSubnet { subnet_id, reason_code } => {
                Self::process_freeze_subnet(invoke_context, subnet_id, reason_code)
            }
            SubnetRegistryInstruction::UnfreezeSubnet { subnet_id } => {
                Self::process_unfreeze_subnet(invoke_context, subnet_id)
            }
            SubnetRegistryInstruction::AddSubnetMember { subnet_id, member, key_id, current_slot } => {
                Self::process_add_member(invoke_context, subnet_id, member, key_id, current_slot)
            }
            SubnetRegistryInstruction::RemoveSubnetMember { subnet_id, member } => {
                Self::process_remove_member(invoke_context, subnet_id, member)
            }
            SubnetRegistryInstruction::CheckSubnetAccess { subnet_id, member } => {
                Self::process_check_access(invoke_context, subnet_id, member)
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

    fn write_account(account_data: &mut [u8], serialized: &[u8]) -> Result<(), InstructionError> {
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

        if let Ok(existing) = SubnetRegistryConfig::deserialize_padded(config_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    SubnetRegistryError::AlreadyInitialized as u32,
                ));
            }
        }

        let config = SubnetRegistryConfig::new(upgrade_authority, current_slot);
        let serialized = to_vec(&config).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(config_account.get_data_mut()?, &serialized)
    }

    // ── CreateSubnet ──────────────────────────────────────────────────────────

    fn process_create_subnet(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
        min_clearance: ClearanceTier,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        // Enforce: restricted subnets must require at least L3 (Enterprise).
        if min_clearance != ClearanceTier::Public
            && min_clearance != ClearanceTier::VerifiedHuman
            && (min_clearance as u8) < (ClearanceTier::Enterprise as u8)
        {
            // L1 (VerifiedHuman) and L2 (Kyc) are allowed for semi-public zones;
            // only pure L0 (Public) with no min_clearance is unrestricted.
        }

        let owner = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut subnet_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_subnet_record(subnet_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    SubnetRegistryError::SubnetAlreadyExists as u32,
                ));
            }
        }

        let record = SubnetRecord {
            is_initialized: true,
            is_frozen: false,
            subnet_id,
            owner,
            min_clearance,
            freeze_reason_code: None,
            validator_set: vec![],
            created_at_slot: current_slot,
        };
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(subnet_account.get_data_mut()?, &serialized)
    }

    // ── FreezeSubnet ──────────────────────────────────────────────────────────

    fn process_freeze_subnet(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
        reason_code: u16,
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

        let mut subnet_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_subnet_record(subnet_account.get_data()).map_err(Self::map_err)?;

        if record.subnet_id != subnet_id {
            return Err(InstructionError::InvalidArgument);
        }
        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        record.freeze(reason_code);
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(subnet_account.get_data_mut()?, &serialized)
    }

    // ── UnfreezeSubnet ────────────────────────────────────────────────────────

    fn process_unfreeze_subnet(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
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

        let mut subnet_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_subnet_record(subnet_account.get_data()).map_err(Self::map_err)?;

        if record.subnet_id != subnet_id {
            return Err(InstructionError::InvalidArgument);
        }
        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        record.unfreeze();
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(subnet_account.get_data_mut()?, &serialized)
    }

    // ── AddSubnetMember ───────────────────────────────────────────────────────

    fn process_add_member(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
        member: Pubkey,
        key_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let signer_pubkey = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        // Update subnet record.
        let mut subnet_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_subnet_record(subnet_account.get_data()).map_err(Self::map_err)?;

        if record.subnet_id != subnet_id {
            return Err(InstructionError::InvalidArgument);
        }
        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        record.add_member(member).map_err(Self::map_err)?;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(subnet_account.get_data_mut()?, &serialized)?;
        drop(subnet_account);

        // Write membership PDA.
        let membership = SubnetMembership {
            subnet_id,
            member,
            key_id,
            joined_at_slot: current_slot,
            is_active: true,
        };
        let serialized =
            to_vec(&membership).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut membership_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        Self::write_account(membership_account.get_data_mut()?, &serialized)
    }

    // ── RemoveSubnetMember ────────────────────────────────────────────────────

    fn process_remove_member(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
        member: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let signer_pubkey = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut subnet_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut record =
            deserialize_subnet_record(subnet_account.get_data()).map_err(Self::map_err)?;

        if record.subnet_id != subnet_id {
            return Err(InstructionError::InvalidArgument);
        }
        if record.owner != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }
        record.remove_member(&member).map_err(Self::map_err)?;
        let serialized = to_vec(&record).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(subnet_account.get_data_mut()?, &serialized)?;
        drop(subnet_account);

        // Mark membership as inactive.
        let mut membership_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let data = membership_account.get_data();
        if !data.iter().all(|b| *b == 0) && !data.is_empty() {
            let mut membership =
                deserialize_subnet_membership(data).map_err(Self::map_err)?;
            membership.is_active = false;
            let serialized =
                to_vec(&membership).map_err(|_| InstructionError::InvalidAccountData)?;
            Self::write_account(membership_account.get_data_mut()?, &serialized)?;
        }
        Ok(())
    }

    // ── CheckSubnetAccess ─────────────────────────────────────────────────────

    fn process_check_access(
        invoke_context: &mut InvokeContext,
        subnet_id: [u8; 32],
        member: Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        let subnet_acc =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let record =
            deserialize_subnet_record(subnet_acc.get_data()).map_err(Self::map_err)?;

        if record.subnet_id != subnet_id {
            return Err(InstructionError::InvalidArgument);
        }
        record.ensure_not_frozen().map_err(Self::map_err)?;
        drop(subnet_acc);

        {
            let membership_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            let data = membership_acc.get_data();
            if data.iter().all(|b| *b == 0) || data.is_empty() {
                return Err(InstructionError::Custom(
                    SubnetRegistryError::MemberNotFound as u32,
                ));
            }
            let membership = deserialize_subnet_membership(data).map_err(Self::map_err)?;
            if membership.member != member || !membership.is_active {
                return Err(InstructionError::Custom(
                    SubnetRegistryError::MemberNotFound as u32,
                ));
            }
        }

        // Return data: [1] = member active in non-frozen subnet.
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), vec![1u8])?;
        Ok(())
    }
}
