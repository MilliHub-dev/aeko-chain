use {
    crate::{
        error::EmergencyMultisigError,
        instruction::EmergencyMultisigInstruction,
        state::{
            deserialize_multisig_config, deserialize_proposal, deserialize_vote,
            multisig_config_address, proposal_address, vote_address, MultisigConfig, Proposal,
            ProposalStatus, ProposalVote, ProposedAction, MULTISIG_CONFIG_SPACE, PROPOSAL_SPACE,
            VOTE_SPACE,
        },
    },
    aeko_program_runtime::invoke_context::InvokeContext,
    aeko_sdk::{instruction::InstructionError, pubkey::Pubkey, system_instruction, system_program},
    borsh::{to_vec, BorshDeserialize},
};

pub struct Processor;

impl Processor {
    pub fn process(invoke_context: &mut InvokeContext) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;

        let instruction_data = instruction_context.get_instruction_data();
        let instruction = EmergencyMultisigInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            EmergencyMultisigInstruction::InitializeMultisig {
                signers,
                freeze_quorum,
                revoke_quorum,
                policy_quorum,
                current_slot,
            } => Self::process_initialize(
                invoke_context,
                signers,
                freeze_quorum,
                revoke_quorum,
                policy_quorum,
                current_slot,
            ),
            EmergencyMultisigInstruction::ProposeAction {
                proposal_id,
                action,
                ttl_slots,
                current_slot,
            } => {
                Self::process_propose(invoke_context, proposal_id, action, ttl_slots, current_slot)
            }
            EmergencyMultisigInstruction::ApproveAction {
                proposal_id,
                current_slot,
            } => Self::process_approve(invoke_context, proposal_id, current_slot),
            EmergencyMultisigInstruction::ExecuteAction {
                proposal_id,
                current_slot,
            } => Self::process_execute(invoke_context, proposal_id, current_slot),
            EmergencyMultisigInstruction::CancelAction { proposal_id } => {
                Self::process_cancel(invoke_context, proposal_id)
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

    fn load_canonical_config(
        invoke_context: &InvokeContext,
        account_index: u16,
    ) -> Result<MultisigConfig, InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context
            .try_borrow_instruction_account(transaction_context, account_index)?;
        if *account.get_key() != multisig_config_address() {
            return Err(InstructionError::InvalidArgument);
        }
        if account.get_owner() != &crate::id() {
            return Err(InstructionError::IncorrectProgramId);
        }
        deserialize_multisig_config(account.get_data()).map_err(Self::map_err)
    }

    fn ensure_pda_account(
        invoke_context: &mut InvokeContext,
        account_index: u16,
        payer_index: u16,
        expected_key: Pubkey,
        space: u64,
    ) -> Result<(), InstructionError> {
        let (actual_key, owner, lamports, data_len) = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            let account = instruction_context
                .try_borrow_instruction_account(transaction_context, account_index)?;
            (
                *account.get_key(),
                *account.get_owner(),
                account.get_lamports(),
                account.get_data().len(),
            )
        };
        if actual_key != expected_key {
            return Err(InstructionError::InvalidArgument);
        }
        if owner == crate::id() {
            if data_len < space as usize {
                return Err(InstructionError::AccountDataTooSmall);
            }
            return Ok(());
        }
        if owner != system_program::id() || lamports != 0 || data_len != 0 {
            return Err(InstructionError::IncorrectProgramId);
        }

        let payer_key = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            let payer = instruction_context
                .try_borrow_instruction_account(transaction_context, payer_index)?;
            if !payer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *payer.get_key()
        };
        let rent = invoke_context.get_sysvar_cache().get_rent()?;
        let lamports = rent.minimum_balance(space as usize).max(1);
        let create = system_instruction::create_account(
            &payer_key,
            &expected_key,
            lamports,
            space,
            &crate::id(),
        );
        invoke_context.native_invoke(create.into(), &[expected_key])
    }

    fn ensure_proposal_key(
        invoke_context: &InvokeContext,
        account_index: u16,
        proposal_id: &[u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context
            .try_borrow_instruction_account(transaction_context, account_index)?;
        if *account.get_key() != proposal_address(proposal_id)
            || account.get_owner() != &crate::id()
        {
            return Err(InstructionError::InvalidArgument);
        }
        Ok(())
    }

    fn instruction_account_key(
        invoke_context: &InvokeContext,
        account_index: u16,
    ) -> Result<Pubkey, InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context
            .try_borrow_instruction_account(transaction_context, account_index)?;
        Ok(*account.get_key())
    }

    fn ensure_target_program(
        invoke_context: &InvokeContext,
        account_index: u16,
        expected_program: &Pubkey,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let account = instruction_context
            .try_borrow_instruction_account(transaction_context, account_index)?;
        if account.get_key() != expected_program || !account.is_executable() {
            return Err(InstructionError::IncorrectProgramId);
        }
        Ok(())
    }

    // ── InitializeMultisig ────────────────────────────────────────────────────

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        signers: Vec<Pubkey>,
        freeze_quorum: u8,
        revoke_quorum: u8,
        policy_quorum: u8,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let upgrade_authority = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(4)?;
            let authority =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if !authority.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *authority.get_key()
        };

        if signers.is_empty()
            || signers.len() > crate::state::MAX_SIGNERS
            || freeze_quorum == 0
            || revoke_quorum == 0
            || policy_quorum == 0
            || usize::from(freeze_quorum) > signers.len()
            || usize::from(revoke_quorum) > signers.len()
            || usize::from(policy_quorum) > signers.len()
        {
            return Err(InstructionError::InvalidArgument);
        }

        Self::ensure_pda_account(
            invoke_context,
            0,
            2,
            multisig_config_address(),
            MULTISIG_CONFIG_SPACE,
        )?;

        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let mut config_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_multisig_config(config_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::AlreadyInitialized as u32,
                ));
            }
        }

        let config = MultisigConfig::new(
            upgrade_authority,
            signers,
            freeze_quorum,
            revoke_quorum,
            policy_quorum,
            current_slot,
        );
        let serialized = to_vec(&config).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(config_account.get_data_mut()?, &serialized)
    }

    // ── ProposeAction ─────────────────────────────────────────────────────────

    fn process_propose(
        invoke_context: &mut InvokeContext,
        proposal_id: [u8; 32],
        action: ProposedAction,
        ttl_slots: u64,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let config = Self::load_canonical_config(invoke_context, 1)?;
        config.ensure_initialized().map_err(Self::map_err)?;

        let proposer = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(5)?;
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            let pubkey = *signer.get_key();
            if !config.is_signer(&pubkey) {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::SignerNotMember as u32,
                ));
            }
            pubkey
        };

        let required_approvals = config.required_approvals(&action);
        Self::ensure_pda_account(
            invoke_context,
            0,
            3,
            proposal_address(&proposal_id),
            PROPOSAL_SPACE,
        )?;

        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let mut proposal_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_proposal(proposal_account.get_data()) {
            if existing.status == ProposalStatus::Pending {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::ProposalAlreadyExists as u32,
                ));
            }
        }

        let proposal = Proposal {
            proposal_id,
            proposer,
            action,
            status: ProposalStatus::Pending,
            approval_count: 0,
            required_approvals,
            created_at_slot: current_slot,
            expires_at_slot: current_slot.saturating_add(ttl_slots),
        };
        let serialized = to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)
    }

    // ── ApproveAction ─────────────────────────────────────────────────────────

    fn process_approve(
        invoke_context: &mut InvokeContext,
        proposal_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let config = Self::load_canonical_config(invoke_context, 2)?;
        config.ensure_initialized().map_err(Self::map_err)?;
        Self::ensure_proposal_key(invoke_context, 0, &proposal_id)?;

        let voter = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(6)?;
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 3)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            let pubkey = *signer.get_key();
            if !config.is_signer(&pubkey) {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::SignerNotMember as u32,
                ));
            }
            pubkey
        };

        let expected_vote = vote_address(&proposal_id, &voter);
        if Self::instruction_account_key(invoke_context, 1)? != expected_vote {
            return Err(InstructionError::InvalidArgument);
        }
        Self::ensure_pda_account(invoke_context, 1, 4, expected_vote, VOTE_SPACE)?;

        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let vote_data = {
            let vote_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            vote_acc.get_data().to_vec()
        };
        if !vote_data.iter().all(|byte| *byte == 0) && !vote_data.is_empty() {
            if let Ok(existing_vote) = deserialize_vote(&vote_data) {
                if existing_vote.proposal_id == proposal_id && existing_vote.voter == voter {
                    return Err(InstructionError::Custom(
                        EmergencyMultisigError::AlreadyApproved as u32,
                    ));
                }
            }
            return Err(InstructionError::InvalidAccountData);
        }

        let mut proposal_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut proposal =
            deserialize_proposal(proposal_account.get_data()).map_err(Self::map_err)?;

        if proposal.proposal_id != proposal_id {
            return Err(InstructionError::InvalidArgument);
        }
        if proposal.status != ProposalStatus::Pending {
            return Err(InstructionError::Custom(
                EmergencyMultisigError::ProposalAlreadyExecuted as u32,
            ));
        }
        if proposal.is_expired(current_slot) {
            return Err(InstructionError::Custom(
                EmergencyMultisigError::ProposalExpired as u32,
            ));
        }

        proposal.approval_count = proposal.approval_count.saturating_add(1);
        let serialized = to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)?;
        drop(proposal_account);

        let vote = ProposalVote {
            proposal_id,
            voter,
            voted_at_slot: current_slot,
        };
        let serialized = to_vec(&vote).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut vote_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        Self::write_account(vote_account.get_data_mut()?, &serialized)
    }

    // ── ExecuteAction ─────────────────────────────────────────────────────────

    /// Execute a proposal once quorum is reached.
    ///
    /// Registry mutations are performed through authenticated native CPI. The
    /// proposal is marked executed only after the target program succeeds.
    fn process_execute(
        invoke_context: &mut InvokeContext,
        proposal_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let config = Self::load_canonical_config(invoke_context, 1)?;
        config.ensure_initialized().map_err(Self::map_err)?;
        Self::ensure_proposal_key(invoke_context, 0, &proposal_id)?;

        {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            instruction_context.check_number_of_instruction_accounts(3)?;
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            if !config.is_signer(signer.get_key()) {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::SignerNotMember as u32,
                ));
            }
        }

        let proposal = {
            let transaction_context = &invoke_context.transaction_context;
            let instruction_context = transaction_context.get_current_instruction_context()?;
            let proposal_account =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let proposal =
                deserialize_proposal(proposal_account.get_data()).map_err(Self::map_err)?;
            if proposal.proposal_id != proposal_id {
                return Err(InstructionError::InvalidArgument);
            }
            proposal
                .ensure_executable(current_slot)
                .map_err(Self::map_err)?;
            proposal
        };

        match &proposal.action {
            ProposedAction::FreezeSubnet {
                subnet_id,
                reason_code,
            } => {
                Self::ensure_target_program(
                    invoke_context,
                    4,
                    &aeko_subnet_registry_program::id(),
                )?;
                let subnet_record = Self::instruction_account_key(invoke_context, 3)?;
                let cpi = aeko_subnet_registry_program::instruction::emergency_freeze_subnet(
                    &aeko_subnet_registry_program::id(),
                    &subnet_record,
                    *subnet_id,
                    *reason_code,
                );
                invoke_context.native_invoke(cpi.into(), &[])?;
            }
            ProposedAction::UnfreezeSubnet { subnet_id } => {
                Self::ensure_target_program(
                    invoke_context,
                    4,
                    &aeko_subnet_registry_program::id(),
                )?;
                let subnet_record = Self::instruction_account_key(invoke_context, 3)?;
                let cpi = aeko_subnet_registry_program::instruction::emergency_unfreeze_subnet(
                    &aeko_subnet_registry_program::id(),
                    &subnet_record,
                    *subnet_id,
                );
                invoke_context.native_invoke(cpi.into(), &[])?;
            }
            ProposedAction::EmergencyRevokeKey {
                key_id,
                reason_code,
            } => {
                Self::ensure_target_program(
                    invoke_context,
                    4,
                    &aeko_revocation_registry_program::id(),
                )?;
                let key_record = Self::instruction_account_key(invoke_context, 3)?;
                let cpi = aeko_revocation_registry_program::instruction::emergency_mark_compromised(
                    &aeko_revocation_registry_program::id(),
                    &key_record,
                    *key_id,
                    *reason_code,
                );
                invoke_context.native_invoke(cpi.into(), &[])?;
            }
            ProposedAction::UpgradeClearancePolicy { .. } => {
                return Err(InstructionError::Custom(
                    EmergencyMultisigError::UnsupportedAction as u32,
                ));
            }
        }

        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        let mut proposal_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut executed = proposal;
        executed.status = ProposalStatus::Executed;
        let serialized = to_vec(&executed).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)?;
        drop(proposal_account);

        let action_bytes =
            to_vec(&executed.action).map_err(|_| InstructionError::InvalidAccountData)?;
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), action_bytes)?;
        Ok(())
    }

    // ── CancelAction ──────────────────────────────────────────────────────────

    fn process_cancel(
        invoke_context: &mut InvokeContext,
        proposal_id: [u8; 32],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let config = Self::load_canonical_config(invoke_context, 1)?;
        config.ensure_initialized().map_err(Self::map_err)?;
        Self::ensure_proposal_key(invoke_context, 0, &proposal_id)?;

        let signer_pubkey = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut proposal_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut proposal =
            deserialize_proposal(proposal_account.get_data()).map_err(Self::map_err)?;

        if proposal.proposal_id != proposal_id {
            return Err(InstructionError::InvalidArgument);
        }
        if proposal.status != ProposalStatus::Pending {
            return Err(InstructionError::Custom(
                EmergencyMultisigError::ProposalAlreadyExecuted as u32,
            ));
        }

        // Only proposer or upgrade authority may cancel.
        if proposal.proposer != signer_pubkey && config.upgrade_authority != signer_pubkey {
            return Err(InstructionError::IncorrectAuthority);
        }

        proposal.status = ProposalStatus::Cancelled;
        let serialized = to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)
    }
}
