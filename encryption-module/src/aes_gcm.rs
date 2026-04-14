/// AES-256-GCM authenticated encryption.
///
/// Implements security-architecture.md §6.2 nonce strategy:
/// - First message: randomly generated nonce stored in the envelope.
/// - Subsequent messages in a session: counter mode —
///   `nonce = initial_nonce XOR counter_le_bytes_padded`
/// - Counter wrap to zero is a fatal error: rekey required.
use {
    crate::{error::EncryptionError, key_strength::check_key_strength},
    aes_gcm::{
        aead::{Aead, KeyInit, Payload},
        Aes256Gcm, Key, Nonce,
    },
};

pub const NONCE_LEN: usize = 12;
pub const TAG_LEN: usize = 16;
pub const KEY_LEN: usize = 32;

/// Encrypt `plaintext` with AES-256-GCM.
///
/// `aad` is authenticated but not encrypted (must match on decryption).
/// Returns `ciphertext || tag` as a single `Vec<u8>`.
pub fn encrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, EncryptionError> {
    check_key_strength(key, nonce)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce);
    cipher
        .encrypt(nonce, Payload { msg: plaintext, aad })
        .map_err(|_| EncryptionError::DecryptionFailed)
}

/// Decrypt `ciphertext_with_tag` (the output of `encrypt`) with AES-256-GCM.
///
/// Returns the plaintext if the tag verifies, otherwise `EncryptionError::DecryptionFailed`.
pub fn decrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    ciphertext_with_tag: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, EncryptionError> {
    check_key_strength(key, nonce)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce);
    cipher
        .decrypt(nonce, Payload { msg: ciphertext_with_tag, aad })
        .map_err(|_| EncryptionError::DecryptionFailed)
}

/// Advance the nonce counter by XOR-ing the initial nonce with a little-endian u64.
///
/// The counter is embedded in the first 8 bytes of the nonce (little-endian).
/// Panics are prevented by returning `NonceCounterOverflow` if `counter == 0`
/// and `initial_nonce` is all-zero (which would reuse the first nonce).
pub fn advance_nonce(
    initial_nonce: &[u8; NONCE_LEN],
    counter: u64,
) -> Result<[u8; NONCE_LEN], EncryptionError> {
    if counter == 0 {
        return Err(EncryptionError::NonceCounterOverflow);
    }
    let mut nonce = *initial_nonce;
    let counter_bytes = counter.to_le_bytes();
    // XOR the first 8 bytes of the nonce with the counter.
    for (n, c) in nonce[..8].iter_mut().zip(counter_bytes.iter()) {
        *n ^= c;
    }
    Ok(nonce)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [0x42u8; 32];
    const NONCE: [u8; 12] = [0x01u8; 12];

    #[test]
    fn encrypt_decrypt_round_trip() {
        let plaintext = b"hello aeko permission layer";
        let aad = b"subnet-id-goes-here";

        let ciphertext = encrypt(&KEY, &NONCE, plaintext, aad).unwrap();
        let recovered = decrypt(&KEY, &NONCE, &ciphertext, aad).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn wrong_aad_fails_decryption() {
        let ciphertext = encrypt(&KEY, &NONCE, b"secret", b"aad-a").unwrap();
        let err = decrypt(&KEY, &NONCE, &ciphertext, b"aad-b").unwrap_err();
        assert_eq!(err, EncryptionError::DecryptionFailed);
    }

    #[test]
    fn tampered_ciphertext_fails_decryption() {
        let mut ciphertext = encrypt(&KEY, &NONCE, b"secret", b"aad").unwrap();
        ciphertext[0] ^= 0xFF; // flip a bit
        let err = decrypt(&KEY, &NONCE, &ciphertext, b"aad").unwrap_err();
        assert_eq!(err, EncryptionError::DecryptionFailed);
    }

    #[test]
    fn rejects_weak_key() {
        let weak_key = [0u8; 16]; // 128-bit
        let err = encrypt(&{
            let mut k = [0u8; 32];
            k[..16].copy_from_slice(&weak_key);
            // Actually pass a valid-length key to the check — test the check_key_strength call
            // directly for weak keys via the key_strength module.
            k
        }, &NONCE, b"x", b"").unwrap(); // this passes (32 bytes)
        // Test weak key via key_strength directly:
        let result = crate::key_strength::check_key_strength(&[0u8; 16], &NONCE);
        assert_eq!(result.unwrap_err(), EncryptionError::KeyTooWeak);
        let _ = err; // silence unused warning
    }

    #[test]
    fn advance_nonce_counter_zero_is_error() {
        let err = advance_nonce(&NONCE, 0).unwrap_err();
        assert_eq!(err, EncryptionError::NonceCounterOverflow);
    }

    #[test]
    fn advance_nonce_produces_distinct_values() {
        let n1 = advance_nonce(&NONCE, 1).unwrap();
        let n2 = advance_nonce(&NONCE, 2).unwrap();
        assert_ne!(n1, n2);
        assert_ne!(n1, NONCE);
    }

    #[test]
    fn counter_mode_encrypt_decrypt() {
        let plaintext = b"counter mode message";
        let aad = b"context";

        let nonce1 = advance_nonce(&NONCE, 1).unwrap();
        let ciphertext = encrypt(&KEY, &nonce1, plaintext, aad).unwrap();
        let recovered = decrypt(&KEY, &nonce1, &ciphertext, aad).unwrap();
        assert_eq!(recovered, plaintext);
    }
}
