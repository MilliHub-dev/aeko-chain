/// ECIES hybrid encryption envelope (security-architecture.md §7).
///
/// Used for: private DMs (L1+), "Friends Only" posts (L1+), L2–L3 credential payloads.
///
/// Envelope format:
/// ```text
/// version:          u8        — always 0x01
/// ephemeral_pubkey: [u8; 32]  — X25519 ephemeral public key
/// nonce:            [u8; 12]  — AES-256-GCM nonce (random per message)
/// ciphertext+tag:   Vec<u8>   — AES-GCM output (includes 16-byte tag)
/// ```
use {
    crate::{
        aes_gcm as aes,
        ecdh::{ecdh_ephemeral, ecdh_static},
        error::EncryptionError,
    },
    hkdf::Hkdf,
    rand::RngCore,
    sha2::Sha256,
};

pub const ECIES_VERSION: u8 = 0x01;
const ECIES_HKDF_INFO: &[u8] = b"ecies-v1";

/// A serialisable ECIES envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EciesEnvelope {
    pub version: u8,
    /// Sender's ephemeral X25519 public key (32 bytes).
    pub ephemeral_pubkey: [u8; 32],
    /// AES-256-GCM nonce (12 bytes, randomly generated per message).
    pub nonce: [u8; 12],
    /// AES-256-GCM ciphertext including the 16-byte authentication tag.
    pub ciphertext_with_tag: Vec<u8>,
}

impl EciesEnvelope {
    /// Fixed overhead in bytes (excluding `ciphertext_with_tag` length).
    /// 1 (version) + 32 (pubkey) + 12 (nonce) = 45 bytes.
    pub const FIXED_OVERHEAD: usize = 1 + 32 + 12;

    /// Serialise the envelope to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out =
            Vec::with_capacity(Self::FIXED_OVERHEAD + self.ciphertext_with_tag.len());
        out.push(self.version);
        out.extend_from_slice(&self.ephemeral_pubkey);
        out.extend_from_slice(&self.nonce);
        out.extend_from_slice(&self.ciphertext_with_tag);
        out
    }

    /// Deserialise from bytes.
    pub fn from_bytes(data: &[u8]) -> Result<Self, EncryptionError> {
        if data.len() < Self::FIXED_OVERHEAD + aes::TAG_LEN {
            return Err(EncryptionError::InvalidLength);
        }
        let version = data[0];
        if version != ECIES_VERSION {
            return Err(EncryptionError::UnknownVersion);
        }
        let mut ephemeral_pubkey = [0u8; 32];
        ephemeral_pubkey.copy_from_slice(&data[1..33]);
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&data[33..45]);
        let ciphertext_with_tag = data[45..].to_vec();
        Ok(Self { version, ephemeral_pubkey, nonce, ciphertext_with_tag })
    }
}

/// Derive the AES session key for ECIES from a raw shared secret.
///
/// ```text
/// aes_key = HKDF-SHA256(ikm=shared_secret, salt=b"ecies-v1", info=recipient_pubkey, len=32)
/// ```
fn ecies_derive_key(
    shared_secret: &[u8; 32],
    recipient_pubkey: &[u8; 32],
) -> Result<[u8; 32], EncryptionError> {
    let hk = Hkdf::<Sha256>::new(Some(ECIES_HKDF_INFO), shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(recipient_pubkey, &mut okm)
        .map_err(|_| EncryptionError::HkdfExpandFailed)?;
    Ok(okm)
}

/// Encrypt `plaintext` for `recipient_pubkey` using ECIES.
///
/// Steps:
/// 1. Generate ephemeral X25519 keypair
/// 2. ECDH with recipient's public key → shared secret
/// 3. HKDF-SHA256(shared_secret, salt=b"ecies-v1", info=recipient_pubkey) → aes_key
/// 4. AES-256-GCM encrypt with random nonce
pub fn encrypt(
    recipient_pubkey: &[u8; 32],
    plaintext: &[u8],
) -> Result<EciesEnvelope, EncryptionError> {
    let (ephemeral_pubkey, shared_secret) = ecdh_ephemeral(recipient_pubkey);
    let aes_key = ecies_derive_key(&shared_secret, recipient_pubkey)?;

    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    // AAD is the ephemeral public key — binds the ciphertext to this specific envelope.
    let ciphertext_with_tag = aes::encrypt(&aes_key, &nonce, plaintext, &ephemeral_pubkey)?;

    Ok(EciesEnvelope {
        version: ECIES_VERSION,
        ephemeral_pubkey,
        nonce,
        ciphertext_with_tag,
    })
}

/// Decrypt an ECIES envelope using `recipient_privkey`.
///
/// Steps:
/// 1. ECDH(recipient_privkey, envelope.ephemeral_pubkey) → shared secret
/// 2. Same HKDF derivation → aes_key
/// 3. AES-256-GCM decrypt
pub fn decrypt(
    recipient_privkey: &[u8; 32],
    envelope: &EciesEnvelope,
) -> Result<Vec<u8>, EncryptionError> {
    if envelope.version != ECIES_VERSION {
        return Err(EncryptionError::UnknownVersion);
    }

    let shared_secret = ecdh_static(recipient_privkey, &envelope.ephemeral_pubkey);

    // Derive the recipient public key from the private key so we can reproduce the HKDF info.
    let recipient_pubkey = {
        use x25519_dalek::{PublicKey, StaticSecret};
        *PublicKey::from(&StaticSecret::from(*recipient_privkey)).as_bytes()
    };

    let aes_key = ecies_derive_key(&shared_secret, &recipient_pubkey)?;

    // AAD must match what was used during encryption.
    aes::decrypt(&aes_key, &envelope.nonce, &envelope.ciphertext_with_tag, &envelope.ephemeral_pubkey)
}

#[cfg(test)]
mod tests {
    use super::*;
    use x25519_dalek::{PublicKey, StaticSecret};

    fn random_key() -> [u8; 32] {
        use rand::RngCore;
        let mut k = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut k);
        k
    }

    #[test]
    fn ecies_round_trip() {
        let recipient_priv = random_key();
        let recipient_pub =
            *PublicKey::from(&StaticSecret::from(recipient_priv)).as_bytes();

        let plaintext = b"private DM: gm fren";
        let envelope = encrypt(&recipient_pub, plaintext).unwrap();
        let recovered = decrypt(&recipient_priv, &envelope).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn ecies_different_recipient_cannot_decrypt() {
        let recipient_priv = random_key();
        let recipient_pub =
            *PublicKey::from(&StaticSecret::from(recipient_priv)).as_bytes();

        let attacker_priv = random_key();

        let envelope = encrypt(&recipient_pub, b"secret post").unwrap();
        let err = decrypt(&attacker_priv, &envelope).unwrap_err();
        assert_eq!(err, EncryptionError::DecryptionFailed);
    }

    #[test]
    fn ecies_tampered_ciphertext_fails() {
        let recipient_priv = random_key();
        let recipient_pub =
            *PublicKey::from(&StaticSecret::from(recipient_priv)).as_bytes();

        let mut envelope = encrypt(&recipient_pub, b"hello").unwrap();
        envelope.ciphertext_with_tag[0] ^= 0xFF;
        let err = decrypt(&recipient_priv, &envelope).unwrap_err();
        assert_eq!(err, EncryptionError::DecryptionFailed);
    }

    #[test]
    fn ecies_envelope_serialise_round_trip() {
        let recipient_priv = random_key();
        let recipient_pub =
            *PublicKey::from(&StaticSecret::from(recipient_priv)).as_bytes();

        let envelope = encrypt(&recipient_pub, b"serialise me").unwrap();
        let bytes = envelope.to_bytes();
        let decoded = EciesEnvelope::from_bytes(&bytes).unwrap();
        assert_eq!(envelope, decoded);
    }

    #[test]
    fn ecies_different_messages_produce_different_envelopes() {
        let recipient_priv = random_key();
        let recipient_pub =
            *PublicKey::from(&StaticSecret::from(recipient_priv)).as_bytes();

        let e1 = encrypt(&recipient_pub, b"message A").unwrap();
        let e2 = encrypt(&recipient_pub, b"message A").unwrap();
        // Random nonce means envelopes are different even for same plaintext.
        assert_ne!(e1.nonce, e2.nonce);
    }
}
