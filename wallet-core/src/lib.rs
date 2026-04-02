pub mod permissions;

use {
    aes_gcm_siv::{
        aead::{Aead, NewAead},
        Aes256GcmSiv, Nonce,
    },
    aeko_remote_wallet::{
        locator::Locator,
        remote_keypair::{generate_remote_keypair, RemoteKeypair},
        remote_wallet::{initialize_wallet_manager, RemoteWalletInfo, RemoteWalletManager},
    },
    base64::{engine::general_purpose::STANDARD as BASE64, Engine},
    bip39::{Language, Mnemonic, MnemonicType, Seed},
    hmac::Hmac,
    rand::RngCore,
    serde::{Deserialize, Serialize},
    sha2::Sha256,
    aeko_sdk::{
        hash::Hash,
        derivation_path::DerivationPath,
        message::Message,
        offchain_message::OffchainMessage,
        pubkey::Pubkey,
        signature::{keypair_from_seed_and_derivation_path, Keypair, Signature, Signer},
        signer::SignerError,
        transaction::Transaction,
    },
    std::{error::Error, fmt, rc::Rc, time::Duration},
};

const KEYSTORE_VERSION: u8 = 1;
const PBKDF2_ROUNDS: u32 = 100_000;
const SALT_BYTES: usize = 16;
const NONCE_BYTES: usize = 12;

#[derive(Debug)]
pub enum WalletCoreError {
    InvalidWordCount(usize),
    InvalidMnemonic(String),
    InvalidDerivationPath(String),
    EncryptionFailed,
    DecryptionFailed,
    InvalidKeystore(String),
    RemoteWallet(String),
    LedgerDeviceNotFound(String),
}

impl fmt::Display for WalletCoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidWordCount(count) => write!(f, "Unsupported mnemonic word count: {count}"),
            Self::InvalidMnemonic(error) => write!(f, "Invalid mnemonic: {error}"),
            Self::InvalidDerivationPath(error) => write!(f, "Invalid derivation path: {error}"),
            Self::EncryptionFailed => write!(f, "Unable to encrypt keystore"),
            Self::DecryptionFailed => write!(f, "Unable to decrypt keystore"),
            Self::InvalidKeystore(error) => write!(f, "Invalid keystore: {error}"),
            Self::RemoteWallet(error) => write!(f, "Remote wallet error: {error}"),
            Self::LedgerDeviceNotFound(error) => write!(f, "Ledger device not found: {error}"),
        }
    }
}

impl Error for WalletCoreError {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeystoreCrypto {
    pub cipher: String,
    pub kdf: String,
    pub pbkdf2_rounds: u32,
    pub salt_b64: String,
    pub nonce_b64: String,
    pub ciphertext_b64: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EncryptedKeystore {
    pub version: u8,
    pub public_key: String,
    pub did: String,
    pub derivation_path: Option<String>,
    pub crypto: KeystoreCrypto,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WalletRecord {
    pub mnemonic: String,
    pub public_key: Pubkey,
    pub did: String,
    pub derivation_path: Option<String>,
    pub keystore: EncryptedKeystore,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SignedMessage {
    pub public_key: Pubkey,
    pub did: String,
    pub signature: Signature,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StatelessSignature {
    pub public_key: Pubkey,
    pub did: String,
    pub payload_hash: Hash,
    pub signature: Signature,
}

#[derive(Clone, Debug)]
pub struct CreateWalletInput {
    pub word_count: usize,
    pub passphrase: String,
    pub password: String,
    pub derivation_path: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ImportMnemonicInput {
    pub mnemonic: String,
    pub passphrase: String,
    pub password: String,
    pub derivation_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LedgerDeviceSummary {
    pub model: String,
    pub serial: String,
    pub host_device_path: String,
    pub public_key: Pubkey,
    pub locator: String,
    pub pretty_path: String,
}

#[derive(Clone, Debug)]
pub struct ConnectLedgerInput {
    pub locator: Option<String>,
    pub host_device_path: Option<String>,
    pub derivation_path: Option<String>,
    pub confirm_key: bool,
    pub polling_timeout: Duration,
}

pub struct LedgerWalletAccount {
    remote_keypair: RemoteKeypair,
    #[allow(dead_code)]
    wallet_manager: Rc<RemoteWalletManager>,
    pub host_device_path: String,
    pub locator: String,
    pub derivation_path: String,
}

pub fn create_wallet(input: CreateWalletInput) -> Result<WalletRecord, WalletCoreError> {
    let mnemonic_type = match input.word_count {
        12 => MnemonicType::Words12,
        15 => MnemonicType::Words15,
        18 => MnemonicType::Words18,
        21 => MnemonicType::Words21,
        24 => MnemonicType::Words24,
        count => return Err(WalletCoreError::InvalidWordCount(count)),
    };

    let mnemonic = Mnemonic::new(mnemonic_type, Language::English);
    import_from_mnemonic(ImportMnemonicInput {
        mnemonic: mnemonic.phrase().to_string(),
        passphrase: input.passphrase,
        password: input.password,
        derivation_path: input.derivation_path,
    })
}

pub fn import_from_mnemonic(input: ImportMnemonicInput) -> Result<WalletRecord, WalletCoreError> {
    let mnemonic = Mnemonic::from_phrase(&input.mnemonic, Language::English)
        .map_err(|error| WalletCoreError::InvalidMnemonic(error.to_string()))?;
    let derivation_path = parse_derivation_path(input.derivation_path.as_deref())?;
    let seed = Seed::new(&mnemonic, &input.passphrase);
    let keypair = keypair_from_seed_and_derivation_path(seed.as_bytes(), derivation_path)
        .map_err(|error| WalletCoreError::InvalidDerivationPath(error.to_string()))?;
    let keystore = export_keystore(&keypair, &input.password, input.derivation_path.clone())?;

    Ok(WalletRecord {
        mnemonic: mnemonic.phrase().to_string(),
        public_key: keypair.pubkey(),
        did: did_from_pubkey(&keypair.pubkey()),
        derivation_path: input.derivation_path,
        keystore,
    })
}

pub fn export_keystore(
    keypair: &Keypair,
    password: &str,
    derivation_path: Option<String>,
) -> Result<EncryptedKeystore, WalletCoreError> {
    let mut salt = [0u8; SALT_BYTES];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut nonce_bytes = [0u8; NONCE_BYTES];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let encryption_key = derive_encryption_key(password, &salt);
    let cipher = Aes256GcmSiv::new_from_slice(&encryption_key)
        .map_err(|_| WalletCoreError::EncryptionFailed)?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), keypair.to_bytes().as_ref())
        .map_err(|_| WalletCoreError::EncryptionFailed)?;

    Ok(EncryptedKeystore {
        version: KEYSTORE_VERSION,
        public_key: keypair.pubkey().to_string(),
        did: did_from_pubkey(&keypair.pubkey()),
        derivation_path,
        crypto: KeystoreCrypto {
            cipher: "aes-256-gcm-siv".to_string(),
            kdf: "pbkdf2-hmac-sha256".to_string(),
            pbkdf2_rounds: PBKDF2_ROUNDS,
            salt_b64: BASE64.encode(salt),
            nonce_b64: BASE64.encode(nonce_bytes),
            ciphertext_b64: BASE64.encode(ciphertext),
        },
    })
}

pub fn import_from_keystore(
    keystore: &EncryptedKeystore,
    password: &str,
) -> Result<Keypair, WalletCoreError> {
    if keystore.version != KEYSTORE_VERSION {
        return Err(WalletCoreError::InvalidKeystore(format!(
            "unsupported version {}",
            keystore.version
        )));
    }
    if keystore.crypto.cipher != "aes-256-gcm-siv" {
        return Err(WalletCoreError::InvalidKeystore(
            "unsupported cipher".to_string(),
        ));
    }

    let salt = BASE64
        .decode(&keystore.crypto.salt_b64)
        .map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;
    let nonce = BASE64
        .decode(&keystore.crypto.nonce_b64)
        .map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;
    let ciphertext = BASE64
        .decode(&keystore.crypto.ciphertext_b64)
        .map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;

    let encryption_key = derive_encryption_key(password, &salt);
    let cipher = Aes256GcmSiv::new_from_slice(&encryption_key)
        .map_err(|_| WalletCoreError::DecryptionFailed)?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| WalletCoreError::DecryptionFailed)?;

    Keypair::from_bytes(&plaintext).map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))
}

pub fn did_from_pubkey(pubkey: &Pubkey) -> String {
    format!("did:aeko:{pubkey}")
}

pub fn list_ledger_devices(polling_timeout: Duration) -> Result<Vec<LedgerDeviceSummary>, WalletCoreError> {
    let wallet_manager = initialize_remote_wallet_manager()?;
    if polling_timeout.is_zero() {
        wallet_manager
            .update_devices()
            .map_err(map_remote_wallet_error)?;
    } else {
        wallet_manager.try_connect_polling(&polling_timeout);
    }

    Ok(wallet_manager
        .list_devices()
        .into_iter()
        .map(|device| {
            let pretty_path = device.get_pretty_path();
            LedgerDeviceSummary {
                model: device.model,
                serial: device.serial,
                host_device_path: device.host_device_path.clone(),
                public_key: device.pubkey,
                locator: Locator::new_from_parts("ledger", Some(device.pubkey))
                    .map(|locator| locator.to_string())
                    .unwrap_or_else(|_| format!("usb://ledger/{}", device.pubkey)),
                pretty_path,
            }
        })
        .collect())
}

pub fn connect_ledger_wallet(input: ConnectLedgerInput) -> Result<LedgerWalletAccount, WalletCoreError> {
    let wallet_manager = initialize_remote_wallet_manager()?;
    if input.polling_timeout.is_zero() {
        wallet_manager
            .update_devices()
            .map_err(map_remote_wallet_error)?;
    } else {
        wallet_manager.try_connect_polling(&input.polling_timeout);
    }

    let devices = wallet_manager.list_devices();
    let selected_device = select_ledger_device(
        &devices,
        input.host_device_path.as_deref(),
        input.locator.as_deref(),
    )?;
    let locator = if let Some(locator) = input.locator.as_deref() {
        Locator::new_from_path(locator)
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?
    } else {
        Locator::new_from_parts("ledger", Some(selected_device.pubkey))
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?
    };
    let derivation_path = parse_remote_derivation_path(input.derivation_path.as_deref())?;
    let derivation_path_string = format!("{derivation_path:?}");
    let remote_keypair = generate_remote_keypair(
        locator.clone(),
        derivation_path,
        wallet_manager.as_ref(),
        input.confirm_key,
        "wallet-core",
    )
    .map_err(map_remote_wallet_error)?;

    Ok(LedgerWalletAccount {
        remote_keypair,
        wallet_manager,
        host_device_path: selected_device.host_device_path,
        locator: locator.to_string(),
        derivation_path: derivation_path_string,
    })
}

pub fn sign_message_bytes(
    keystore: &EncryptedKeystore,
    password: &str,
    message: &[u8],
) -> Result<SignedMessage, WalletCoreError> {
    let keypair = import_from_keystore(keystore, password)?;
    Ok(SignedMessage {
        public_key: keypair.pubkey(),
        did: did_from_pubkey(&keypair.pubkey()),
        signature: keypair.sign_message(message),
    })
}

pub fn sign_transaction(
    keystore: &EncryptedKeystore,
    password: &str,
    message: Message,
    recent_blockhash: Hash,
) -> Result<Transaction, WalletCoreError> {
    let keypair = import_from_keystore(keystore, password)?;
    let mut transaction = Transaction::new_unsigned(message);
    transaction
        .try_sign(&[&keypair], recent_blockhash)
        .map_err(map_signer_error)?;
    Ok(transaction)
}

pub fn sign_transaction_batch(
    keystore: &EncryptedKeystore,
    password: &str,
    requests: Vec<(Message, Hash)>,
) -> Result<Vec<Transaction>, WalletCoreError> {
    let keypair = import_from_keystore(keystore, password)?;
    requests
        .into_iter()
        .map(|(message, recent_blockhash)| {
            let mut transaction = Transaction::new_unsigned(message);
            transaction
                .try_sign(&[&keypair], recent_blockhash)
                .map_err(map_signer_error)?;
            Ok(transaction)
        })
        .collect()
}

pub fn sign_stateless_payload(
    keystore: &EncryptedKeystore,
    password: &str,
    payload: &[u8],
) -> Result<StatelessSignature, WalletCoreError> {
    let keypair = import_from_keystore(keystore, password)?;
    let offchain_message =
        OffchainMessage::new(0, payload).map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;
    let signature = offchain_message
        .sign(&keypair)
        .map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;
    let payload_hash = offchain_message
        .hash()
        .map_err(|error| WalletCoreError::InvalidKeystore(error.to_string()))?;

    Ok(StatelessSignature {
        public_key: keypair.pubkey(),
        did: did_from_pubkey(&keypair.pubkey()),
        payload_hash,
        signature,
    })
}

impl LedgerWalletAccount {
    pub fn public_key(&self) -> Pubkey {
        self.remote_keypair.pubkey()
    }

    pub fn did(&self) -> String {
        did_from_pubkey(&self.public_key())
    }

    pub fn sign_message(&self, message: &[u8]) -> Result<SignedMessage, WalletCoreError> {
        let signature = self
            .remote_keypair
            .try_sign_message(message)
            .map_err(map_signer_error)?;

        Ok(SignedMessage {
            public_key: self.public_key(),
            did: self.did(),
            signature,
        })
    }

    pub fn sign_transaction(
        &self,
        message: Message,
        recent_blockhash: Hash,
    ) -> Result<Transaction, WalletCoreError> {
        let mut transaction = Transaction::new_unsigned(message);
        transaction
            .try_sign(&[&self.remote_keypair], recent_blockhash)
            .map_err(map_signer_error)?;
        Ok(transaction)
    }

    pub fn sign_transaction_batch(
        &self,
        requests: Vec<(Message, Hash)>,
    ) -> Result<Vec<Transaction>, WalletCoreError> {
        requests
            .into_iter()
            .map(|(message, recent_blockhash)| self.sign_transaction(message, recent_blockhash))
            .collect()
    }

    pub fn sign_stateless_payload(
        &self,
        payload: &[u8],
    ) -> Result<StatelessSignature, WalletCoreError> {
        let offchain_message = OffchainMessage::new(0, payload)
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?;
        let signature = offchain_message
            .sign(&self.remote_keypair)
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?;
        let payload_hash = offchain_message
            .hash()
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?;

        Ok(StatelessSignature {
            public_key: self.public_key(),
            did: self.did(),
            payload_hash,
            signature,
        })
    }
}

fn parse_derivation_path(path: Option<&str>) -> Result<Option<DerivationPath>, WalletCoreError> {
    path.map(DerivationPath::from_absolute_path_str)
        .transpose()
        .map_err(|error| WalletCoreError::InvalidDerivationPath(error.to_string()))
}

fn parse_remote_derivation_path(path: Option<&str>) -> Result<DerivationPath, WalletCoreError> {
    parse_derivation_path(path)?.map_or_else(|| Ok(DerivationPath::default()), Ok)
}

fn initialize_remote_wallet_manager() -> Result<Rc<RemoteWalletManager>, WalletCoreError> {
    initialize_wallet_manager().map_err(map_remote_wallet_error)
}

fn select_ledger_device(
    devices: &[RemoteWalletInfo],
    host_device_path: Option<&str>,
    locator: Option<&str>,
) -> Result<RemoteWalletInfo, WalletCoreError> {
    if let Some(host_device_path) = host_device_path {
        return devices
            .iter()
            .find(|device| device.host_device_path == host_device_path)
            .cloned()
            .ok_or_else(|| WalletCoreError::LedgerDeviceNotFound(host_device_path.to_string()));
    }

    if let Some(locator) = locator {
        let locator = Locator::new_from_path(locator)
            .map_err(|error| WalletCoreError::RemoteWallet(error.to_string()))?;
        return devices
            .iter()
            .find(|device| locator.pubkey.map(|pubkey| pubkey == device.pubkey).unwrap_or(true))
            .cloned()
            .ok_or_else(|| WalletCoreError::LedgerDeviceNotFound(locator.to_string()));
    }

    devices
        .first()
        .cloned()
        .ok_or_else(|| WalletCoreError::LedgerDeviceNotFound("no Ledger devices detected".to_string()))
}

fn derive_encryption_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2::<Hmac<Sha256>>(password.as_bytes(), salt, PBKDF2_ROUNDS, &mut key);
    key
}

fn map_signer_error(error: SignerError) -> WalletCoreError {
    WalletCoreError::InvalidKeystore(error.to_string())
}

fn map_remote_wallet_error<E: fmt::Display>(error: E) -> WalletCoreError {
    WalletCoreError::RemoteWallet(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aeko_remote_wallet::remote_wallet::RemoteWalletInfo;
    use aeko_sdk::{instruction::Instruction, message::Message};

    #[test]
    fn create_wallet_roundtrips_keystore() {
        let record = create_wallet(CreateWalletInput {
            word_count: 12,
            passphrase: "".to_string(),
            password: "test-password".to_string(),
            derivation_path: Some("m/44'/501'/0'/0'".to_string()),
        })
        .unwrap();

        let restored = import_from_keystore(&record.keystore, "test-password").unwrap();

        assert_eq!(restored.pubkey(), record.public_key);
        assert_eq!(record.did, did_from_pubkey(&record.public_key));
        assert_eq!(record.keystore.public_key, record.public_key.to_string());
    }

    #[test]
    fn import_from_mnemonic_is_deterministic() {
        let input = ImportMnemonicInput {
            mnemonic: "miracle pizza supply useful steak border same again youth silver access hundred".to_string(),
            passphrase: "".to_string(),
            password: "another-password".to_string(),
            derivation_path: Some("m/44'/501'/0'/0'".to_string()),
        };

        let first = import_from_mnemonic(input.clone()).unwrap();
        let second = import_from_mnemonic(input).unwrap();

        assert_eq!(first.public_key, second.public_key);
        assert_eq!(first.keystore.did, second.keystore.did);
    }

    #[test]
    fn wrong_password_fails_keystore_import() {
        let record = create_wallet(CreateWalletInput {
            word_count: 12,
            passphrase: "".to_string(),
            password: "correct-password".to_string(),
            derivation_path: None,
        })
        .unwrap();

        let error = import_from_keystore(&record.keystore, "wrong-password").unwrap_err();
        assert!(matches!(
            error,
            WalletCoreError::DecryptionFailed | WalletCoreError::InvalidKeystore(_)
        ));
    }

    #[test]
    fn signs_message_bytes() {
        let record = create_wallet(CreateWalletInput {
            word_count: 12,
            passphrase: "".to_string(),
            password: "message-password".to_string(),
            derivation_path: None,
        })
        .unwrap();

        let signed = sign_message_bytes(&record.keystore, "message-password", b"hello-aeko").unwrap();

        assert_eq!(signed.public_key, record.public_key);
        assert!(signed.signature.verify(record.public_key.as_ref(), b"hello-aeko"));
    }

    #[test]
    fn signs_transaction_and_batch() {
        let record = create_wallet(CreateWalletInput {
            word_count: 12,
            passphrase: "".to_string(),
            password: "tx-password".to_string(),
            derivation_path: None,
        })
        .unwrap();

        let instruction = Instruction::new_with_bincode(Pubkey::new_unique(), &0u8, vec![]);
        let message = Message::new(&[instruction.clone()], Some(&record.public_key));
        let tx = sign_transaction(&record.keystore, "tx-password", message, Hash::new_unique()).unwrap();
        assert!(!tx.signatures.is_empty());

        let batch = sign_transaction_batch(
            &record.keystore,
            "tx-password",
            vec![
                (Message::new(&[instruction.clone()], Some(&record.public_key)), Hash::new_unique()),
                (Message::new(&[instruction], Some(&record.public_key)), Hash::new_unique()),
            ],
        )
        .unwrap();
        assert_eq!(batch.len(), 2);
        assert!(batch.iter().all(|transaction| !transaction.signatures.is_empty()));
    }

    #[test]
    fn signs_stateless_payload() {
        let record = create_wallet(CreateWalletInput {
            word_count: 12,
            passphrase: "".to_string(),
            password: "stateless-password".to_string(),
            derivation_path: None,
        })
        .unwrap();

        let signed = sign_stateless_payload(&record.keystore, "stateless-password", b"mission-brief").unwrap();
        assert_eq!(signed.public_key, record.public_key);
        assert_eq!(signed.did, record.did);
    }

    #[test]
    fn select_ledger_device_prefers_host_path() {
        let first = RemoteWalletInfo {
            host_device_path: "first-device".to_string(),
            pubkey: Pubkey::new_unique(),
            ..RemoteWalletInfo::default()
        };
        let second = RemoteWalletInfo {
            host_device_path: "second-device".to_string(),
            pubkey: Pubkey::new_unique(),
            ..RemoteWalletInfo::default()
        };

        let selected = select_ledger_device(&[first.clone(), second], Some("first-device"), None).unwrap();
        assert_eq!(selected.host_device_path, first.host_device_path);
        assert_eq!(selected.pubkey, first.pubkey);
    }

    #[test]
    fn select_ledger_device_supports_locator_lookup() {
        let pubkey = Pubkey::new_unique();
        let device = RemoteWalletInfo {
            host_device_path: "ledger-device".to_string(),
            pubkey,
            ..RemoteWalletInfo::default()
        };
        let locator = format!("usb://ledger/{pubkey}");

        let selected = select_ledger_device(&[device.clone()], None, Some(&locator)).unwrap();
        assert_eq!(selected.pubkey, device.pubkey);
    }
}
