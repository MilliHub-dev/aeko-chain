use {
    aeko_rust_sdk::AekoDeveloperClient,
    aeko_sdk::pubkey::Pubkey,
    std::env,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rpc_url = env::var("AEKO_RPC_URL")
        .unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let address = env::args()
        .nth(1)
        .map(|value| value.parse::<Pubkey>())
        .transpose()?
        .unwrap_or_else(Pubkey::new_unique);

    let client = AekoDeveloperClient::new(rpc_url);
    let latest_blockhash = client.get_latest_blockhash().await?;
    let balance = client.get_balance(&address).await?;

    println!("address: {address}");
    println!("latest_blockhash: {latest_blockhash}");
    println!("balance: {balance}");

    Ok(())
}
