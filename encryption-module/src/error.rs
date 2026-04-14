use std::fmt;

/// All errors that can be returned by the AEKO Encryption Module.
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum EncryptionError {
    /// AES-256-GCM authentication tag check failed — ciphertext was tampered.
    DecryptionFailed,
    /// The nonce counter wrapped to zero. Rekeying is required before any
    /// further messages can be sent on this session.
    NonceCounterOverflow,
    /// Key material is shorter than 256 bits. Rejected by `KeyStrengthCheck`.
    KeyTooWeak,
    /// Nonce is shorter than 96 bits.
    NonceTooShort,
    /// Unsupported cipher algorithm (e.g., AES-128, RC4, DES).
    UnsupportedAlgorithm,
    /// Provided data is the wrong length for the expected format.
    InvalidLength,
    /// ECIES envelope version is not recognised.
    UnknownVersion,
    /// HKDF expand produced zero bytes — internal error.
    HkdfExpandFailed,
    /// Ratchet state is inconsistent — likely a programming error.
    RatchetStateCorrupt,
}

impl fmt::Display for EncryptionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DecryptionFailed => write!(f, "AES-GCM decryption failed: bad tag"),
            Self::NonceCounterOverflow => write!(f, "nonce counter overflow: rekey required"),
            Self::KeyTooWeak => write!(f, "key material shorter than 256 bits"),
            Self::NonceTooShort => write!(f, "nonce shorter than 96 bits"),
            Self::UnsupportedAlgorithm => write!(f, "unsupported cipher algorithm"),
            Self::InvalidLength => write!(f, "invalid data length for expected format"),
            Self::UnknownVersion => write!(f, "unknown envelope version"),
            Self::HkdfExpandFailed => write!(f, "HKDF expand produced no output"),
            Self::RatchetStateCorrupt => write!(f, "ratchet state is corrupt"),
        }
    }
}

impl std::error::Error for EncryptionError {}
