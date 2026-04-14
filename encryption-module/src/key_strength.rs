use crate::error::EncryptionError;

/// Minimum acceptable key length in bytes (256 bits).
pub const MIN_KEY_BYTES: usize = 32;

/// Minimum acceptable nonce length in bytes (96 bits).
pub const MIN_NONCE_BYTES: usize = 12;

/// Enforce that key material meets the minimum strength requirements
/// (security-architecture.md §6.3).
///
/// Rejects keys shorter than 256 bits and nonces shorter than 96 bits at the
/// program boundary. Called before any encrypt/decrypt operation at L3+.
pub fn check_key_strength(
    key_bytes: &[u8],
    nonce_bytes: &[u8],
) -> Result<(), EncryptionError> {
    if key_bytes.len() < MIN_KEY_BYTES {
        return Err(EncryptionError::KeyTooWeak);
    }
    if nonce_bytes.len() < MIN_NONCE_BYTES {
        return Err(EncryptionError::NonceTooShort);
    }
    Ok(())
}

/// Reject sub-256-bit key material regardless of nonce.
pub fn check_key_only(key_bytes: &[u8]) -> Result<(), EncryptionError> {
    if key_bytes.len() < MIN_KEY_BYTES {
        return Err(EncryptionError::KeyTooWeak);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_256_bit_key_and_96_bit_nonce() {
        assert!(check_key_strength(&[0u8; 32], &[0u8; 12]).is_ok());
    }

    #[test]
    fn rejects_128_bit_key() {
        let err = check_key_strength(&[0u8; 16], &[0u8; 12]).unwrap_err();
        assert_eq!(err, EncryptionError::KeyTooWeak);
    }

    #[test]
    fn rejects_192_bit_key() {
        let err = check_key_strength(&[0u8; 24], &[0u8; 12]).unwrap_err();
        assert_eq!(err, EncryptionError::KeyTooWeak);
    }

    #[test]
    fn rejects_short_nonce() {
        let err = check_key_strength(&[0u8; 32], &[0u8; 8]).unwrap_err();
        assert_eq!(err, EncryptionError::NonceTooShort);
    }

    #[test]
    fn accepts_longer_than_minimum() {
        // 512-bit key and 192-bit nonce are fine.
        assert!(check_key_strength(&[0u8; 64], &[0u8; 24]).is_ok());
    }
}
