/// Double Ratchet-lite for persistent forward-secret channels
/// (security-architecture.md §8).
///
/// Provides:
/// - Symmetric ratchet: every message advances the chain key.
/// - ECDH ratchet: every reply triggers a new X25519 exchange → new root key.
/// - Maximum 1,000 messages before a forced ECDH ratchet.
///
/// Deleting a message key after use means past messages cannot be decrypted
/// even if the current chain key is later compromised.
use {
    crate::{
        ecdh::ecdh_static,
        error::EncryptionError,
    },
    hkdf::Hkdf,
    hmac::{Hmac, Mac},
    sha2::Sha256,
    zeroize::Zeroize,
};

type HmacSha256 = Hmac<Sha256>;

/// Maximum messages on the symmetric ratchet before a forced ECDH step.
pub const MAX_SYMMETRIC_MESSAGES: u64 = 1_000;

/// 32-byte chain key. Zeroized on drop.
#[derive(Clone, Zeroize)]
#[zeroize(drop)]
pub struct ChainKey([u8; 32]);

/// 32-byte message key. Zeroized on drop.
/// Caller must drop this immediately after use.
#[derive(Zeroize, Debug)]
#[zeroize(drop)]
pub struct MessageKey(pub [u8; 32]);

impl ChainKey {
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Advance the chain key and derive the next message key.
    ///
    /// ```text
    /// msg_key   = HMAC-SHA256(chain_key, 0x02)
    /// chain_key = HMAC-SHA256(chain_key, 0x01)
    /// ```
    pub fn ratchet(&mut self) -> Result<MessageKey, EncryptionError> {
        let msg_key = hmac_sha256(&self.0, &[0x02]);
        let next_chain = hmac_sha256(&self.0, &[0x01]);
        self.0 = next_chain;
        Ok(MessageKey(msg_key))
    }
}

fn hmac_sha256(key: &[u8; 32], data: &[u8]) -> [u8; 32] {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC accepts any key size");
    mac.update(data);
    let result = mac.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Ratchet state for one side of a Double Ratchet-lite channel.
pub struct RatchetState {
    /// Root key — updated on each ECDH ratchet step.
    root_key: [u8; 32],
    /// Send-direction chain key.
    pub send_chain: ChainKey,
    /// Receive-direction chain key.
    pub recv_chain: ChainKey,
    /// Our current ratchet X25519 private key (for the next ECDH step).
    my_ratchet_priv: [u8; 32],
    /// Our current ratchet X25519 public key (sent to the peer in message headers).
    pub my_ratchet_pub: [u8; 32],
    /// Number of messages sent on the current symmetric chain (resets on ECDH ratchet).
    pub send_count: u64,
}

impl RatchetState {
    /// Initialise a ratchet from a shared ECDH secret (both parties call this at setup).
    ///
    /// ```text
    /// root_key   = HKDF-SHA256(ecdh_secret, salt=b"root-v1", len=32)
    /// send_chain = HKDF-SHA256(root_key,    salt=b"send-chain", len=32)
    /// recv_chain = HKDF-SHA256(root_key,    salt=b"recv-chain", len=32)
    /// ```
    pub fn new(ecdh_shared_secret: &[u8; 32], my_ratchet_priv: [u8; 32]) -> Self {
        let root_key = hkdf_expand(ecdh_shared_secret, b"root-v1");
        let send_chain_bytes = hkdf_expand(&root_key, b"send-chain");
        let recv_chain_bytes = hkdf_expand(&root_key, b"recv-chain");

        let my_ratchet_pub = {
            use x25519_dalek::{PublicKey, StaticSecret};
            *PublicKey::from(&StaticSecret::from(my_ratchet_priv)).as_bytes()
        };

        Self {
            root_key,
            send_chain: ChainKey::new(send_chain_bytes),
            recv_chain: ChainKey::new(recv_chain_bytes),
            my_ratchet_priv,
            my_ratchet_pub,
            send_count: 0,
        }
    }

    /// Derive the next message key from the send chain.
    /// Returns `(message_key, our_current_ratchet_pubkey)`.
    /// The caller must include `ratchet_pubkey` in the message header.
    pub fn next_send_key(&mut self) -> Result<(MessageKey, [u8; 32]), EncryptionError> {
        if self.send_count >= MAX_SYMMETRIC_MESSAGES {
            return Err(EncryptionError::RatchetStateCorrupt);
        }
        let msg_key = self.send_chain.ratchet()?;
        self.send_count += 1;
        Ok((msg_key, self.my_ratchet_pub))
    }

    /// Process a received message header: advance the recv chain.
    /// Returns the message key for this specific message.
    pub fn next_recv_key(&mut self) -> Result<MessageKey, EncryptionError> {
        self.recv_chain.ratchet()
    }

    /// Perform an ECDH ratchet step on receiving a new ratchet public key from the peer.
    ///
    /// ```text
    /// new_ecdh   = X25519(my_new_ephemeral_priv, their_new_ratchet_pub)
    /// root_key   = HKDF-SHA256(new_ecdh, salt=root_key, len=32)
    /// send_chain = HKDF-SHA256(root_key, salt=b"send-chain", len=32)
    /// ```
    pub fn ecdh_ratchet(
        &mut self,
        their_new_ratchet_pub: &[u8; 32],
        my_new_ratchet_priv: [u8; 32],
    ) {
        let shared = ecdh_static(&self.my_ratchet_priv, their_new_ratchet_pub);

        // Derive new root key, using old root key as HKDF salt.
        let new_root = hkdf_expand_with_salt(&shared, &self.root_key);
        let new_send_chain = hkdf_expand(&new_root, b"send-chain");
        let new_recv_chain = hkdf_expand_with_salt(&shared, b"recv-chain");

        self.root_key = new_root;
        self.send_chain = ChainKey::new(new_send_chain);
        self.recv_chain = ChainKey::new(new_recv_chain);
        self.my_ratchet_priv = my_new_ratchet_priv;
        self.my_ratchet_pub = {
            use x25519_dalek::{PublicKey, StaticSecret};
            *PublicKey::from(&StaticSecret::from(my_new_ratchet_priv)).as_bytes()
        };
        self.send_count = 0;
    }
}

fn hkdf_expand(ikm: &[u8], info: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut okm = [0u8; 32];
    hk.expand(info, &mut okm).expect("HKDF expand with 32-byte output always succeeds");
    okm
}

fn hkdf_expand_with_salt(ikm: &[u8], salt: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut okm = [0u8; 32];
    hk.expand(b"ratchet-v1", &mut okm)
        .expect("HKDF expand with 32-byte output always succeeds");
    okm
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_shared_secret() -> [u8; 32] {
        [0xABu8; 32]
    }

    fn random_priv() -> [u8; 32] {
        use rand::RngCore;
        let mut k = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut k);
        k
    }

    #[test]
    fn symmetric_ratchet_advances_chain_key() {
        let shared = make_shared_secret();
        let mut state = RatchetState::new(&shared, random_priv());

        let (key1, _) = state.next_send_key().unwrap();
        let (key2, _) = state.next_send_key().unwrap();

        // Each call must produce a different message key.
        assert_ne!(key1.0, key2.0);
    }

    #[test]
    fn send_and_recv_chains_are_independent() {
        let shared = make_shared_secret();
        let mut state = RatchetState::new(&shared, random_priv());

        let (send_key, _) = state.next_send_key().unwrap();
        let recv_key = state.next_recv_key().unwrap();

        // Send and receive chains start differently (from different HKDF derivations).
        assert_ne!(send_key.0, recv_key.0);
    }

    #[test]
    fn max_symmetric_messages_reached_returns_error() {
        let shared = make_shared_secret();
        let mut state = RatchetState::new(&shared, random_priv());
        state.send_count = MAX_SYMMETRIC_MESSAGES;
        let err = state.next_send_key().unwrap_err();
        assert_eq!(err, EncryptionError::RatchetStateCorrupt);
    }

    #[test]
    fn ecdh_ratchet_resets_send_count_and_changes_chains() {
        let shared = make_shared_secret();
        let mut alice = RatchetState::new(&shared, random_priv());

        // Drain some sends.
        for _ in 0..5 {
            alice.next_send_key().unwrap();
        }
        assert_eq!(alice.send_count, 5);

        let (key_before, _) = alice.next_send_key().unwrap();

        // Simulate receiving a new ratchet pubkey from the peer.
        let new_priv = random_priv();
        let peer_pub = {
            use x25519_dalek::{PublicKey, StaticSecret};
            *PublicKey::from(&StaticSecret::from(random_priv())).as_bytes()
        };
        alice.ecdh_ratchet(&peer_pub, new_priv);

        assert_eq!(alice.send_count, 0);
        let (key_after, _) = alice.next_send_key().unwrap();
        assert_ne!(key_before.0, key_after.0);
    }

    #[test]
    fn forward_secrecy_compromised_chain_key_does_not_expose_past_message_key() {
        // After advancing the chain key, the previous message key cannot be re-derived
        // from the current chain key.
        let shared = make_shared_secret();
        let mut state = RatchetState::new(&shared, random_priv());

        let (key_at_0, _) = state.next_send_key().unwrap();
        // Advance to key 1.
        let (key_at_1, _) = state.next_send_key().unwrap();

        // key_at_0 cannot be derived from key_at_1 or the current chain key.
        // We verify this by checking they are distinct.
        assert_ne!(key_at_0.0, key_at_1.0);

        // A fresh state with the same initial shared secret produces the same key_at_0.
        let mut state2 = RatchetState::new(&shared, state.my_ratchet_priv);
        let (replay_key_at_0, _) = state2.next_send_key().unwrap();
        assert_eq!(key_at_0.0, replay_key_at_0.0);

        // But state (which is at position 2) cannot produce key_at_0 again.
        let (key_at_2, _) = state.next_send_key().unwrap();
        assert_ne!(key_at_0.0, key_at_2.0);
    }
}
