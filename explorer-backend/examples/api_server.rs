use {
    aeko_explorer_backend::{
        serve_explorer_api, ChainDataSource, ExplorerBackendConfig, ExplorerIndexer, InMemoryExplorerStore,
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
    let indexer = std::sync::Arc::new(ExplorerIndexer::new(config.clone(), data_source, store.clone()));

    indexer.catch_up()?;

    // Spawn background task to continuously sync new blocks
    let bg_indexer = indexer.clone();
    let mut last_synced_slot = bg_indexer.data_source.latest_slot().unwrap_or(config.start_slot);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            match bg_indexer.data_source.latest_slot() {
                Ok(latest) => {
                    if latest > last_synced_slot {
                        if let Err(e) = bg_indexer.sync_range(last_synced_slot + 1, latest) {
                            eprintln!("Background sync error: {}", e);
                        } else {
                            last_synced_slot = latest;
                        }
                    }
                }
                Err(e) => eprintln!("Failed to get latest slot: {}", e),
            }
        }
    });

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
