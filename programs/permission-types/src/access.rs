use borsh::{BorshDeserialize, BorshSerialize};

/// Result of the `EvaluateAccess` policy chain (security-architecture.md §3).
///
/// The chain evaluates in order:
///   1. Clearance check
///   2. Role check
///   3. Subnet check
///   4. DenyByDefault (L3+)
///
/// L0 transactions bypass the chain entirely.
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum AccessResult {
    Granted,
    Denied(AccessDeniedReason),
}

/// Reason codes returned when `EvaluateAccess` denies a request.
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum AccessDeniedReason {
    /// No SBT found for the required tier.
    ClearanceMissing = 0,
    /// SBT exists but has passed its `valid_until_slot`.
    ClearanceExpired = 1,
    /// SBT exists but the key is listed in the revocation registry.
    ClearanceRevoked = 2,
    /// Wallet has no active role assignment for the required role.
    RoleMissing = 3,
    /// Role assignment exists but the role itself is inactive.
    RoleInactive = 4,
    /// Wallet clearance is outside the role's `min_clearance..=max_clearance` range.
    ClearanceOutOfRange = 5,
    /// Subnet is currently frozen by an emergency action.
    SubnetFrozen = 6,
    /// Wallet does not have an active membership record in the subnet.
    SubnetMembershipMissing = 7,
    /// L3+ DenyByDefault: no explicit role grant passed all checks.
    DenyByDefault = 8,
    /// L5 transaction sent to a validator that does not support SGX enclave execution.
    RequiresEnclave = 9,
}
