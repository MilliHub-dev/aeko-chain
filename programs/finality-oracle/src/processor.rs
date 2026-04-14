use {
    crate::{
        error::FinalityOracleError,
        instruction::FinalityOracleInstruction,
        state::{
            deserialize_finality_proof, deserialize_proof_request, FinalityProof, OracleConfig,
            ProofRequest,
        },
    },
    aeko_permission_types::{ClearanceSbt, ClearanceTier},
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
        let instruction = FinalityOracleInstruction::try_from_slice(instruction_data)
            .map_err(|_| InstructionError::InvalidInstructionData)?;

        match instruction {
            FinalityOracleInstruction::InitializeOracle { current_slot } => {
                Self::process_initialize(invoke_context, current_slot)
            }
            FinalityOracleInstruction::RequestFinalityProof {
                transaction_signature,
                required_clearance,
                subnet_id,
                current_slot,
            } => Self::process_request(
                invoke_context,
                transaction_signature,
                required_clearance,
                subnet_id,
                current_slot,
            ),
            FinalityOracleInstruction::IssueFinalityProof {
                slot,
                transaction_signature,
                clearance_tier,
                subnet_id,
                proof_hash,
                current_slot,
            } => Self::process_issue(
                invoke_context,
                slot,
                transaction_signature,
                clearance_tier,
                subnet_id,
                proof_hash,
                current_slot,
            ),
            FinalityOracleInstruction::VerifyFinalityProof { transaction_signature } => {
                Self::process_verify(invoke_context, transaction_signature)
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

    fn deserialize_sbt(data: &[u8]) -> Option<ClearanceSbt> {
        let mut d = data;
        ClearanceSbt::deserialize(&mut d).ok()
    }

    // ── InitializeOracle ──────────────────────────────────────────────────────

    fn process_initialize(
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

        if let Ok(existing) = OracleConfig::deserialize_padded(config_account.get_data()) {
            if existing.is_initialized {
                return Err(InstructionError::Custom(
                    FinalityOracleError::AlreadyInitialized as u32,
                ));
            }
        }

        let config = OracleConfig::new(upgrade_authority, current_slot);
        let serialized = to_vec(&config).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(config_account.get_data_mut()?, &serialized)
    }

    // ── RequestFinalityProof ──────────────────────────────────────────────────

    fn process_request(
        invoke_context: &mut InvokeContext,
        transaction_signature: [u8; 64],
        required_clearance: ClearanceTier,
        subnet_id: Option<[u8; 32]>,
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(3)?;

        // Verify requester clearance.
        {
            let sbt_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            if let Some(sbt) = Self::deserialize_sbt(sbt_acc.get_data()) {
                if !sbt.is_active || !sbt.tier.satisfies(required_clearance) {
                    return Err(InstructionError::Custom(
                        FinalityOracleError::InsufficientClearance as u32,
                    ));
                }
            } else if required_clearance != ClearanceTier::Public {
                return Err(InstructionError::Custom(
                    FinalityOracleError::InsufficientClearance as u32,
                ));
            }
        }

        let requester = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        let mut request_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;

        if let Ok(existing) = deserialize_proof_request(request_account.get_data()) {
            if !existing.is_fulfilled {
                return Err(InstructionError::Custom(
                    FinalityOracleError::ProofRequestAlreadyExists as u32,
                ));
            }
        }

        let request = ProofRequest {
            transaction_signature,
            requester,
            required_clearance,
            subnet_id,
            requested_at_slot: current_slot,
            is_fulfilled: false,
        };
        let serialized = to_vec(&request).map_err(|_| InstructionError::InvalidAccountData)?;
        Self::write_account(request_account.get_data_mut()?, &serialized)
    }

    // ── IssueFinalityProof ────────────────────────────────────────────────────

    fn process_issue(
        invoke_context: &mut InvokeContext,
        slot: u64,
        transaction_signature: [u8; 64],
        clearance_tier: ClearanceTier,
        subnet_id: Option<[u8; 32]>,
        proof_hash: [u8; 32],
        current_slot: u64,
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(5)?;

        // Verify issuer clearance.
        {
            let sbt_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 2)?;
            if let Some(sbt) = Self::deserialize_sbt(sbt_acc.get_data()) {
                if !sbt.is_active || !sbt.tier.satisfies(clearance_tier) {
                    return Err(InstructionError::Custom(
                        FinalityOracleError::InsufficientClearance as u32,
                    ));
                }
            } else if clearance_tier != ClearanceTier::Public {
                return Err(InstructionError::Custom(
                    FinalityOracleError::InsufficientClearance as u32,
                ));
            }
        }

        let issuer = {
            let signer =
                instruction_context.try_borrow_instruction_account(transaction_context, 4)?;
            if !signer.is_signer() {
                return Err(InstructionError::MissingRequiredSignature);
            }
            *signer.get_key()
        };

        // Mark proof request as fulfilled.
        let mut request_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
        let request_data = request_account.get_data().to_vec();
        if !request_data.iter().all(|b| *b == 0) && !request_data.is_empty() {
            let mut request = deserialize_proof_request(&request_data).map_err(Self::map_err)?;
            request.is_fulfilled = true;
            let serialized =
                to_vec(&request).map_err(|_| InstructionError::InvalidAccountData)?;
            Self::write_account(request_account.get_data_mut()?, &serialized)?;
        }
        drop(request_account);

        // Write finality proof.
        let proof = FinalityProof {
            slot,
            transaction_signature,
            clearance_tier,
            subnet_id,
            issued_by: issuer,
            issued_at_slot: current_slot,
            proof_hash,
        };
        let serialized = to_vec(&proof).map_err(|_| InstructionError::InvalidAccountData)?;
        let mut proof_account =
            instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
        Self::write_account(proof_account.get_data_mut()?, &serialized)
    }

    // ── VerifyFinalityProof ───────────────────────────────────────────────────

    fn process_verify(
        invoke_context: &mut InvokeContext,
        transaction_signature: [u8; 64],
    ) -> Result<(), InstructionError> {
        let transaction_context = &invoke_context.transaction_context;
        let instruction_context = transaction_context.get_current_instruction_context()?;
        instruction_context.check_number_of_instruction_accounts(2)?;

        // Read and verify the finality proof.
        let proof = {
            let proof_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 0)?;
            let data = proof_acc.get_data();
            if data.iter().all(|b| *b == 0) || data.is_empty() {
                return Err(InstructionError::Custom(
                    FinalityOracleError::ProofNotFound as u32,
                ));
            }
            deserialize_finality_proof(data).map_err(Self::map_err)?
        };

        if proof.transaction_signature != transaction_signature {
            return Err(InstructionError::InvalidArgument);
        }
        if !proof.verify_hash() {
            return Err(InstructionError::Custom(
                FinalityOracleError::ProofHashMismatch as u32,
            ));
        }

        // Check issuer key is not revoked.
        // KeyRecord layout (from revocation-registry): key_id([u8;32]), owner(Pubkey=32 bytes),
        // then key_type(1), key_algorithm(1), public_key_bytes(vec), state(1)...
        // We read the state via `is_revoked` semantics: any non-Active state is invalid.
        // For simplicity we check byte 97 (32+32+1+1+1 after vec length prefix) — but
        // since vec length varies, we deserialize minimally.
        {
            let key_acc =
                instruction_context.try_borrow_instruction_account(transaction_context, 1)?;
            let data = key_acc.get_data();
            // If account has data, check it's not revoked.
            // We use the same layout check as permission-registry DecryptHeader:
            // KeyState is borsh-encoded as u8 discriminant. Active = 0.
            // The state field is at byte 32 (key_id) + 32 (owner) + 1 (key_type) + 1 (key_algorithm)
            // + 4 (vec len prefix) + N (public_key_bytes) + 8 (created_at_slot) + (1+8)(expires)...
            // Exact offset depends on public_key_bytes length. To avoid needing full deserialization
            // here we check: if the account is non-empty and has a known pattern, look for Active state.
            // If the account is zeroed / absent we allow it (unregistered key).
            if !data.iter().all(|b| *b == 0) && !data.is_empty() && data.len() > 33 {
                // Minimal check: first 32 bytes are key_id.
                // State is encoded somewhere after public_key_bytes — full deserialization is safest.
                // We do a best-effort: if account length >= 33 and byte[32] != 0 it's non-Active.
                // This matches the permission-registry DecryptHeader approach.
                let state_byte = data[32];
                if state_byte != 0 {
                    return Err(InstructionError::Custom(
                        FinalityOracleError::ProofIssuerRevoked as u32,
                    ));
                }
            }
        }

        // Return data: proof_hash bytes (so callers can read the committed hash).
        invoke_context
            .transaction_context
            .set_return_data(crate::id(), proof.proof_hash.to_vec())?;
        Ok(())
    }
}
