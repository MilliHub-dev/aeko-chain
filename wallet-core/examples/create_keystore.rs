use {
    aeko_wallet_core::{create_wallet, CreateWalletInput},
    std::{env, error::Error, fs},
};

fn main() -> Result<(), Box<dyn Error>> {
    let output_path = required_env("AEKO_KEYSTORE_OUTPUT_PATH")?;
    let password = required_env("AEKO_WALLET_PASSWORD")?;
    let word_count = env::var("AEKO_WALLET_WORD_COUNT")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(12);
    let derivation_path =
        env::var("AEKO_DERIVATION_PATH").unwrap_or_else(|_| "m/44'/501'/0'/0'".to_string());
    let passphrase = env::var("AEKO_MNEMONIC_PASSPHRASE").unwrap_or_default();

    let created = create_wallet(CreateWalletInput {
        word_count,
        passphrase,
        password,
        derivation_path: Some(derivation_path.clone()),
    })?;

    let keystore_json = serde_json::to_string_pretty(&created.keystore)?;
    fs::write(&output_path, keystore_json)?;

    println!("keystore written to: {output_path}");
    println!("wallet public key: {}", created.public_key);
    println!("wallet DID: {}", created.did);
    println!("derivation path: {derivation_path}");
    println!("mnemonic: {}", created.mnemonic);
    println!("IMPORTANT: save the mnemonic securely before continuing");

    Ok(())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error>> {
    env::var(name).map_err(|_| format!("missing required environment variable {name}").into())
}
