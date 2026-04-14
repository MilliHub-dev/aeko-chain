use {
    crate::state::ProposedAction,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

/// All instructions exposed by the emergency-multisig program.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum EmergencyMultisigInstruction {
    // ── Bootstrap ─────────────────────────────────────────────────────────────
    /// Initialise the singleton `MultisigConfig`.
    ///
    /// Accounts:
    ///   0. [writable] multisig_config PDA  `[b"multisig"]`
    ///   1. [signer]   upgrade_authority
    InitializeMultisig {
        signers: Vec<Pubkey>,
        freeze_quorum: u8,
        revoke_quorum: u8,
        policy_quorum: u8,
        current_slot: u64,
    },

    // ── Proposal lifecycle ────────────────────────────────────────────────────
    /// Create a new action proposal.
    ///
    /// Accounts:
    ///   0. [writable] proposal PDA  `[b"proposal", proposal_id]`
    ///   1. []         multisig_config PDA
    ///   2. [signer]   proposer (must be a multisig signer)
    ProposeAction {
        proposal_id: [u8; 32],
        action: ProposedAction,
        ttl_slots: u64,
        current_slot: u64,
    },

    /// Approve a proposal. Creates a vote record.
    ///
    /// Accounts:
    ///   0. [writable] proposal PDA
    ///   1. [writable] vote PDA  `[b"vote", proposal_id, voter]`
    ///   2. []         multisig_config PDA
    ///   3. [signer]   voter (must be a multisig signer)
    ApproveAction { proposal_id: [u8; 32], current_slot: u64 },

    /// Execute a proposal once quorum is reached.
    ///
    /// The accounts beyond index 1 vary by action type and are documented
    /// per action below. The processor routes to the appropriate CPI.
    ///
    /// Common accounts:
    ///   0. [writable] proposal PDA
    ///   1. []         multisig_config PDA
    ///   2. [signer]   executor (any multisig signer)
    ///
    /// Additional accounts for FreezeSubnet / UnfreezeSubnet:
    ///   3. [writable] subnet_record PDA  (owner = subnet-registry)
    ///
    /// Additional accounts for EmergencyRevokeKey:
    ///   3. [writable] key_record PDA        (owner = revocation-registry)
    ///   4. []         rev_registry_config   (owner = revocation-registry)
    ExecuteAction { proposal_id: [u8; 32], current_slot: u64 },

    /// Cancel a proposal (proposer or upgrade authority only).
    ///
    /// Accounts:
    ///   0. [writable] proposal PDA
    ///   1. []         multisig_config PDA
    ///   2. [signer]   proposer or upgrade_authority
    CancelAction { proposal_id: [u8; 32] },
}

// ── Instruction builder helpers ───────────────────────────────────────────────

pub fn initialize_multisig(
    program_id: &Pubkey,
    multisig_config_pda: &Pubkey,
    upgrade_authority: &Pubkey,
    signers: Vec<Pubkey>,
    freeze_quorum: u8,
    revoke_quorum: u8,
    policy_quorum: u8,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &EmergencyMultisigInstruction::InitializeMultisig {
            signers,
            freeze_quorum,
            revoke_quorum,
            policy_quorum,
            current_slot,
        },
        vec![
            AccountMeta::new(*multisig_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn propose_action(
    program_id: &Pubkey,
    proposal_pda: &Pubkey,
    multisig_config_pda: &Pubkey,
    proposer: &Pubkey,
    proposal_id: [u8; 32],
    action: ProposedAction,
    ttl_slots: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &EmergencyMultisigInstruction::ProposeAction {
            proposal_id,
            action,
            ttl_slots,
            current_slot,
        },
        vec![
            AccountMeta::new(*proposal_pda, false),
            AccountMeta::new_readonly(*multisig_config_pda, false),
            AccountMeta::new_readonly(*proposer, true),
        ],
    )
}

pub fn approve_action(
    program_id: &Pubkey,
    proposal_pda: &Pubkey,
    vote_pda: &Pubkey,
    multisig_config_pda: &Pubkey,
    voter: &Pubkey,
    proposal_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &EmergencyMultisigInstruction::ApproveAction { proposal_id, current_slot },
        vec![
            AccountMeta::new(*proposal_pda, false),
            AccountMeta::new(*vote_pda, false),
            AccountMeta::new_readonly(*multisig_config_pda, false),
            AccountMeta::new_readonly(*voter, true),
        ],
    )
}

pub fn execute_action(
    program_id: &Pubkey,
    proposal_pda: &Pubkey,
    multisig_config_pda: &Pubkey,
    executor: &Pubkey,
    proposal_id: [u8; 32],
    current_slot: u64,
    extra_accounts: Vec<AccountMeta>,
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new(*proposal_pda, false),
        AccountMeta::new_readonly(*multisig_config_pda, false),
        AccountMeta::new_readonly(*executor, true),
    ];
    accounts.extend(extra_accounts);
    Instruction::new_with_borsh(
        *program_id,
        &EmergencyMultisigInstruction::ExecuteAction { proposal_id, current_slot },
        accounts,
    )
}

pub fn cancel_action(
    program_id: &Pubkey,
    proposal_pda: &Pubkey,
    multisig_config_pda: &Pubkey,
    authority: &Pubkey,
    proposal_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &EmergencyMultisigInstruction::CancelAction { proposal_id },
        vec![
            AccountMeta::new(*proposal_pda, false),
            AccountMeta::new_readonly(*multisig_config_pda, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}
