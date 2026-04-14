use {
    aeko_permission_types::ClearanceTier,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

/// All instructions exposed by the finality-oracle program.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum FinalityOracleInstruction {
    // ── Bootstrap ─────────────────────────────────────────────────────────────
    /// Initialise the singleton `OracleConfig`.
    ///
    /// Accounts:
    ///   0. [writable] oracle_config PDA  `[b"oracle-config"]`
    ///   1. [signer]   upgrade_authority
    InitializeOracle { current_slot: u64 },

    // ── Proof lifecycle ───────────────────────────────────────────────────────
    /// Request a finality proof for a transaction.
    /// The requester must hold the required clearance.
    ///
    /// Accounts:
    ///   0. [writable] proof_request PDA  `[b"proof-req", transaction_signature]`
    ///   1. []         clearance_sbt PDA of the requester
    ///   2. [signer]   requester
    RequestFinalityProof {
        transaction_signature: [u8; 64],
        required_clearance: ClearanceTier,
        subnet_id: Option<[u8; 32]>,
        current_slot: u64,
    },

    /// Issue a finality proof for a transaction.
    /// Only callable by validators that hold the proof's clearance tier
    /// and are members of the relevant subnet.
    ///
    /// Accounts:
    ///   0. [writable] finality_proof PDA  `[b"proof", transaction_signature]`
    ///   1. [writable] proof_request PDA   (must exist and be unfulfilled)
    ///   2. []         clearance_sbt PDA of the issuer
    ///   3. []         subnet_membership PDA of the issuer (if subnet-scoped)
    ///   4. [signer]   issuer (validator)
    IssueFinalityProof {
        slot: u64,
        transaction_signature: [u8; 64],
        clearance_tier: ClearanceTier,
        subnet_id: Option<[u8; 32]>,
        proof_hash: [u8; 32],
        current_slot: u64,
    },

    /// Verify a finality proof.
    /// Public read — verifies the proof_hash, checks the issuer clearance is
    /// not revoked, and checks the issuer is still a subnet member.
    ///
    /// Accounts:
    ///   0. [] finality_proof PDA
    ///   1. [] key_record PDA for the issuer's key (revocation-registry)
    VerifyFinalityProof { transaction_signature: [u8; 64] },
}

// ── Instruction builder helpers ───────────────────────────────────────────────

pub fn initialize_oracle(
    program_id: &Pubkey,
    oracle_config_pda: &Pubkey,
    upgrade_authority: &Pubkey,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &FinalityOracleInstruction::InitializeOracle { current_slot },
        vec![
            AccountMeta::new(*oracle_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn request_finality_proof(
    program_id: &Pubkey,
    proof_request_pda: &Pubkey,
    clearance_sbt_pda: &Pubkey,
    requester: &Pubkey,
    transaction_signature: [u8; 64],
    required_clearance: ClearanceTier,
    subnet_id: Option<[u8; 32]>,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &FinalityOracleInstruction::RequestFinalityProof {
            transaction_signature,
            required_clearance,
            subnet_id,
            current_slot,
        },
        vec![
            AccountMeta::new(*proof_request_pda, false),
            AccountMeta::new_readonly(*clearance_sbt_pda, false),
            AccountMeta::new_readonly(*requester, true),
        ],
    )
}

pub fn issue_finality_proof(
    program_id: &Pubkey,
    finality_proof_pda: &Pubkey,
    proof_request_pda: &Pubkey,
    clearance_sbt_pda: &Pubkey,
    subnet_membership_pda: Option<&Pubkey>,
    issuer: &Pubkey,
    slot: u64,
    transaction_signature: [u8; 64],
    clearance_tier: ClearanceTier,
    subnet_id: Option<[u8; 32]>,
    proof_hash: [u8; 32],
    current_slot: u64,
) -> Instruction {
    let dummy_key = Pubkey::default();
    let membership_key = subnet_membership_pda.unwrap_or(&dummy_key);
    Instruction::new_with_borsh(
        *program_id,
        &FinalityOracleInstruction::IssueFinalityProof {
            slot,
            transaction_signature,
            clearance_tier,
            subnet_id,
            proof_hash,
            current_slot,
        },
        vec![
            AccountMeta::new(*finality_proof_pda, false),
            AccountMeta::new(*proof_request_pda, false),
            AccountMeta::new_readonly(*clearance_sbt_pda, false),
            AccountMeta::new_readonly(*membership_key, false),
            AccountMeta::new_readonly(*issuer, true),
        ],
    )
}

pub fn verify_finality_proof(
    program_id: &Pubkey,
    finality_proof_pda: &Pubkey,
    key_record_pda: &Pubkey,
    transaction_signature: [u8; 64],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &FinalityOracleInstruction::VerifyFinalityProof { transaction_signature },
        vec![
            AccountMeta::new_readonly(*finality_proof_pda, false),
            AccountMeta::new_readonly(*key_record_pda, false),
        ],
    )
}
