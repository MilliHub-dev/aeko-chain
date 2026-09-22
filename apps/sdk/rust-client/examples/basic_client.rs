use {aeko_rust_sdk::AekoDeveloperClient, std::env};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rpc_url = env::var("AEKO_RPC_URL")
        .map_err(|_| "AEKO_RPC_URL must be set to the target AEKO RPC endpoint")?;
    let address = env::args()
        .nth(1)
        .unwrap_or_else(|| "11111111111111111111111111111111".to_string());

    let client = AekoDeveloperClient::new(rpc_url);
    let latest_blockhash = client.get_latest_blockhash().await?;
    let balance = client.get_balance(&address).await?;

    println!("address: {address}");
    println!("latest_blockhash: {latest_blockhash}");
    println!("balance: {balance}");

    Ok(())
}
