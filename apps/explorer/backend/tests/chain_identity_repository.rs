use {
    aeko_explorer_backend::{config::ExplorerBackendConfig, infrastructure::persistence::PostgresRepository},
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
async fn postgres_is_permanently_bound_to_one_network_and_genesis() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    repository.bind_chain_identity("test", "integration-genesis").await?;
    repository.bind_chain_identity("test", "integration-genesis").await?;
    assert_eq!(
        repository.chain_identity().await?,
        Some(("test".to_string(), "integration-genesis".to_string()))
    );

    let wrong_genesis = repository.bind_chain_identity("test", "different-genesis").await;
    assert!(wrong_genesis.is_err());
    assert!(wrong_genesis
        .unwrap_err()
        .to_string()
        .contains("Refusing to mix histories"));

    let wrong_network = repository.bind_chain_identity("production", "integration-genesis").await;
    assert!(wrong_network.is_err());

    Ok(())
}
