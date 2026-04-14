use {
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::pubkey::Pubkey,
};

/// Six-tier clearance hierarchy as defined in security-architecture.md §1.
///
/// A wallet without any SBT is implicitly L0. L0 is never stored on-chain.
/// Higher tiers do not imply lower tiers — each is independently issued.
/// A program requiring tier T accepts wallets holding an SBT for T, T+1, … L5.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, BorshSerialize, BorshDeserialize)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum ClearanceTier {
    /// L0 — Public / Anon. Implicit; no SBT stored.
    Public = 0,
    /// L1 — Verified Human. Proof-of-Humanity (biometric or social graph).
    VerifiedHuman = 1,
    /// L2 — KYC / Financial. Government ID verification.
    Kyc = 2,
    /// L3 — Enterprise. Corporate credential (LDAP / SAML).
    Enterprise = 3,
    /// L4 — Government. Sovereign identity assertion.
    Government = 4,
    /// L5 — Military / Top Secret. Hardware-bound key + biometric.
    Military = 5,
}

impl ClearanceTier {
    /// Returns true if `self` satisfies a requirement of `required`.
    /// A wallet at tier T satisfies any requirement <= T.
    pub fn satisfies(self, required: ClearanceTier) -> bool {
        self >= required
    }
}

/// On-chain account that proves a wallet holds a given clearance tier.
///
/// PDA seed: `[b"clearance", holder.as_ref(), &[tier as u8]]`
///
/// L0 is implicit — no account is created for L0 wallets.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct ClearanceSbt {
    /// Wallet this SBT is bound to. Cannot be transferred.
    pub holder: Pubkey,
    /// Clearance tier this SBT proves. Never L0.
    pub tier: ClearanceTier,
    /// The issuer authority that signed this SBT.
    pub issuer: Pubkey,
    /// Slot at which this SBT was issued.
    pub issued_at_slot: u64,
    /// Optional expiry. `None` means no expiry.
    pub valid_until_slot: Option<u64>,
    /// The `revocation-registry` program account to consult for revocation status.
    pub revocation_registry: Pubkey,
    /// Whether this SBT is currently active. Set to false on revocation.
    pub is_active: bool,
}

impl ClearanceSbt {
    /// Returns true if the SBT is currently valid at `current_slot`.
    /// Does NOT check the revocation registry — that is done by `verify_clearance`.
    pub fn is_valid_at(&self, current_slot: u64) -> bool {
        self.is_active
            && self
                .valid_until_slot
                .map(|expires| current_slot <= expires)
                .unwrap_or(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aeko_sdk::pubkey::Pubkey;

    fn dummy_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    fn make_sbt(tier: ClearanceTier, valid_until_slot: Option<u64>) -> ClearanceSbt {
        ClearanceSbt {
            holder: dummy_pubkey(),
            tier,
            issuer: dummy_pubkey(),
            issued_at_slot: 1,
            valid_until_slot,
            revocation_registry: dummy_pubkey(),
            is_active: true,
        }
    }

    // ── ClearanceTier ordering ────────────────────────────────────────────────

    #[test]
    fn l0_satisfies_l0_only() {
        assert!(ClearanceTier::Public.satisfies(ClearanceTier::Public));
        assert!(!ClearanceTier::Public.satisfies(ClearanceTier::VerifiedHuman));
        assert!(!ClearanceTier::Public.satisfies(ClearanceTier::Military));
    }

    #[test]
    fn higher_tier_satisfies_lower_requirements() {
        // L5 satisfies every tier.
        for required in [
            ClearanceTier::Public,
            ClearanceTier::VerifiedHuman,
            ClearanceTier::Kyc,
            ClearanceTier::Enterprise,
            ClearanceTier::Government,
            ClearanceTier::Military,
        ] {
            assert!(
                ClearanceTier::Military.satisfies(required),
                "L5 should satisfy {:?}",
                required
            );
        }
    }

    #[test]
    fn l3_does_not_satisfy_l4_or_l5() {
        assert!(!ClearanceTier::Enterprise.satisfies(ClearanceTier::Government));
        assert!(!ClearanceTier::Enterprise.satisfies(ClearanceTier::Military));
    }

    // ── ClearanceSbt validity ─────────────────────────────────────────────────

    #[test]
    fn sbt_no_expiry_is_always_valid() {
        let sbt = make_sbt(ClearanceTier::Kyc, None);
        assert!(sbt.is_valid_at(0));
        assert!(sbt.is_valid_at(u64::MAX));
    }

    #[test]
    fn sbt_expires_after_valid_until_slot() {
        let sbt = make_sbt(ClearanceTier::Kyc, Some(100));
        assert!(sbt.is_valid_at(100));
        assert!(!sbt.is_valid_at(101));
        assert!(!sbt.is_valid_at(u64::MAX));
    }

    #[test]
    fn inactive_sbt_is_always_invalid() {
        let mut sbt = make_sbt(ClearanceTier::Kyc, None);
        sbt.is_active = false;
        assert!(!sbt.is_valid_at(0));
        assert!(!sbt.is_valid_at(50));
    }

    // ── Borsh round-trip ──────────────────────────────────────────────────────

    #[test]
    fn clearance_sbt_round_trips_borsh() {
        let sbt = make_sbt(ClearanceTier::Enterprise, Some(999));
        let encoded = borsh::to_vec(&sbt).unwrap();
        let decoded: ClearanceSbt = borsh::from_slice(&encoded).unwrap();
        assert_eq!(sbt, decoded);
    }

    #[test]
    fn clearance_tier_round_trips_borsh() {
        for tier in [
            ClearanceTier::Public,
            ClearanceTier::VerifiedHuman,
            ClearanceTier::Kyc,
            ClearanceTier::Enterprise,
            ClearanceTier::Government,
            ClearanceTier::Military,
        ] {
            let encoded = borsh::to_vec(&tier).unwrap();
            let decoded: ClearanceTier = borsh::from_slice(&encoded).unwrap();
            assert_eq!(tier, decoded);
        }
    }
}

/// Registry entry authorising an issuer to issue SBTs for a specific tier.
///
/// PDA seed: `[b"issuer", authority.as_ref(), &[tier as u8]]`
///
/// Only the permission-registry upgrade authority may add or remove issuers.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct IssuerRecord {
    /// The public key of the issuing authority.
    pub authority: Pubkey,
    /// The tier this authority is permitted to issue SBTs for.
    pub tier: ClearanceTier,
    /// Human-readable label for the issuer (max 64 bytes).
    pub label: String,
    /// Whether this issuer is currently active.
    pub is_active: bool,
    /// Slot when this issuer was registered.
    pub registered_at_slot: u64,
}
