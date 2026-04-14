use {
    crate::clearance::ClearanceTier,
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::pubkey::Pubkey,
};

/// A named capability that binds a clearance range to one or more subnets.
///
/// PDA seed: `[b"role", role_id.as_ref()]`
///
/// `role_id` is computed as: SHA-256(authority || label.as_bytes())
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct RoleEntry {
    /// 32-byte identifier: SHA-256(authority || label.as_bytes())
    pub role_id: [u8; 32],
    /// The authority that owns and manages this role definition.
    pub authority: Pubkey,
    /// Human-readable label (max 64 bytes).
    pub label: String,
    /// Minimum clearance required to hold this role.
    pub min_clearance: ClearanceTier,
    /// Maximum clearance allowed for this role (inclusive).
    pub max_clearance: ClearanceTier,
    /// The subnet IDs this role grants access to.
    pub subnet_bindings: Vec<[u8; 32]>,
    /// Slot at which this role was created.
    pub created_at_slot: u64,
    /// Whether this role is currently active.
    pub is_active: bool,
}

/// Records that a specific wallet has been assigned a role.
///
/// PDA seed: `[b"role-assign", wallet.as_ref(), role_id.as_ref()]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletRoleAssignment {
    /// The wallet that was assigned the role.
    pub wallet: Pubkey,
    /// The role that was assigned.
    pub role_id: [u8; 32],
    /// Slot at which the assignment was made.
    pub assigned_at_slot: u64,
    /// Authority that made the assignment.
    pub assigned_by: Pubkey,
    /// Whether this assignment is currently active.
    pub is_active: bool,
}
