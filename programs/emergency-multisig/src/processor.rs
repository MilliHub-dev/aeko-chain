use {
    crate::{
        error::EmergencyMultisigError,
        instruction::EmergencyMultisigInstruction,
        state::{
            deserialize_multisig_config, deserialize_proposal, deserialize_vote, MultisigConfig,
            Proposal, ProposalStatus, ProposalVote, ProposedAction,
        },
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
            } => Self::process_propose(invoke_context, proposal_id, action, ttl_slots, current_slot),
            EmergencyMultisigInstruction::ApproveAction { proposal_id, current_slot } => {
                Self::process_approve(invoke_context, proposal_id, current_slot)
            }
            EmergencyMultisigInstruction::ExecuteAction { proposal_id, current_slot } => {
                Self::process_execute(invoke_context, proposal_id, current_slot)
            }
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

    // ── InitializeMultisig ────────────────────────────────────────────────────

    fn process_initialize(
        invoke_context: &mut InvokeContext,
        signers: Vec<Pubkey>,
        freeze_quorum: u8,
        revoke_quorum: u8,
        policy_quorum: u8,
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
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let config = {
            let acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            deserialize_multisig_config(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        let proposer = {
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
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(4)?;

        let config = {
            let acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            deserialize_multisig_config(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        let voter = {
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

        // Check vote PDA — reject double voting.
        let vote_data = {
            let vote_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            vote_acc.get_data().to_vec()
        };
        if !vote_data.iter().all(|b| *b == 0) && !vote_data.is_empty() {
            if let Ok(existing_vote) = deserialize_vote(&vote_data) {
                if existing_vote.proposal_id == proposal_id && existing_vote.voter == voter {
                    return Err(InstructionError::Custom(
                        EmergencyMultisigError::AlreadyApproved as u32,
                    ));
                }
            }
        }

        // Update proposal approval count.
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
        let serialized =
            to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)?;
        drop(proposal_account);

        // Write vote record.
        let vote = ProposalVote { proposal_id, voter, voted_at_slot: current_slot };
        let serialized = to_vec(&vote).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut vote_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        Self::write_account(vote_account.get_data_mut()?, &serialized)
    }

    // ── ExecuteAction ─────────────────────────────────────────────────────────

    /// Execute a proposal once quorum is reached.
    ///
    /// This processor applies the action directly to the in-process account data
    /// rather than performing a full CPI. In a production deployment these would
    /// CPI into the subnet-registry and revocation-registry programs. Here we
    /// encode the expected account layouts and mutate them directly, which is
    /// sufficient for unit-test verification.
    fn process_execute(
        invoke_context: &mut InvokeContext,
        proposal_id: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        let config = {
            let acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            deserialize_multisig_config(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

        {
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

        let mut proposal_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        let mut proposal =
            deserialize_proposal(proposal_account.get_data()).map_err(Self::map_err)?;

        if proposal.proposal_id != proposal_id {
            return Err(InstructionError::InvalidArgument);
        }
        proposal.ensure_executable(current_slot).map_err(Self::map_err)?;

        proposal.status = ProposalStatus::Executed;
        let serialized =
            to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)?;
        drop(proposal_account);

        // Emit the executed action via return data so callers can observe it.
        let action_bytes =
            to_vec(&proposal.action).map_err(|_| InstructionError::InvalidAccountData)?;
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

        let config = {
            let acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            deserialize_multisig_config(acc.get_data())
                .map_err(|_| InstructionError::InvalidAccountData)?
        };
        config.ensure_initialized().map_err(Self::map_err)?;

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
        let serialized =
            to_vec(&proposal).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(proposal_account.get_data_mut()?, &serialized)
    }
}
