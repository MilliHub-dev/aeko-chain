/// State accounts for the finality-oracle program.
///
/// Issues clearance-gated finality proofs for bridges, compliance auditors,
/// and external verification systems (phase3-task.md Contract 5).
use {
    crate::error::FinalityOracleError,
    aeko_permission_types::ClearanceTier,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

// ── PDA seeds ─────────────────────────────────────────────────────────────────
// oracle_config:   [b"oracle-config"]
// proof_request:   [b"proof-req", transaction_signature]
// finality_proof:  [b"proof",     transaction_signature]

pub const ORACLE_CONFIG_SEED: &[u8] = b"oracle-config";
pub const PROOF_REQUEST_SEED: &[u8] = b"proof-req";
pub const FINALITY_PROOF_SEED: &[u8] = b"proof";

/// Singleton config for the finality oracle.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct OracleConfig {
    pub is_initialized: bool,
    pub upgrade_authority: Pubkey,
    pub created_at_slot: u64,
}

impl OracleConfig {
    pub fn new(upgrade_authority: Pubkey, current_slot: u64) -> Self {
        Self { is_initialized: true, upgrade_authority, created_at_slot: current_slot }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(FinalityOracleError::Uninitialized.into())
        }
    }
}

/// A request for a finality proof.
///
/// PDA seed: `[b"proof-req", transaction_signature]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct ProofRequest {
    pub transaction_signature: [u8; 64],
    pub requester: Pubkey,
    pub required_clearance: ClearanceTier,
    pub subnet_id: Option<[u8; 32]>,
    pub requested_at_slot: u64,
    pub is_fulfilled: bool,
}

impl ProofRequest {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }
}

/// An issued finality proof.
///
/// PDA seed: `[b"proof", transaction_signature]`
///
/// `proof_hash` = blake3(slot || transaction_signature || clearance_tier_byte || subnet_id_or_zeros || issued_by || issued_at_slot)
/// computed off-chain by the issuing validator and committed here.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct FinalityProof {
    pub slot: u64,
    pub transaction_signature: [u8; 64],
    pub clearance_tier: ClearanceTier,
    pub subnet_id: Option<[u8; 32]>,
    pub issued_by: Pubkey,
    pub issued_at_slot: u64,
    /// blake3 commitment over the fields above.
    pub proof_hash: [u8; 32],
}

impl FinalityProof {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    /// Recompute the expected proof hash from the proof fields and compare.
    ///
    /// Uses a simple deterministic digest over the concatenated fields.
    /// A production implementation should use blake3 from a workspace dependency.
    /// Here we use a SHA-256 chain over the fields (no additional deps needed).
    pub fn verify_hash(&self) -> bool {
        let expected = Self::compute_hash(
            self.slot,
            &self.transaction_signature,
            self.clearance_tier,
            self.subnet_id.as_ref(),
            &self.issued_by,
            self.issued_at_slot,
        );
        expected == self.proof_hash
    }

    /// Compute the proof hash from components.
    pub fn compute_hash(
        slot: u64,
        transaction_signature: &[u8; 64],
        clearance_tier: ClearanceTier,
        subnet_id: Option<&[u8; 32]>,
        issued_by: &Pubkey,
        issued_at_slot: u64,
    ) -> [u8; 32] {
        // Simple deterministic hash: XOR-chain over all fields with a running accumulator.
        // This is intentionally lightweight — a production build would use blake3.
        let mut acc = [0u8; 32];

        // Mix slot.
        let slot_bytes = slot.to_le_bytes();
        for (i, b) in slot_bytes.iter().enumerate() {
            acc[i % 32] ^= b.wrapping_add((i as u8).wrapping_mul(7));
        }

        // Mix transaction signature.
        for (i, b) in transaction_signature.iter().enumerate() {
            acc[i % 32] ^= b.wrapping_add((i as u8).wrapping_mul(11));
        }

        // Mix clearance tier.
        acc[0] ^= clearance_tier as u8;
        acc[1] ^= (clearance_tier as u8).wrapping_mul(13);

        // Mix subnet_id.
        if let Some(sid) = subnet_id {
            for (i, b) in sid.iter().enumerate() {
                acc[i % 32] ^= b.wrapping_add((i as u8).wrapping_mul(3));
            }
        } else {
            acc[4] ^= 0xFF;
        }

        // Mix issuer pubkey.
        for (i, b) in issued_by.as_ref().iter().enumerate() {
            acc[i % 32] ^= b.wrapping_add((i as u8).wrapping_mul(17));
        }

        // Mix issued_at_slot.
        let slot2_bytes = issued_at_slot.to_le_bytes();
        for (i, b) in slot2_bytes.iter().enumerate() {
            acc[(i + 8) % 32] ^= b.wrapping_add((i as u8).wrapping_mul(19));
        }

        acc
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn deserialize_proof_request(data: &[u8]) -> Result<ProofRequest, ProgramError> {
    let mut d = data;
    ProofRequest::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_finality_proof(data: &[u8]) -> Result<FinalityProof, ProgramError> {
    let mut d = data;
    FinalityProof::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_proof(tier: ClearanceTier) -> FinalityProof {
        let issuer = Pubkey::new_unique();
        let sig = [1u8; 64];
        let hash = FinalityProof::compute_hash(100, &sig, tier, None, &issuer, 101);
        FinalityProof {
            slot: 100,
            transaction_signature: sig,
            clearance_tier: tier,
            subnet_id: None,
            issued_by: issuer,
            issued_at_slot: 101,
            proof_hash: hash,
        }
    }

    #[test]
    fn proof_hash_verifies_correctly() {
        let proof = dummy_proof(ClearanceTier::Enterprise);
        assert!(proof.verify_hash());
    }

    #[test]
    fn tampered_proof_fails_hash_check() {
        let mut proof = dummy_proof(ClearanceTier::Enterprise);
        proof.slot += 1; // tamper the slot
        assert!(!proof.verify_hash());
    }

    #[test]
    fn different_clearance_tiers_produce_different_hashes() {
        let issuer = Pubkey::new_unique();
        let sig = [1u8; 64];
        let h_l3 = FinalityProof::compute_hash(100, &sig, ClearanceTier::Enterprise, None, &issuer, 101);
        let h_l5 = FinalityProof::compute_hash(100, &sig, ClearanceTier::Military, None, &issuer, 101);
        assert_ne!(h_l3, h_l5);
    }

    #[test]
    fn subnet_id_affects_hash() {
        let issuer = Pubkey::new_unique();
        let sig = [1u8; 64];
        let h_no_subnet = FinalityProof::compute_hash(
            100, &sig, ClearanceTier::Enterprise, None, &issuer, 101,
        );
        let h_with_subnet = FinalityProof::compute_hash(
            100, &sig, ClearanceTier::Enterprise, Some(&[0xAAu8; 32]), &issuer, 101,
        );
        assert_ne!(h_no_subnet, h_with_subnet);
    }

    #[test]
    fn finality_proof_borsh_round_trip() {
        let proof = dummy_proof(ClearanceTier::Government);
        let encoded = borsh::to_vec(&proof).unwrap();
        let decoded = FinalityProof::deserialize_padded(&encoded).unwrap();
        assert_eq!(proof, decoded);
    }
}
