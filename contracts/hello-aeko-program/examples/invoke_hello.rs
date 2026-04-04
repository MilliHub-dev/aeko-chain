use {
    aeko_rust_sdk::AekoDeveloperClient,
    base64::{engine::general_purpose::STANDARD as BASE64, Engine},
    aeko_sdk::{
        instruction::Instruction,
        hash::Hash,
        pubkey::Pubkey,
        signature::{read_keypair_file, Signer},
        transaction::Transaction,
    },
    std::{env, error::Error, str::FromStr},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let rpc_url =
        env::var("AEKO_RPC_URL").unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let program_id = Pubkey::from_str(&required_env("AEKO_PROGRAM_ID")?)?;
    let keypair_path = env::var("AEKO_KEYPAIR_PATH")
        .unwrap_or_else(|_| format!("{}/.config/aeko/id.json", env::var("HOME").unwrap_or_default()));
    let instruction_text = env::args()
        .nth(1)
        .unwrap_or_else(|| "hello-from-aeko-testnet".to_string());

    let payer = read_keypair_file(&keypair_path)?;
    let client = AekoDeveloperClient::new(rpc_url.clone());
    let recent_blockhash = Hash::from_str(&client.get_latest_blockhash().await?)?;

    let transaction = Transaction::new_signed_with_payer(
        &[Instruction::new_with_bytes(program_id, instruction_text.as_bytes(), vec![])],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let transaction_bytes = bincode::serialize(&transaction)?;
    let transaction_base64 = BASE64.encode(transaction_bytes);
    let signature = client.send_transaction_base64(&transaction_base64).await?;

    println!("rpc url: {rpc_url}");
    println!("program id: {program_id}");
    println!("payer: {}", payer.pubkey());
    println!("instruction text: {instruction_text}");
    println!("message instructions: 1");
    println!("invoke signature: {signature}");

    Ok(())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error>> {
    env::var(name).map_err(|_| format!("missing required environment variable {name}").into())
}
