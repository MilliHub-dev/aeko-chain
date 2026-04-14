use {
    aeko_permission_types::ClearanceTier,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

/// All instructions exposed by the subnet-registry program.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SubnetRegistryInstruction {
    // ── Registry bootstrap ────────────────────────────────────────────────────
    /// Initialise the singleton `SubnetRegistryConfig`.
    ///
    /// Accounts:
    ///   0. [writable] registry_config PDA  `[b"subnet-config"]`
    ///   1. [signer]   upgrade_authority
    InitializeRegistry { current_slot: u64 },

    // ── Subnet lifecycle ──────────────────────────────────────────────────────
    /// Create a new permissioned subnet.
    ///
    /// Accounts:
    ///   0. [writable] subnet_record PDA  `[b"subnet", subnet_id]`
    ///   1. [signer]   owner
    CreateSubnet {
        subnet_id: [u8; 32],
        min_clearance: ClearanceTier,
        current_slot: u64,
    },

    /// Freeze a subnet — halts all new transaction processing for it.
    ///
    /// Accounts:
    ///   0. [writable] subnet_record PDA
    ///   1. [signer]   owner or upgrade_authority
    FreezeSubnet { subnet_id: [u8; 32], reason_code: u16 },

    /// Unfreeze a previously frozen subnet.
    ///
    /// Accounts:
    ///   0. [writable] subnet_record PDA
    ///   1. [signer]   owner or upgrade_authority
    UnfreezeSubnet { subnet_id: [u8; 32] },

    // ── Membership management ─────────────────────────────────────────────────
    /// Add a validator / wallet as a subnet member.
    ///
    /// Accounts:
    ///   0. [writable] subnet_record PDA
    ///   1. [writable] subnet_membership PDA  `[b"member", subnet_id, member]`
    ///   2. [signer]   subnet owner
    AddSubnetMember {
        subnet_id: [u8; 32],
        member: Pubkey,
        key_id: [u8; 32],
        current_slot: u64,
    },

    /// Remove a validator / wallet from subnet membership.
    ///
    /// Accounts:
    ///   0. [writable] subnet_record PDA
    ///   1. [writable] subnet_membership PDA
    ///   2. [signer]   subnet owner
    RemoveSubnetMember { subnet_id: [u8; 32], member: Pubkey },

    // ── Access query (CPI-callable) ───────────────────────────────────────────
    /// Check if a wallet is a member of a subnet and the subnet is not frozen.
    ///
    /// Accounts:
    ///   0. [] subnet_record PDA
    ///   1. [] subnet_membership PDA for the queried wallet
    CheckSubnetAccess { subnet_id: [u8; 32], member: Pubkey },
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
        &SubnetRegistryInstruction::InitializeRegistry { current_slot },
        vec![
            AccountMeta::new(*registry_config_pda, false),
            AccountMeta::new_readonly(*upgrade_authority, true),
        ],
    )
}

pub fn create_subnet(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    owner: &Pubkey,
    subnet_id: [u8; 32],
    min_clearance: ClearanceTier,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::CreateSubnet { subnet_id, min_clearance, current_slot },
        vec![
            AccountMeta::new(*subnet_record_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn freeze_subnet(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    authority: &Pubkey,
    subnet_id: [u8; 32],
    reason_code: u16,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::FreezeSubnet { subnet_id, reason_code },
        vec![
            AccountMeta::new(*subnet_record_pda, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}

pub fn unfreeze_subnet(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    authority: &Pubkey,
    subnet_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::UnfreezeSubnet { subnet_id },
        vec![
            AccountMeta::new(*subnet_record_pda, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}

pub fn add_subnet_member(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    membership_pda: &Pubkey,
    owner: &Pubkey,
    subnet_id: [u8; 32],
    member: Pubkey,
    key_id: [u8; 32],
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::AddSubnetMember { subnet_id, member, key_id, current_slot },
        vec![
            AccountMeta::new(*subnet_record_pda, false),
            AccountMeta::new(*membership_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn remove_subnet_member(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    membership_pda: &Pubkey,
    owner: &Pubkey,
    subnet_id: [u8; 32],
    member: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::RemoveSubnetMember { subnet_id, member },
        vec![
            AccountMeta::new(*subnet_record_pda, false),
            AccountMeta::new(*membership_pda, false),
            AccountMeta::new_readonly(*owner, true),
        ],
    )
}

pub fn check_subnet_access(
    program_id: &Pubkey,
    subnet_record_pda: &Pubkey,
    membership_pda: &Pubkey,
    subnet_id: [u8; 32],
    member: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SubnetRegistryInstruction::CheckSubnetAccess { subnet_id, member },
        vec![
            AccountMeta::new_readonly(*subnet_record_pda, false),
            AccountMeta::new_readonly(*membership_pda, false),
        ],
    )
}
