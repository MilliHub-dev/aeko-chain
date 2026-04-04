use {
    aeko_explorer_backend::{
        serve_explorer_api, ExplorerBackendConfig, ExplorerIndexer, InMemoryExplorerStore,
        RpcChainDataSource,
    },
    anyhow::Result,
    std::{env, net::SocketAddr},
};

#[tokio::main]
async fn main() -> Result<()> {
    let rpc_url = env::var("AEKO_EXPLORER_RPC")
        .unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let start_slot = env::var("AEKO_EXPLORER_START_SLOT")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let bind_addr = env::var("AEKO_EXPLORER_BIND")
        .ok()
        .and_then(|value| value.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| "127.0.0.1:8088".parse().unwrap());
    let network = env::var("AEKO_EXPLORER_NETWORK").unwrap_or_else(|_| "testnet".to_string());

    let config = ExplorerBackendConfig {
        rpc_url,
        start_slot,
        ..ExplorerBackendConfig::default()
    };
    let data_source = RpcChainDataSource::new(config.clone());
    let store = InMemoryExplorerStore::new();
    let indexer = ExplorerIndexer::new(config, data_source, store.clone());

    indexer.catch_up()?;

    println!("serving explorer api on http://{bind_addr}");
    println!("sample endpoints:");
    println!("  GET /health");
    println!("  GET /blocks?limit=10");
    println!("  GET /transactions?limit=10");
    println!("  GET /tokens/transfers?limit=10");
    println!("  GET /nfts?limit=10");
    println!("  GET /posts?limit=10");
    println!("  GET /engagement?limit=10");
    println!("  GET /stakes?limit=10");
    println!("  GET /search?q=<query>&limit=10");

    serve_explorer_api(store, bind_addr, network).await
}
