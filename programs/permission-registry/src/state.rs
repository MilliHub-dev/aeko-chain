use {
    crate::error::PermissionRegistryError,
    aeko_permission_types::{ClearanceSbt, ClearanceTier, IssuerRecord, RoleEntry, WalletRoleAssignment},
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

// ── PDA seed helpers ──────────────────────────────────────────────────────────
//
// PDA seeds — callers must place the tier byte in a local variable before passing
// it to `create_program_address` because Rust cannot return references to temporaries.
//
// clearance_sbt:  [b"clearance", holder.as_ref(), &[tier as u8]]
// issuer_record:  [b"issuer",    authority.as_ref(), &[tier as u8]]
// role_entry:     [b"role",      role_id.as_ref()]
// role_assign:    [b"role-assign", wallet.as_ref(), role_id.as_ref()]

pub const CLEARANCE_SBT_SEED: &[u8] = b"clearance";
pub const ISSUER_RECORD_SEED: &[u8] = b"issuer";
pub const ROLE_SEED: &[u8] = b"role";
pub const ROLE_ASSIGN_SEED: &[u8] = b"role-assign";
pub const REGISTRY_CONFIG_SEED: &[u8] = b"registry-config";

// ── Account state wrappers ────────────────────────────────────────────────────

/// Top-level state account that tracks the upgrade authority for the registry.
///
/// One singleton account per deployment.
/// PDA seed: `[b"registry-config"]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct RegistryConfig {
    pub is_initialized: bool,
    /// The authority that may register / deactivate issuers and upgrade the program.
    pub upgrade_authority: Pubkey,
    pub created_at_slot: u64,
}

impl RegistryConfig {
    pub fn new(upgrade_authority: Pubkey, current_slot: u64) -> Self {
        Self {
            is_initialized: true,
            upgrade_authority,
            created_at_slot: current_slot,
        }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(PermissionRegistryError::Uninitialized.into())
        }
    }

    pub fn ensure_upgrade_authority(&self, signer: &Pubkey) -> Result<(), ProgramError> {
        if *signer == self.upgrade_authority {
            Ok(())
        } else {
            Err(PermissionRegistryError::Unauthorized.into())
        }
    }
}

// ── ClearanceSbt helpers ──────────────────────────────────────────────────────

pub fn deserialize_clearance_sbt(data: &[u8]) -> Result<ClearanceSbt, ProgramError> {
    let mut d = data;
    ClearanceSbt::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_issuer_record(data: &[u8]) -> Result<IssuerRecord, ProgramError> {
    let mut d = data;
    IssuerRecord::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_role_entry(data: &[u8]) -> Result<RoleEntry, ProgramError> {
    let mut d = data;
    RoleEntry::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_role_assignment(data: &[u8]) -> Result<WalletRoleAssignment, ProgramError> {
    let mut d = data;
    WalletRoleAssignment::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

/// Verify that an issuer is authorised to issue SBTs for the given tier.
pub fn verify_issuer(
    issuer_record: &IssuerRecord,
    issuer_pubkey: &Pubkey,
    requested_tier: ClearanceTier,
) -> Result<(), ProgramError> {
    if *issuer_pubkey != issuer_record.authority {
        return Err(PermissionRegistryError::Unauthorized.into());
    }
    if !issuer_record.is_active {
        return Err(PermissionRegistryError::IssuerInactive.into());
    }
    if issuer_record.tier != requested_tier {
        return Err(PermissionRegistryError::IssuerNotAuthorizedForTier.into());
    }
    Ok(())
}

/// Verify clearance: check that a wallet's SBT satisfies the required tier at `current_slot`.
///
/// This is the pure-logic version of Step 1 in the `EvaluateAccess` chain
/// (security-architecture.md §3). It does NOT consult the revocation registry
/// (that requires an on-chain account read in the processor).
pub fn verify_clearance(
    sbt: &ClearanceSbt,
    required_tier: ClearanceTier,
    current_slot: u64,
) -> Result<(), ProgramError> {
    if !sbt.is_active {
        return Err(PermissionRegistryError::SbtRevoked.into());
    }
    if !sbt.is_valid_at(current_slot) {
        return Err(PermissionRegistryError::SbtExpired.into());
    }
    if !sbt.tier.satisfies(required_tier) {
        return Err(PermissionRegistryError::ClearanceMissing.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aeko_permission_types::{AccessDeniedReason, IssuerRecord, RoleEntry, WalletRoleAssignment};

    fn dummy_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    fn make_sbt(tier: ClearanceTier, valid_until_slot: Option<u64>, active: bool) -> ClearanceSbt {
        ClearanceSbt {
            holder: dummy_pubkey(),
            tier,
            issuer: dummy_pubkey(),
            issued_at_slot: 1,
            valid_until_slot,
            revocation_registry: dummy_pubkey(),
            is_active: active,
        }
    }

    fn make_issuer(tier: ClearanceTier, active: bool) -> (IssuerRecord, Pubkey) {
        let authority = dummy_pubkey();
        let record = IssuerRecord {
            authority,
            tier,
            label: "Test Issuer".to_string(),
            is_active: active,
            registered_at_slot: 1,
        };
        (record, authority)
    }

    // ── verify_clearance ──────────────────────────────────────────────────────

    /// L0 callers have no SBT at all; check that a missing/inactive SBT is rejected.
    #[test]
    fn verify_clearance_rejects_inactive_sbt() {
        let sbt = make_sbt(ClearanceTier::Kyc, None, false);
        let err = verify_clearance(&sbt, ClearanceTier::Kyc, 100).unwrap_err();
        assert_eq!(err, PermissionRegistryError::SbtRevoked.into());
    }

    #[test]
    fn verify_clearance_rejects_expired_sbt() {
        let sbt = make_sbt(ClearanceTier::Kyc, Some(99), true);
        // Slot 100 is after expiry.
        let err = verify_clearance(&sbt, ClearanceTier::Kyc, 100).unwrap_err();
        assert_eq!(err, PermissionRegistryError::SbtExpired.into());
    }

    #[test]
    fn verify_clearance_accepts_at_exact_expiry_slot() {
        let sbt = make_sbt(ClearanceTier::Kyc, Some(100), true);
        // Slot 100 is exactly the expiry slot — should still be valid.
        assert!(verify_clearance(&sbt, ClearanceTier::Kyc, 100).is_ok());
    }

    #[test]
    fn verify_clearance_rejects_insufficient_tier() {
        let sbt = make_sbt(ClearanceTier::VerifiedHuman, None, true);
        // Wallet holds L1 but L2 is required.
        let err = verify_clearance(&sbt, ClearanceTier::Kyc, 1).unwrap_err();
        assert_eq!(err, PermissionRegistryError::ClearanceMissing.into());
    }

    #[test]
    fn verify_clearance_accepts_higher_tier_for_lower_requirement() {
        // L5 wallet satisfies L2 requirement.
        let sbt = make_sbt(ClearanceTier::Military, None, true);
        assert!(verify_clearance(&sbt, ClearanceTier::Kyc, 1).is_ok());
    }

    #[test]
    fn verify_clearance_accepts_no_expiry_sbt_at_any_slot() {
        let sbt = make_sbt(ClearanceTier::Enterprise, None, true);
        assert!(verify_clearance(&sbt, ClearanceTier::Enterprise, 0).is_ok());
        assert!(verify_clearance(&sbt, ClearanceTier::Enterprise, u64::MAX).is_ok());
    }

    // ── verify_issuer ─────────────────────────────────────────────────────────

    #[test]
    fn verify_issuer_accepts_correct_active_issuer() {
        let (record, authority) = make_issuer(ClearanceTier::Kyc, true);
        assert!(verify_issuer(&record, &authority, ClearanceTier::Kyc).is_ok());
    }

    #[test]
    fn verify_issuer_rejects_wrong_authority() {
        let (record, _) = make_issuer(ClearanceTier::Kyc, true);
        let other = dummy_pubkey();
        let err = verify_issuer(&record, &other, ClearanceTier::Kyc).unwrap_err();
        assert_eq!(err, PermissionRegistryError::Unauthorized.into());
    }

    #[test]
    fn verify_issuer_rejects_inactive_issuer() {
        let (record, authority) = make_issuer(ClearanceTier::Kyc, false);
        let err = verify_issuer(&record, &authority, ClearanceTier::Kyc).unwrap_err();
        assert_eq!(err, PermissionRegistryError::IssuerInactive.into());
    }

    #[test]
    fn verify_issuer_rejects_wrong_tier() {
        let (record, authority) = make_issuer(ClearanceTier::Kyc, true);
        // Issuer is registered for L2 but tries to issue L3.
        let err = verify_issuer(&record, &authority, ClearanceTier::Enterprise).unwrap_err();
        assert_eq!(err, PermissionRegistryError::IssuerNotAuthorizedForTier.into());
    }

    // ── RegistryConfig ────────────────────────────────────────────────────────

    #[test]
    fn registry_config_round_trips_borsh() {
        let authority = dummy_pubkey();
        let config = RegistryConfig::new(authority, 42);
        let encoded = borsh::to_vec(&config).unwrap();
        let decoded = RegistryConfig::deserialize_padded(&encoded).unwrap();
        assert_eq!(config, decoded);
    }

    #[test]
    fn registry_config_uninitialized_returns_error() {
        let config = RegistryConfig {
            is_initialized: false,
            upgrade_authority: dummy_pubkey(),
            created_at_slot: 0,
        };
        let err = config.ensure_initialized().unwrap_err();
        assert_eq!(err, PermissionRegistryError::Uninitialized.into());
    }

    #[test]
    fn registry_config_wrong_authority_returns_error() {
        let authority = dummy_pubkey();
        let config = RegistryConfig::new(authority, 1);
        let other = dummy_pubkey();
        let err = config.ensure_upgrade_authority(&other).unwrap_err();
        assert_eq!(err, PermissionRegistryError::Unauthorized.into());
    }

    // ── AccessDeniedReason discriminant sanity ────────────────────────────────

    #[test]
    fn access_denied_reason_subnet_frozen_is_6() {
        // The subnet hook in bank.rs hardcodes SUBNET_FROZEN_CODE = 6.
        // Confirm the enum discriminant hasn't drifted.
        assert_eq!(AccessDeniedReason::SubnetFrozen as u32, 6);
    }
}
