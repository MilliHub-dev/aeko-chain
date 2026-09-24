use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{settings::AppSettingsUpdate, PostgresRepository},
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
        reset_chain_on_start: false,
    }
}

#[tokio::test]
async fn app_settings_are_durable_and_revision_guarded() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    let initial = repository.app_settings().await?;
    assert!(initial.revision > 0);
    assert!(initial.network_tools_enabled);
    assert!(!initial.network_console_enabled);
    assert!(initial.docs_enabled);
    assert!(initial.developers_enabled);
    assert!(initial.bridge_enabled);
    assert!(initial.nft_demo_enabled);
    assert!(!initial.nft_live_flow_enabled);
    assert!(!initial.nft_advanced_tools_enabled);
    assert!((3..=12).contains(&initial.explorer_list_size));
    assert!((5..=50).contains(&initial.explorer_search_result_limit));
    assert!((5..=300).contains(&initial.explorer_auto_refresh_seconds));
    assert!((10..=300).contains(&initial.settings_refresh_seconds));

    let expected_revision = initial.revision;
    let updated = repository
        .update_app_settings(
            expected_revision,
            &AppSettingsUpdate {
                network_tools_enabled: Some(false),
                network_console_enabled: Some(false),
                docs_enabled: Some(false),
                developers_enabled: Some(false),
                bridge_enabled: Some(false),
                nft_demo_enabled: Some(false),
                nft_live_flow_enabled: Some(false),
                nft_advanced_tools_enabled: Some(false),
                explorer_list_size: Some(9),
                explorer_search_result_limit: Some(24),
                explorer_auto_refresh_seconds: Some(20),
                settings_refresh_seconds: Some(60),
                max_ready_lag_slots_override: Some(256),
                social_readiness_required_override: Some(false),
            },
        )
        .await?
        .context("settings update should succeed at the current revision")?;

    assert_eq!(updated.revision, expected_revision + 1);
    assert!(!updated.network_tools_enabled);
    assert!(!updated.network_console_enabled);
    assert!(!updated.docs_enabled);
    assert!(!updated.developers_enabled);
    assert!(!updated.bridge_enabled);
    assert!(!updated.nft_demo_enabled);
    assert!(!updated.nft_live_flow_enabled);
    assert!(!updated.nft_advanced_tools_enabled);
    assert_eq!(updated.explorer_list_size, 9);
    assert_eq!(updated.explorer_search_result_limit, 24);
    assert_eq!(updated.explorer_auto_refresh_seconds, 20);
    assert_eq!(updated.settings_refresh_seconds, 60);
    assert_eq!(updated.max_ready_lag_slots_override, Some(256));
    assert_eq!(updated.social_readiness_required_override, Some(false));

    let persisted = repository.app_settings().await?;
    assert_eq!(persisted, updated);

    let stale = repository
        .update_app_settings(
            expected_revision,
            &AppSettingsUpdate {
                network_console_enabled: Some(true),
                ..AppSettingsUpdate::default()
            },
        )
        .await?;
    assert!(
        stale.is_none(),
        "stale expected revisions must not overwrite newer settings"
    );

    Ok(())
}
