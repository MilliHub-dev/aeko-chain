use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{
            funding::{FundingSettingsUpdate, FundingStoreError},
            PostgresRepository,
        },
    },
    anyhow::{Context, Result},
    std::{
        env,
        time::{Duration, SystemTime, UNIX_EPOCH},
    },
};

fn test_config(database_url: String) -> ExplorerBackendConfig {
    ExplorerBackendConfig {
        rpc_url: "http://127.0.0.1:8899".to_string(),
        websocket_url: None,
        network: "testnet".to_string(),
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

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock must be after Unix epoch")
        .as_nanos()
}

#[tokio::test]
async fn funding_policy_queue_and_grants_are_durable_and_separated() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    let initial = repository.funding_settings().await?;
    let updated = repository
        .update_funding_settings(
            initial.revision,
            &FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(5_000.0),
                max_manual_grant_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;
    assert_eq!(updated.revision, initial.revision + 1);

    let stale = repository
        .update_funding_settings(
            initial.revision,
            &FundingSettingsUpdate {
                amount_aeko: Some(6.0),
                ..FundingSettingsUpdate::default()
            },
        )
        .await;
    assert!(matches!(stale, Err(FundingStoreError::RevisionConflict)));

    let suffix = unique_suffix();
    let public_address = format!("integration-public-{suffix}");
    let pending = repository
        .create_public_funding_request(&public_address)
        .await?;
    assert_eq!(pending.status, "pending");
    assert_eq!(pending.source, "public");
    assert_eq!(pending.amount_aeko, 5.0);

    let duplicate = repository
        .create_public_funding_request(&public_address)
        .await;
    assert!(matches!(
        duplicate,
        Err(FundingStoreError::RequestPending { .. })
    ));

    let before_reservation = repository.funding_policy_snapshot().await?;
    let processing = repository
        .reserve_public_funding_request(&pending.id)
        .await?;
    assert_eq!(processing.status, "processing");

    let reserved = repository.funding_policy_snapshot().await?;
    assert!(
        reserved.public_reserved_aeko >= before_reservation.public_reserved_aeko + 5.0
    );

    let public_signature = format!("integration-public-signature-{suffix}");
    repository
        .set_funding_request_signature(&pending.id, &public_signature)
        .await?;
    let approved = repository
        .finalize_funding_request(&pending.id, true)
        .await?;
    assert_eq!(approved.status, "approved");
    assert!(approved.confirmed);

    let grants = repository.list_funding_grants(500).await?;
    let public_grant = grants
        .iter()
        .find(|grant| grant.signature.as_deref() == Some(public_signature.as_str()))
        .context("public funding grant should be persisted")?;
    assert_eq!(public_grant.source, "public");
    assert!(public_grant.confirmed);

    let after_public = repository.funding_policy_snapshot().await?;
    assert!(after_public.public_spent_aeko >= before_reservation.public_spent_aeko + 5.0);

    let console_address = format!("integration-console-{suffix}");
    let console_request = repository
        .create_immediate_funding_request(&console_address, 3.0, "console")
        .await?;
    let console_signature = format!("integration-console-signature-{suffix}");
    repository
        .set_funding_request_signature(&console_request.id, &console_signature)
        .await?;
    repository
        .finalize_funding_request(&console_request.id, true)
        .await?;

    let after_console = repository.funding_policy_snapshot().await?;
    assert_eq!(after_console.public_spent_aeko, after_public.public_spent_aeko);
    assert_eq!(
        after_console.public_reserved_aeko,
        after_public.public_reserved_aeko
    );

    Ok(())
}
