/// Encrypted node-to-node channel for L3+ subnet gossip
/// (security-architecture.md §6, Ticket 3.2 §3.2.6).
///
/// Wraps gossip messages in AES-256-GCM. Session keys are established once
/// via ECDH at connection setup and rekeyed every 10,000 messages or 1 epoch.
use {
    crate::{
        aes_gcm as aes,
        ecdh::establish_session_key,
        error::EncryptionError,
    },
};

/// Rekey threshold: rekey after this many messages.
pub const REKEY_MESSAGE_THRESHOLD: u64 = 10_000;

/// State for one direction of an encrypted node channel.
pub struct NodeChannel {
    /// Current AES-256-GCM session key.
    session_key: [u8; 32],
    /// Base nonce established at session setup.
    base_nonce: [u8; 12],
    /// Count of messages sent on this channel since the last rekey.
    pub message_count: u64,
    /// Whether a rekey is due (set when `message_count >= REKEY_MESSAGE_THRESHOLD`).
    pub rekey_pending: bool,
}

impl NodeChannel {
    /// Establish a new channel from an existing session key and a random base nonce.
    pub fn new(session_key: [u8; 32], base_nonce: [u8; 12]) -> Self {
        Self {
            session_key,
            base_nonce,
            message_count: 0,
            rekey_pending: false,
        }
    }

    /// Establish a channel via ECDH between two validator identity keys.
    pub fn establish(
        my_privkey: &[u8; 32],
        their_pubkey: &[u8; 32],
        key_id: &[u8; 32],
        base_nonce: [u8; 12],
    ) -> Result<Self, EncryptionError> {
        let session = establish_session_key(my_privkey, their_pubkey, key_id)?;
        Ok(Self::new(*session.as_bytes(), base_nonce))
    }

    /// Encrypt `plaintext` for transmission.
    /// `aad` should include the source + destination validator pubkeys and the slot number.
    pub fn encrypt_message(
        &mut self,
        plaintext: &[u8],
        aad: &[u8],
    ) -> Result<(Vec<u8>, [u8; 12]), EncryptionError> {
        let nonce = aes::advance_nonce(&self.base_nonce, self.message_count + 1)?;
        let ciphertext = aes::encrypt(&self.session_key, &nonce, plaintext, aad)?;
        self.message_count += 1;
        if self.message_count >= REKEY_MESSAGE_THRESHOLD {
            self.rekey_pending = true;
        }
        Ok((ciphertext, nonce))
    }

    /// Decrypt a received message.
    pub fn decrypt_message(
        &self,
        ciphertext_with_tag: &[u8],
        nonce: &[u8; 12],
        aad: &[u8],
    ) -> Result<Vec<u8>, EncryptionError> {
        aes::decrypt(&self.session_key, nonce, ciphertext_with_tag, aad)
    }

    /// Rekey the channel with a new session key.
    /// Called after `NodeKeyRotation` gossip message is received (§3.3.5),
    /// or when `rekey_pending` is true.
    pub fn rekey(
        &mut self,
        new_session_key: [u8; 32],
        new_base_nonce: [u8; 12],
    ) {
        self.session_key = new_session_key;
        self.base_nonce = new_base_nonce;
        self.message_count = 0;
        self.rekey_pending = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_channel() -> NodeChannel {
        NodeChannel::new([0x42u8; 32], [0x01u8; 12])
    }

    #[test]
    fn node_channel_encrypt_decrypt_round_trip() {
        let mut sender = make_channel();
        let receiver = make_channel(); // same key + base nonce

        let plaintext = b"gossip: ClusterInfo crds update";
        let aad = b"validator-a|validator-b|slot:100";

        let (ciphertext, nonce) = sender.encrypt_message(plaintext, aad).unwrap();
        let recovered = receiver.decrypt_message(&ciphertext, &nonce, aad).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn message_count_increments_on_encrypt() {
        let mut ch = make_channel();
        assert_eq!(ch.message_count, 0);
        ch.encrypt_message(b"msg1", b"aad").unwrap();
        assert_eq!(ch.message_count, 1);
        ch.encrypt_message(b"msg2", b"aad").unwrap();
        assert_eq!(ch.message_count, 2);
    }

    #[test]
    fn rekey_pending_set_at_threshold() {
        let mut ch = make_channel();
        ch.message_count = REKEY_MESSAGE_THRESHOLD - 1;
        ch.encrypt_message(b"last message before rekey", b"aad").unwrap();
        assert!(ch.rekey_pending);
    }

    #[test]
    fn rekey_resets_state() {
        let mut ch = make_channel();
        ch.message_count = 9_999;
        ch.rekey_pending = true;

        ch.rekey([0xBBu8; 32], [0x02u8; 12]);
        assert_eq!(ch.message_count, 0);
        assert!(!ch.rekey_pending);
    }

    #[test]
    fn wrong_aad_fails_decryption() {
        let mut sender = make_channel();
        let receiver = make_channel();

        let (ciphertext, nonce) = sender.encrypt_message(b"hello", b"aad-a").unwrap();
        let err = receiver.decrypt_message(&ciphertext, &nonce, b"aad-b").unwrap_err();
        assert_eq!(err, EncryptionError::DecryptionFailed);
    }
}
