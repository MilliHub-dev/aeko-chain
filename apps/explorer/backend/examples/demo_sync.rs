use {
    aeko_explorer_backend::{
        ExplorerApiService, ExplorerBackendConfig, ExplorerIndexer, InMemoryExplorerStore,
        RpcChainDataSource,
    },
    anyhow::Result,
    std::env,
};

fn main() -> Result<()> {
    let rpc_url = env::var("AEKO_EXPLORER_RPC")
        .unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let start_slot = env::var("AEKO_EXPLORER_START_SLOT")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let end_slot = env::var("AEKO_EXPLORER_END_SLOT")
        .ok()
        .and_then(|value| value.parse::<u64>().ok());

    let config = ExplorerBackendConfig {
        rpc_url,
        start_slot,
        ..ExplorerBackendConfig::default()
    };
    let data_source = RpcChainDataSource::new(config.clone());
    let store = InMemoryExplorerStore::new();
    let indexer = ExplorerIndexer::new(config.clone(), data_source, store.clone());

    if let Some(end_slot) = end_slot {
        indexer.sync_range(config.start_slot, end_slot)?;
    } else {
        indexer.catch_up()?;
    }

    let api = ExplorerApiService::new(store);
    let blocks = api.list_blocks(5)?;
    let posts = api.list_posts(None, 5)?;
    let stakes = api.list_social_stakes(None, 5)?;
    let engagement = api.list_engagement_events(None, 5)?;

    println!("synced blocks: {}", blocks.len());
    println!("indexed posts: {}", posts.len());
    println!("indexed social stakes: {}", stakes.len());
    println!("indexed engagement events: {}", engagement.len());

    if let Some(block) = blocks.first() {
        println!("latest block slot: {}", block.slot);
    }
    if let Some(post) = posts.first() {
        println!("sample post: {} by {}", post.post_id, post.creator);
    }
    if let Some(stake) = stakes.first() {
        println!(
            "sample stake: {} -> {} amount {}",
            stake.staker, stake.creator, stake.staked_amount
        );
    }

    Ok(())
}
