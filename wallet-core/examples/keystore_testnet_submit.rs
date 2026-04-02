use {
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        message::Message,
        pubkey::Pubkey,
        signature::Signer,
        system_instruction,
    },
    aeko_wallet_core::{
        did_from_pubkey, import_from_keystore, sign_message_bytes, sign_stateless_payload,
        sign_transaction, sign_transaction_batch, EncryptedKeystore,
    },
    std::{env, error::Error, fs, str::FromStr},
};

fn main() -> Result<(), Box<dyn Error>> {
    let rpc_url =
        env::var("AEKO_TESTNET_RPC").unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let keystore_path = required_env("AEKO_WALLET_KEYSTORE_PATH")?;
    let password = required_env("AEKO_WALLET_PASSWORD")?;
    let recipient = Pubkey::from_str(&required_env("AEKO_RECIPIENT_PUBKEY")?)?;
    let lamports = env::var("AEKO_TRANSFER_LAMPORTS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1_000_000);

    let keystore: EncryptedKeystore = serde_json::from_str(&fs::read_to_string(&keystore_path)?)?;
    let signer = import_from_keystore(&keystore, &password)?;
    let rpc_client = RpcClient::new(rpc_url.clone());
    let recent_blockhash = rpc_client.get_latest_blockhash()?;

    let signed_message = sign_message_bytes(&keystore, &password, b"phase4-wallet-core-testnet-submit")?;
    let stateless = sign_stateless_payload(&keystore, &password, b"phase4-wallet-core-testnet-submit")?;

    let transfer_instruction = system_instruction::transfer(&signer.pubkey(), &recipient, lamports);
    let transfer_message = Message::new(&[transfer_instruction.clone()], Some(&signer.pubkey()));
    let transfer_transaction =
        sign_transaction(&keystore, &password, transfer_message, recent_blockhash)?;

    let batch = sign_transaction_batch(
        &keystore,
        &password,
        vec![
            (Message::new(&[transfer_instruction.clone()], Some(&signer.pubkey())), recent_blockhash),
            (Message::new(&[transfer_instruction], Some(&signer.pubkey())), recent_blockhash),
        ],
    )?;

    let signature = rpc_client.send_and_confirm_transaction(&transfer_transaction)?;

    println!("rpc url: {rpc_url}");
    println!("wallet public key: {}", signer.pubkey());
    println!("wallet DID: {}", did_from_pubkey(&signer.pubkey()));
    println!("recipient: {recipient}");
    println!("transfer amount (base units): {lamports}");
    println!("message signer pubkey: {}", signed_message.public_key);
    println!("stateless payload hash: {}", stateless.payload_hash);
    println!("batch signed transactions: {}", batch.len());
    println!("testnet transfer signature: {signature}");

    Ok(())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error>> {
    env::var(name).map_err(|_| format!("missing required environment variable {name}").into())
}
