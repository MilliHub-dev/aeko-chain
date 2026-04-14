use borsh::{BorshDeserialize, BorshSerialize};

/// What a key is used for. Stored in `KeyRecord` (revocation-registry).
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum KeyType {
    /// Short-lived session key derived from ECDH.
    SessionKey,
    /// Key used as a successor during rotation ceremonies.
    RotationKey,
    /// Validator node identity key.
    NodeKey,
    /// Hardware-bound key (YubiKey, Ledger, Trezor).
    HardwareKey,
}

/// Signing / key-agreement algorithm.
///
/// Stored as a field so key schemas are algorithm-agnostic and PQ migration
/// (Dilithium3 / Falcon512) requires no breaking schema change.
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum KeyAlgorithm {
    /// Standard validator signing key. Default for L0–L4.
    Ed25519,
    /// X25519 key used for ECDH only, never for signing.
    X25519,
    /// Hardware wallet compatibility (Ledger, Trezor).
    Secp256k1,
    /// NIST PQC — target for L5 zones (Phase 3 stretch goal).
    Dilithium3,
    /// NIST PQC — alternative for L5 zones (Phase 3 stretch goal).
    Falcon512,
}

/// Lifecycle state of a key. All terminal states (`Rotated`, `Revoked`, `Compromised`)
/// are one-way — no further transitions are permitted.
///
/// Valid transitions (security-architecture.md §9):
/// ```text
/// Active → PendingRotation  (InitiateRotation by key owner)
/// PendingRotation → Rotated  (quorum approval via ApproveRotation)
/// Active → Revoked           (authority revocation)
/// Active → Compromised       (emergency-multisig, bypasses quorum)
/// ```
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum KeyState {
    /// Key is valid and usable.
    Active,
    /// Rotation has been initiated; awaiting quorum approval.
    PendingRotation,
    /// Key was successfully rotated. `successor_key_id` points to the new key.
    Rotated,
    /// Key was normally revoked by its authority.
    Revoked,
    /// Key was emergency-revoked due to compromise. Bypasses normal quorum.
    Compromised,
}

impl KeyState {
    /// Returns true if this state is terminal (no further transitions allowed).
    pub fn is_terminal(self) -> bool {
        matches!(self, KeyState::Rotated | KeyState::Revoked | KeyState::Compromised)
    }

    /// Returns true if a key in this state should be treated as invalid for
    /// authentication and encryption purposes.
    pub fn is_invalid(self) -> bool {
        !matches!(self, KeyState::Active)
    }
}
