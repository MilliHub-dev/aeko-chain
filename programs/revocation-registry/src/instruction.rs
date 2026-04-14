use {
    aeko_permission_types::{KeyAlgorithm, KeyType},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

/// All instructions exposed by the revocation-registry program.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum RevocationRegistryInstruction {
    // ── Registry bootstrap ────────────────────────────────────────────────────
    /// Initialise the singleton `RevRegistryConfig` account.
    ///
    /// Accounts:
    ///   0. [writable] registry_config PDA  `[b"rev-config"]`
    ///   1. [signer]   upgrade_authority
    InitializeRegistry { current_slot: u64 },

    // ── Key registration ──────────────────────────────────────────────────────
    /// Register a new key in the Active state.
    ///
    /// Accounts:
    ///   0. [writable] key_record PDA  `[b"key", key_id]`
    ///   1. [signer]   owner / authority
    RegisterKey {
        key_id: [u8; 32],
        key_type: KeyType,
        key_algorithm: KeyAlgorithm,
        public_key_bytes: Vec<u8>,
        expires_at_slot: Option<u64>,
        current_slot: u64,
    },

    // ── Rotation lifecycle ────────────────────────────────────────────────────
    /// Transition `Active → PendingRotation` and create a `RotationIntent`.
    ///
    /// Accounts:
    ///   0. [writable] key_record PDA
    ///   1. [writable] rotation_intent PDA  `[b"rotation", key_id]`
    ///   2. [signer]   key owner
    InitiateRotation {
        key_id: [u8; 32],
        successor_key_id: [u8; 32],
        required_approvals: u8,
        ttl_slots: u64,
        current_slot: u64,
    },

    /// Add one approver's signature to a `RotationIntent`.
    ///
    /// Accounts:
    ///   0. [writable] rotation_intent PDA
    ///   1. [writable] rotation_approval PDA  `[b"approval", key_id, approver]`
    ///   2. [signer]   approver
    ApproveRotation { key_id: [u8; 32], current_slot: u64 },

    /// Execute the rotation once quorum is met.
    /// Transitions the old key to `Rotated` and the successor key to `Active`
    /// (successor must already be registered).
    ///
    /// Accounts:
    ///   0. [writable] old key_record PDA
    ///   1. [writable] successor key_record PDA
    ///   2. [writable] rotation_intent PDA
    ///   3. [signer]   any approver (or initiator)
    ExecuteRotation { key_id: [u8; 32], current_slot: u64 },

    // ── Revocation ────────────────────────────────────────────────────────────
    /// Revoke a key normally (`Active → Revoked`).
    ///
    /// Accounts:
    ///   0. [writable] key_record PDA
    ///   1. [signer]   key owner
    RevokeKey { key_id: [u8; 32] },

    /// Emergency revocation (`Active | PendingRotation → Compromised`).
    /// Bypasses quorum; callable only by the registry upgrade authority.
    ///
    /// Accounts:
    ///   0. [writable] key_record PDA
    ///   1. []         registry_config PDA
    ///   2. [signer]   upgrade_authority
    MarkCompromised { key_id: [u8; 32], reason_code: u16 },

    // ── Query (read-only, CPI-callable) ───────────────────────────────────────
    /// Returns true (via return data `[1]`) if the key is not in Active state.
    /// Returns false (`[0]`) for Active keys.
    ///
    /// Accounts:
    ///   0. [] key_record PDA
    IsRevoked { key_id: [u8; 32] },
}

// ── Instruction builder helpers ───────────────────────────────────────────────

pub fn initialize_registry(
    program_id: &Pubkey,
    registry_config_pda: &Pubkey,
    upgrade_authority: &Pubkey,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::InitializeRegistry { current_slot },
        vec![
            AccountMeta::new(*registry_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn register_key(
    program_id: &Pubkey,
    key_record_pda: &Pubkey,
    owner: &Pubkey,
    key_id: [u8; 32],
    key_type: KeyType,
    key_algorithm: KeyAlgorithm,
    public_key_bytes: Vec<u8>,
    expires_at_slot: Option<u64>,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::RegisterKey {
            key_id,
            key_type,
            key_algorithm,
            public_key_bytes,
            expires_at_slot,
            current_slot,
        },
        vec![
            AccountMeta::new(*key_record_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn initiate_rotation(
    program_id: &Pubkey,
    key_record_pda: &Pubkey,
    rotation_intent_pda: &Pubkey,
    owner: &Pubkey,
    key_id: [u8; 32],
    successor_key_id: [u8; 32],
    required_approvals: u8,
    ttl_slots: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::InitiateRotation {
            key_id,
            successor_key_id,
            required_approvals,
            ttl_slots,
            current_slot,
        },
        vec![
            AccountMeta::new(*key_record_pda, false),
            AccountMeta::new(*rotation_intent_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn approve_rotation(
    program_id: &Pubkey,
    rotation_intent_pda: &Pubkey,
    rotation_approval_pda: &Pubkey,
    approver: &Pubkey,
    key_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::ApproveRotation { key_id, current_slot },
        vec![
            AccountMeta::new(*rotation_intent_pda, false),
            AccountMeta::new(*rotation_approval_pda, false),
            AccountMeta::new_readonly(*approver, true),
        ],
    )
}

pub fn execute_rotation(
    program_id: &Pubkey,
    old_key_record_pda: &Pubkey,
    successor_key_record_pda: &Pubkey,
    rotation_intent_pda: &Pubkey,
    executor: &Pubkey,
    key_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::ExecuteRotation { key_id, current_slot },
        vec![
            AccountMeta::new(*old_key_record_pda, false),
            AccountMeta::new(*successor_key_record_pda, false),
            AccountMeta::new(*rotation_intent_pda, false),
            AccountMeta::new_readonly(*executor, true),
        ],
    )
}

pub fn revoke_key(
    program_id: &Pubkey,
    key_record_pda: &Pubkey,
    owner: &Pubkey,
    key_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::RevokeKey { key_id },
        vec![
            AccountMeta::new(*key_record_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn mark_compromised(
    program_id: &Pubkey,
    key_record_pda: &Pubkey,
    registry_config_pda: &Pubkey,
    upgrade_authority: &Pubkey,
    key_id: [u8; 32],
    reason_code: u16,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::MarkCompromised { key_id, reason_code },
        vec![
            AccountMeta::new(*key_record_pda, false),
            AccountMeta::new_readonly(*registry_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn is_revoked(
    program_id: &Pubkey,
    key_record_pda: &Pubkey,
    key_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &RevocationRegistryInstruction::IsRevoked { key_id },
        vec![AccountMeta::new_readonly(*key_record_pda, false)],
    )
}
