/// X25519 ECDH key exchange and HKDF-SHA256 session key derivation.
///
/// Implements security-architecture.md §6.1 and §6.2.
use {
    crate::error::EncryptionError,
    hkdf::Hkdf,
    rand::RngCore,
    sha2::Sha256,
    x25519_dalek::{PublicKey, StaticSecret},
    zeroize::Zeroize,
};

pub const SESSION_KEY_LEN: usize = 32;
pub const HKDF_INFO: &[u8] = b"aeko-session-v1";

/// A 256-bit session key derived from ECDH + HKDF.
/// Implements `Zeroize` so the key is cleared on drop.
#[derive(Zeroize)]
#[zeroize(drop)]
pub struct SessionKey(pub [u8; SESSION_KEY_LEN]);

impl SessionKey {
    pub fn as_bytes(&self) -> &[u8; SESSION_KEY_LEN] {
        &self.0
    }
}

/// Derive a session key from an X25519 ECDH shared secret using HKDF-SHA256.
///
/// ```text
/// session_key = HKDF-SHA256(ikm=shared_secret, salt=key_id, info=b"aeko-session-v1", len=32)
/// ```
pub fn derive_session_key(
    shared_secret_bytes: &[u8; 32],
    key_id: &[u8; 32],
) -> Result<SessionKey, EncryptionError> {
    let hk = Hkdf::<Sha256>::new(Some(key_id.as_ref()), shared_secret_bytes);
    let mut okm = [0u8; SESSION_KEY_LEN];
    hk.expand(HKDF_INFO, &mut okm)
        .map_err(|_| EncryptionError::HkdfExpandFailed)?;
    Ok(SessionKey(okm))
}

/// Perform X25519 ECDH using a static (persistent) private key.
/// Returns the raw 32-byte shared secret.
///
/// Callers must immediately pass the result to `derive_session_key` —
/// raw shared secrets should never be used directly as cipher keys.
pub fn ecdh_static(
    my_privkey: &[u8; 32],
    their_pubkey: &[u8; 32],
) -> [u8; 32] {
    let secret = StaticSecret::from(*my_privkey);
    let their_public = PublicKey::from(*their_pubkey);
    let shared = secret.diffie_hellman(&their_public);
    *shared.as_bytes()
}

/// Generate an ephemeral X25519 keypair and perform ECDH.
/// Returns (ephemeral_public_key, raw_shared_secret).
///
/// The caller should treat the private key as consumed after this call —
/// the bytes are overwritten by zeroize in `StaticSecret`'s Drop impl.
pub fn ecdh_ephemeral(
    their_pubkey: &[u8; 32],
) -> ([u8; 32], [u8; 32]) {
    let mut random_bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut random_bytes);
    let ephemeral_secret = StaticSecret::from(random_bytes);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let their_public = PublicKey::from(*their_pubkey);
    let shared = ephemeral_secret.diffie_hellman(&their_public);
    (*ephemeral_public.as_bytes(), *shared.as_bytes())
}

/// Full ECDH + HKDF flow using a static private key.
/// Convenience wrapper for node-to-node key establishment.
pub fn establish_session_key(
    my_privkey: &[u8; 32],
    their_pubkey: &[u8; 32],
    key_id: &[u8; 32],
) -> Result<SessionKey, EncryptionError> {
    let shared = ecdh_static(my_privkey, their_pubkey);
    derive_session_key(&shared, key_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn random_key() -> [u8; 32] {
        use rand::RngCore;
        let mut k = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut k);
        k
    }

    #[test]
    fn ecdh_is_symmetric() {
        // Alice and Bob should derive the same shared secret.
        let alice_priv = random_key();
        let bob_priv = random_key();

        let alice_pub = *PublicKey::from(&StaticSecret::from(alice_priv)).as_bytes();
        let bob_pub = *PublicKey::from(&StaticSecret::from(bob_priv)).as_bytes();

        let alice_shared = ecdh_static(&alice_priv, &bob_pub);
        let bob_shared = ecdh_static(&bob_priv, &alice_pub);

        assert_eq!(alice_shared, bob_shared);
    }

    #[test]
    fn session_key_derivation_is_deterministic() {
        let shared = [0x42u8; 32];
        let key_id = [0x01u8; 32];
        let k1 = derive_session_key(&shared, &key_id).unwrap();
        let k2 = derive_session_key(&shared, &key_id).unwrap();
        assert_eq!(k1.0, k2.0);
    }

    #[test]
    fn different_key_ids_produce_different_session_keys() {
        let shared = [0x42u8; 32];
        let key_id_a = [0x01u8; 32];
        let key_id_b = [0x02u8; 32];
        let ka = derive_session_key(&shared, &key_id_a).unwrap();
        let kb = derive_session_key(&shared, &key_id_b).unwrap();
        assert_ne!(ka.0, kb.0);
    }

    #[test]
    fn establish_session_key_both_parties_agree() {
        let alice_priv = random_key();
        let bob_priv = random_key();
        let alice_pub = *PublicKey::from(&StaticSecret::from(alice_priv)).as_bytes();
        let bob_pub = *PublicKey::from(&StaticSecret::from(bob_priv)).as_bytes();
        let key_id = [0xABu8; 32];

        let alice_session = establish_session_key(&alice_priv, &bob_pub, &key_id).unwrap();
        let bob_session = establish_session_key(&bob_priv, &alice_pub, &key_id).unwrap();

        assert_eq!(alice_session.0, bob_session.0);
    }
}
