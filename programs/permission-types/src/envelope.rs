use borsh::{BorshDeserialize, BorshSerialize};

/// Encrypted transaction payload envelope (security-architecture.md §4).
///
/// Wraps the instruction data field for transactions targeting L3+ subnets.
///
/// Fixed overhead: 1 + 1 + 32 + 12 + 16 + 64 = 126 bytes, plus `ciphertext` length.
///
/// Layout:
/// ```text
/// version:    u8          — always 0x01
/// tier:       u8          — clearance tier this payload is encrypted for
/// key_id:     [u8; 32]    — identifies the session key (SHA-256 derived, see §4.2)
/// nonce:      [u8; 12]    — AES-256-GCM nonce
/// ciphertext: Vec<u8>     — AES-256-GCM ciphertext
/// tag:        [u8; 16]    — AES-256-GCM authentication tag
/// aad:        [u8; 64]    — additional authenticated data:
///                             [0..32]  = transaction signature
///                             [32..64] = subnet_id
/// ```
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct EncryptedPayloadEnvelope {
    /// Envelope version. Must be 0x01.
    pub version: u8,
    /// Clearance tier this payload is encrypted for (as u8, matches `ClearanceTier` repr).
    pub tier: u8,
    /// Key ID identifying the session key. Derived as:
    /// `SHA-256(key_type_byte || owner_pubkey || created_at_slot_le_bytes)`
    pub key_id: [u8; 32],
    /// AES-256-GCM nonce (96 bits / 12 bytes).
    pub nonce: [u8; 12],
    /// AES-256-GCM ciphertext (plaintext instruction data, encrypted).
    pub ciphertext: Vec<u8>,
    /// AES-256-GCM authentication tag (128 bits / 16 bytes).
    pub tag: [u8; 16],
    /// Additional authenticated data:
    ///   bytes [0..32]  = transaction signature
    ///   bytes [32..64] = subnet_id
    pub aad: [u8; 64],
}

impl EncryptedPayloadEnvelope {
    pub const VERSION: u8 = 0x01;
    pub const FIXED_OVERHEAD: usize = 1 + 1 + 32 + 12 + 16 + 64; // 126 bytes

    /// Returns the transaction signature embedded in the AAD.
    pub fn tx_signature(&self) -> &[u8; 32] {
        self.aad[..32].try_into().expect("aad is 64 bytes")
    }

    /// Returns the subnet ID embedded in the AAD.
    pub fn subnet_id(&self) -> &[u8; 32] {
        self.aad[32..].try_into().expect("aad is 64 bytes")
    }

    /// Returns true if the envelope version is recognised.
    pub fn is_valid_version(&self) -> bool {
        self.version == Self::VERSION
    }
}
