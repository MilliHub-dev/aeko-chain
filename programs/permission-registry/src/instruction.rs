use {
    aeko_permission_types::ClearanceTier,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

/// All instructions exposed by the permission-registry program.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PermissionRegistryInstruction {
    // ── Registry bootstrap ────────────────────────────────────────────────────
    /// Initialise the singleton `RegistryConfig` account.
    /// Must be called once by the deployer before any other instruction.
    ///
    /// Accounts:
    ///   0. [writable] registry_config PDA  `[b"registry-config"]`
    ///   1. [signer]   upgrade_authority
    InitializeRegistry { current_slot: u64 },

    // ── Issuer management (upgrade authority only) ────────────────────────────
    /// Whitelist an authority to issue SBTs for a specific tier.
    ///
    /// Accounts:
    ///   0. [writable] issuer_record PDA  `[b"issuer", authority, &[tier]]`
    ///   1. []         registry_config PDA
    ///   2. [signer]   upgrade_authority
    RegisterIssuer {
        /// The new issuer's public key.
        authority: Pubkey,
        tier: ClearanceTier,
        label: String,
        current_slot: u64,
    },

    /// Deactivate an issuer so it can no longer issue new SBTs.
    ///
    /// Accounts: same layout as RegisterIssuer.
    DeactivateIssuer { authority: Pubkey, tier: ClearanceTier },

    // ── Clearance SBT lifecycle ───────────────────────────────────────────────
    /// Issue a clearance SBT to a holder. Caller must be a registered, active issuer
    /// for the requested tier.
    ///
    /// Accounts:
    ///   0. [writable] clearance_sbt PDA  `[b"clearance", holder, &[tier]]`
    ///   1. []         issuer_record PDA
    ///   2. [signer]   issuer authority
    IssueClearance {
        holder: Pubkey,
        tier: ClearanceTier,
        valid_until_slot: Option<u64>,
        revocation_registry: Pubkey,
        current_slot: u64,
    },

    /// Revoke a clearance SBT. Only the issuer that created it or the upgrade
    /// authority may revoke it.
    ///
    /// Accounts:
    ///   0. [writable] clearance_sbt PDA
    ///   1. [signer]   issuer authority or upgrade_authority
    RevokeClearance { holder: Pubkey, tier: ClearanceTier },

    // ── Role management ───────────────────────────────────────────────────────
    /// Register a new role definition.
    ///
    /// Accounts:
    ///   0. [writable] role_entry PDA  `[b"role", role_id]`
    ///   1. [signer]   role authority
    RegisterRole {
        role_id: [u8; 32],
        label: String,
        min_clearance: ClearanceTier,
        max_clearance: ClearanceTier,
        subnet_bindings: Vec<[u8; 32]>,
        current_slot: u64,
    },

    /// Deactivate a role so no new assignments can be made.
    ///
    /// Accounts:
    ///   0. [writable] role_entry PDA
    ///   1. [signer]   role authority
    DeactivateRole { role_id: [u8; 32] },

    /// Assign a role to a wallet. The caller must hold clearance >= role.min_clearance.
    ///
    /// Accounts:
    ///   0. [writable] role_assignment PDA  `[b"role-assign", wallet, role_id]`
    ///   1. []         role_entry PDA
    ///   2. []         clearance_sbt PDA of the caller (proves caller clearance)
    ///   3. [signer]   assigning authority (must hold clearance)
    AssignRole {
        wallet: Pubkey,
        role_id: [u8; 32],
        current_slot: u64,
    },

    /// Revoke a role assignment.
    ///
    /// Accounts:
    ///   0. [writable] role_assignment PDA
    ///   1. []         role_entry PDA
    ///   2. [signer]   role authority
    RevokeRole { wallet: Pubkey, role_id: [u8; 32] },

    // ── Access evaluation (CPI target) ────────────────────────────────────────
    /// Evaluate the full access policy chain for a wallet against a required tier,
    /// role, and subnet. Returns via program log and return data.
    ///
    /// Accounts:
    ///   0. []  clearance_sbt PDA (may be missing for L0 — that is valid)
    ///   1. []  role_assignment PDA (may be missing — absence → RoleMissing)
    ///   2. []  role_entry PDA
    ///   3. []  subnet_record PDA (passed in by caller — owner must be subnet-registry)
    EvaluateAccess {
        wallet: Pubkey,
        required_tier: ClearanceTier,
        required_role_id: [u8; 32],
        subnet_id: [u8; 32],
        current_slot: u64,
    },

    /// Validate an `EncryptedPayloadEnvelope` header.
    /// Checks version, AAD integrity, and that the key_id is not revoked.
    ///
    /// Accounts:
    ///   0. []  key_record PDA in revocation-registry (owner = revocation-registry program)
    DecryptHeader {
        /// Serialised `EncryptedPayloadEnvelope` header (without ciphertext body).
        envelope_header: Vec<u8>,
    },
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
        &PermissionRegistryInstruction::InitializeRegistry { current_slot },
        vec![
            AccountMeta::new(*registry_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn register_issuer(
    program_id: &Pubkey,
    issuer_record_pda: &Pubkey,
    registry_config_pda: &Pubkey,
    upgrade_authority: &Pubkey,
    authority: Pubkey,
    tier: ClearanceTier,
    label: String,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::RegisterIssuer { authority, tier, label, current_slot },
        vec![
            AccountMeta::new(*issuer_record_pda, false),
            AccountMeta::new_readonly(*registry_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn issue_clearance(
    program_id: &Pubkey,
    clearance_sbt_pda: &Pubkey,
    issuer_record_pda: &Pubkey,
    issuer_authority: &Pubkey,
    holder: Pubkey,
    tier: ClearanceTier,
    valid_until_slot: Option<u64>,
    revocation_registry: Pubkey,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::IssueClearance {
            holder,
            tier,
            valid_until_slot,
            revocation_registry,
            current_slot,
        },
        vec![
            AccountMeta::new(*clearance_sbt_pda, false),
            AccountMeta::new_readonly(*issuer_record_pda, false),
            AccountMeta::new_readonly(*issuer_authority, true),
        ],
    )
}

pub fn revoke_clearance(
    program_id: &Pubkey,
    clearance_sbt_pda: &Pubkey,
    authority: &Pubkey,
    holder: Pubkey,
    tier: ClearanceTier,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::RevokeClearance { holder, tier },
        vec![
            AccountMeta::new(*clearance_sbt_pda, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}

pub fn register_role(
    program_id: &Pubkey,
    role_entry_pda: &Pubkey,
    role_authority: &Pubkey,
    role_id: [u8; 32],
    label: String,
    min_clearance: ClearanceTier,
    max_clearance: ClearanceTier,
    subnet_bindings: Vec<[u8; 32]>,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::RegisterRole {
            role_id,
            label,
            min_clearance,
            max_clearance,
            subnet_bindings,
            current_slot,
        },
        vec![
            AccountMeta::new(*role_entry_pda, false),
            AccountMeta::new_readonly(*role_authority, true),
        ],
    )
}

pub fn deactivate_role(
    program_id: &Pubkey,
    role_entry_pda: &Pubkey,
    role_authority: &Pubkey,
    role_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::DeactivateRole { role_id },
        vec![
            AccountMeta::new(*role_entry_pda, false),
            AccountMeta::new_readonly(*role_authority, true),
        ],
    )
}

pub fn assign_role(
    program_id: &Pubkey,
    role_assignment_pda: &Pubkey,
    role_entry_pda: &Pubkey,
    caller_clearance_sbt_pda: &Pubkey,
    assigning_authority: &Pubkey,
    wallet: Pubkey,
    role_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::AssignRole { wallet, role_id, current_slot },
        vec![
            AccountMeta::new(*role_assignment_pda, false),
            AccountMeta::new_readonly(*role_entry_pda, false),
            AccountMeta::new_readonly(*caller_clearance_sbt_pda, false),
            AccountMeta::new_readonly(*assigning_authority, true),
        ],
    )
}

pub fn revoke_role(
    program_id: &Pubkey,
    role_assignment_pda: &Pubkey,
    role_entry_pda: &Pubkey,
    role_authority: &Pubkey,
    wallet: Pubkey,
    role_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::RevokeRole { wallet, role_id },
        vec![
            AccountMeta::new(*role_assignment_pda, false),
            AccountMeta::new_readonly(*role_entry_pda, false),
            AccountMeta::new_readonly(*role_authority, true),
        ],
    )
}

pub fn evaluate_access(
    program_id: &Pubkey,
    clearance_sbt_pda: &Pubkey,
    role_assignment_pda: &Pubkey,
    role_entry_pda: &Pubkey,
    subnet_record_pda: &Pubkey,
    wallet: Pubkey,
    required_tier: ClearanceTier,
    required_role_id: [u8; 32],
    subnet_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PermissionRegistryInstruction::EvaluateAccess {
            wallet,
            required_tier,
            required_role_id,
            subnet_id,
            current_slot,
        },
        vec![
            AccountMeta::new_readonly(*clearance_sbt_pda, false),
            AccountMeta::new_readonly(*role_assignment_pda, false),
            AccountMeta::new_readonly(*role_entry_pda, false),
            AccountMeta::new_readonly(*subnet_record_pda, false),
        ],
    )
}
