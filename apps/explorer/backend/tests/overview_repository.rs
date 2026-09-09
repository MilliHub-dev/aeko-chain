use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::PostgresRepository,
    },
    anyhow::{Context, Result},
    std::{env, time::Duration},
};

fn test_config(database_url: String) -> ExplorerBackendConfig {
    ExplorerBackendConfig {
        rpc_url: "http://127.0.0.1:8899".to_string(),
        websocket_url: None,
        network: "test".to_string(),
        start_slot: 0,
        max_batch_size: 32,
        persist_socialfi_views: true,
        database_url,
        db_max_connections: 4,
        db_min_connections: 1,
        db_acquire_timeout: Duration::from_secs(5),
        rpc_timeout: Duration::from_secs(5),
        asset_refresh_slots: 64,
        social_refresh_slots: 16,
        max_ready_lag_slots: 128,
    }
}

#[tokio::test]
async fn overview_counts_query_the_real_explorer_tables() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    // This is intentionally a database-contract test rather than a mocked unit
    // test. It proves the overview query is executable against the migrations
    // that CI applies for blocks, transactions, tokens, NFTs and Social state.
    let first = repository.explorer_overview_counts().await?;
    let second = repository.explorer_overview_counts().await?;

    // Counts may be non-zero because PostgreSQL integration tests share the CI
    // database, but a read-only overview call must be stable in the absence of
    // mutations from this test itself.
    assert_eq!(first, second);

    Ok(())
}
