/// Encryption audit log for L3+ operations (security-architecture.md §14, PCI-DSS control).
///
/// Every encrypt / decrypt operation at clearance L3 and above must produce an
/// `EncryptionAuditEntry`. Callers are responsible for persisting these entries
/// via the on-chain audit log (same pattern as `WalletPermissionAuditLogEntry`).
use aeko_permission_types::ClearanceTier;

/// The type of cryptographic operation that was performed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoOperation {
    /// AES-256-GCM encryption of a transaction payload.
    AesGcmEncrypt,
    /// AES-256-GCM decryption of a transaction payload.
    AesGcmDecrypt,
    /// ECIES envelope encryption (social privacy: DM, private post).
    EciesEncrypt,
    /// ECIES envelope decryption.
    EciesDecrypt,
    /// ECDH key establishment (new session key derived).
    EcdhKeyEstablish,
    /// Session key rotation triggered.
    SessionKeyRotation,
    /// Node channel rekey.
    NodeChannelRekey,
}

/// An immutable record of one cryptographic operation performed at L3+.
///
/// Persisted to the on-chain audit log account so compliance auditors can
/// verify that all encryption operations were performed with approved keys
/// and algorithms (PCI-DSS, ISO 27001 A.10).
#[derive(Debug, Clone)]
pub struct EncryptionAuditEntry {
    /// The clearance tier at which this operation was performed.
    pub tier: ClearanceTier,
    /// The type of operation.
    pub operation: CryptoOperation,
    /// The `key_id` of the session key used (SHA-256 derived per §4.2).
    /// Never contains raw key material.
    pub key_id: [u8; 32],
    /// The subnet ID this operation was scoped to, if applicable.
    pub subnet_id: Option<[u8; 32]>,
    /// The slot at which the operation was performed.
    pub slot: u64,
    /// The wallet or node identity that initiated the operation.
    pub actor: [u8; 32],
}

impl EncryptionAuditEntry {
    /// Create a new audit entry. Only creates entries for L3+ operations —
    /// returns `None` for L0–L2 (no audit requirement at those tiers).
    pub fn new(
        tier: ClearanceTier,
        operation: CryptoOperation,
        key_id: [u8; 32],
        subnet_id: Option<[u8; 32]>,
        slot: u64,
        actor: [u8; 32],
    ) -> Option<Self> {
        if tier < ClearanceTier::Enterprise {
            return None; // L0–L2: no mandatory audit logging
        }
        Some(Self { tier, operation, key_id, subnet_id, slot, actor })
    }

    /// Returns true if this entry represents a key establishment or rotation event.
    /// These are higher-priority audit events for compliance reporting.
    pub fn is_key_event(&self) -> bool {
        matches!(
            self.operation,
            CryptoOperation::EcdhKeyEstablish
                | CryptoOperation::SessionKeyRotation
                | CryptoOperation::NodeChannelRekey
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_key_id() -> [u8; 32] { [0x01u8; 32] }
    fn dummy_actor() -> [u8; 32] { [0x02u8; 32] }

    #[test]
    fn l0_l2_operations_produce_no_entry() {
        for tier in [ClearanceTier::Public, ClearanceTier::VerifiedHuman, ClearanceTier::Kyc] {
            let entry = EncryptionAuditEntry::new(
                tier,
                CryptoOperation::AesGcmEncrypt,
                dummy_key_id(),
                None,
                100,
                dummy_actor(),
            );
            assert!(entry.is_none(), "tier {:?} should not produce an audit entry", tier);
        }
    }

    #[test]
    fn l3_and_above_produce_entries() {
        for tier in [
            ClearanceTier::Enterprise,
            ClearanceTier::Government,
            ClearanceTier::Military,
        ] {
            let entry = EncryptionAuditEntry::new(
                tier,
                CryptoOperation::AesGcmEncrypt,
                dummy_key_id(),
                None,
                100,
                dummy_actor(),
            );
            assert!(entry.is_some(), "tier {:?} should produce an audit entry", tier);
        }
    }

    #[test]
    fn key_event_classification() {
        let make = |op| EncryptionAuditEntry {
            tier: ClearanceTier::Enterprise,
            operation: op,
            key_id: dummy_key_id(),
            subnet_id: None,
            slot: 1,
            actor: dummy_actor(),
        };
        assert!(make(CryptoOperation::EcdhKeyEstablish).is_key_event());
        assert!(make(CryptoOperation::SessionKeyRotation).is_key_event());
        assert!(make(CryptoOperation::NodeChannelRekey).is_key_event());
        assert!(!make(CryptoOperation::AesGcmEncrypt).is_key_event());
        assert!(!make(CryptoOperation::EciesDecrypt).is_key_event());
    }

    #[test]
    fn audit_entry_captures_subnet_id() {
        let subnet = [0xAAu8; 32];
        let entry = EncryptionAuditEntry::new(
            ClearanceTier::Enterprise,
            CryptoOperation::AesGcmDecrypt,
            dummy_key_id(),
            Some(subnet),
            200,
            dummy_actor(),
        )
        .unwrap();
        assert_eq!(entry.subnet_id, Some(subnet));
        assert_eq!(entry.slot, 200);
    }
}
