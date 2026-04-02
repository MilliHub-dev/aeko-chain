use {
    aeko_sdk::{hash::Hash, message::Message, signature::Signer},
    aeko_wallet_core::{
        create_wallet, import_from_keystore, import_from_mnemonic, sign_message_bytes,
        sign_stateless_payload, sign_transaction, sign_transaction_batch, CreateWalletInput,
        ImportMnemonicInput,
    },
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let password = "phase4-demo-password";
    let derivation_path = Some("m/44'/501'/0'/0'".to_string());

    let created = create_wallet(CreateWalletInput {
        word_count: 12,
        passphrase: String::new(),
        password: password.to_string(),
        derivation_path: derivation_path.clone(),
    })?;

    let restored_from_mnemonic = import_from_mnemonic(ImportMnemonicInput {
        mnemonic: created.mnemonic.clone(),
        passphrase: String::new(),
        password: password.to_string(),
        derivation_path: derivation_path.clone(),
    })?;

    let restored_from_keystore = import_from_keystore(&created.keystore, password)?;
    let message = b"phase4-wallet-core-validation";

    let signed_message = sign_message_bytes(&created.keystore, password, message)?;
    let signed_stateless = sign_stateless_payload(&created.keystore, password, message)?;

    let payer = created.public_key;
    let message_one = Message::new(&[], Some(&payer));
    let message_two = Message::new(&[], Some(&payer));
    let transaction = sign_transaction(&created.keystore, password, message_one, Hash::new_unique())?;
    let batch = sign_transaction_batch(
        &created.keystore,
        password,
        vec![
            (message_two.clone(), Hash::new_unique()),
            (message_two, Hash::new_unique()),
        ],
    )?;

    assert_eq!(created.public_key, restored_from_mnemonic.public_key);
    assert_eq!(created.public_key, restored_from_keystore.pubkey());

    println!("wallet public key: {}", created.public_key);
    println!("wallet DID: {}", created.did);
    println!("signed message pubkey: {}", signed_message.public_key);
    println!("stateless payload hash: {}", signed_stateless.payload_hash);
    println!("single signed transaction signatures: {}", transaction.signatures.len());
    println!("batch signed transactions: {}", batch.len());

    Ok(())
}
