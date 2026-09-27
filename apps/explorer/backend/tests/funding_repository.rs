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

#[test]
fn funding_state_machine_migration_releases_legacy_status_constraint_before_rewrite() {
    let migration = include_str!("../migrations/0012_funding_state_machine.sql");
    let drop_position = migration
        .find("DROP CONSTRAINT IF EXISTS funding_requests_status_check")
        .expect("0012 must drop the legacy status constraint");
    let rewrite_position = migration
        .find("UPDATE funding_requests")
        .expect("0012 must rewrite historical funding requests");
    let new_constraint_position = migration
        .rfind("ADD CONSTRAINT funding_requests_status_check")
        .expect("0012 must install the new status constraint");

    assert!(
        drop_position < rewrite_position,
        "legacy status constraint must be removed before new status values are written"
    );
    assert!(
        rewrite_position < new_constraint_position,
        "new status constraint must be installed after historical rows are normalized"
    );
    assert!(migration.contains("WHEN status = 'approved' AND confirmed THEN 'confirmed'"));
    assert!(migration.contains("WHEN status = 'approved' THEN 'submitted'"));
}

#[tokio::test]
async fn grant_queue_is_durable_idempotent_and_separate_from_airdrops() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url.clone())).await?;

    for scope in [
        "public-request-origin",
        "public-request-wallet",
        "console-airdrop-origin",
        "console-airdrop-wallet",
    ] {
        repository
            .record_funding_rate_event(
                scope,
                &format!("integration-rate-{scope}-{}", unique_suffix()),
                5,
                600,
            )
            .await?;
    }

    let limited_subject = format!("integration-rate-limit-{}", unique_suffix());
    repository
        .record_funding_rate_event("public-request-wallet", &limited_subject, 1, 600)
        .await?;
    let rate_limited = repository
        .record_funding_rate_event("public-request-wallet", &limited_subject, 1, 600)
        .await;
    assert!(matches!(
        rate_limited,
        Err(FundingStoreError::RateLimited { .. })
    ));

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

    let reject_processing = repository
        .reject_funding_request(
            &pending.id,
            Some("SHOULD_NOT_APPLY"),
            Some("processing requests cannot be rejected"),
        )
        .await;
    assert!(matches!(
        reject_processing,
        Err(FundingStoreError::RequestAlreadyDecided { .. })
    ));

    let reserved = repository.funding_policy_snapshot().await?;
    assert!(reserved.public_reserved_aeko >= before_reservation.public_reserved_aeko + 5.0);

    let public_blockhash = format!("integration-public-blockhash-{suffix}");
    let intent = repository
        .set_funding_request_submission_blockhash(&pending.id, &public_blockhash)
        .await?;
    assert_eq!(
        intent.submission_blockhash.as_deref(),
        Some(public_blockhash.as_str())
    );
    assert!(repository
        .list_recoverable_processing_funding_requests(500)
        .await?
        .iter()
        .any(|request| request.id == pending.id));

    let public_signature = format!("integration-public-signature-{suffix}");
    let submitted = repository
        .set_funding_request_signature(&pending.id, &public_signature)
        .await?;
    assert_eq!(submitted.status, "submitted");
    assert_eq!(
        submitted.signature.as_deref(),
        Some(public_signature.as_str())
    );

    repository
        .mark_funding_request_observation_error(
            &pending.id,
            "FUNDING_CONFIRMATION_PENDING",
            "still pending",
        )
        .await?;
    let while_submitted = repository.funding_policy_snapshot().await?;
    assert!(while_submitted.public_reserved_aeko >= before_reservation.public_reserved_aeko + 5.0);

    // Simulate a grant row written by the pre-0012 model: same durable chain
    // signature, but no request_id linkage yet. Confirmation must adopt this
    // row rather than insert a duplicate grant and hit the signature index.
    let legacy_pool = sqlx::PgPool::connect(&database_url).await?;
    sqlx::query(
        r#"
        INSERT INTO funding_grants (
            request_id,
            address,
            amount_aeko,
            signature,
            source,
            confirmed
        )
        VALUES (NULL, $1, $2::double precision::numeric, $3, 'public', FALSE)
        "#,
    )
    .bind(&public_address)
    .bind(5.0_f64)
    .bind(&public_signature)
    .execute(&legacy_pool)
    .await?;

    let confirmed = repository.confirm_funding_request(&pending.id).await?;
    assert_eq!(confirmed.status, "confirmed");
    assert!(confirmed.confirmed);
    assert!(confirmed.confirmed_at.is_some());

    // Confirmation is idempotent and never creates a second grant.
    let confirmed_again = repository.confirm_funding_request(&pending.id).await?;
    assert_eq!(confirmed_again.status, "confirmed");

    let grants = repository.list_funding_grants(500).await?;
    let public_grants: Vec<_> = grants
        .iter()
        .filter(|grant| grant.request_id.as_deref() == Some(pending.id.as_str()))
        .collect();
    assert_eq!(public_grants.len(), 1);
    assert_eq!(public_grants[0].source, "public");
    assert!(public_grants[0].confirmed);

    let after_public = repository.funding_policy_snapshot().await?;
    assert!(after_public.public_spent_aeko >= before_reservation.public_spent_aeko + 5.0);
    assert!(after_public.public_reserved_aeko <= while_submitted.public_reserved_aeko - 5.0);

    // Daily budget attribution follows the Admin decision day, not the later
    // confirmation timestamp. A delayed confirmation after UTC midnight must
    // not migrate yesterday's reservation into today's budget.
    let rollover_before = repository.funding_policy_snapshot().await?;
    let rollover_address = format!("integration-rollover-{suffix}");
    let rollover_pending = repository
        .create_public_funding_request(&rollover_address)
        .await?;
    repository
        .reserve_public_funding_request(&rollover_pending.id)
        .await?;
    let rollover_signature = format!("integration-rollover-signature-{suffix}");
    repository
        .set_funding_request_signature(&rollover_pending.id, &rollover_signature)
        .await?;
    repository
        .confirm_funding_request(&rollover_pending.id)
        .await?;
    let rollover_confirmed_today = repository.funding_policy_snapshot().await?;
    assert!(
        rollover_confirmed_today.public_spent_aeko
            >= rollover_before.public_spent_aeko + rollover_pending.amount_aeko
    );

    sqlx::query(
        "UPDATE funding_requests SET decided_at = NOW() - INTERVAL '1 day' WHERE id = $1::uuid",
    )
    .bind(&rollover_pending.id)
    .execute(&legacy_pool)
    .await?;
    let rollover_backdated = repository.funding_policy_snapshot().await?;
    assert!(
        rollover_backdated.public_spent_aeko
            <= rollover_confirmed_today.public_spent_aeko - rollover_pending.amount_aeko
    );

    // Developer airdrops are a separate ledger and never enter grant accounting.
    let airdrop_address = format!("integration-airdrop-{suffix}");
    let airdrop = repository
        .create_funding_airdrop(&airdrop_address, 3.0)
        .await?;
    assert_eq!(airdrop.status, "processing");

    let airdrop_blockhash = format!("integration-airdrop-blockhash-{suffix}");
    repository
        .set_funding_airdrop_submission_blockhash(&airdrop.id, &airdrop_blockhash)
        .await?;
    assert!(repository
        .list_recoverable_processing_funding_airdrops(500)
        .await?
        .iter()
        .any(|entry| entry.id == airdrop.id));

    let airdrop_signature = format!("integration-airdrop-signature-{suffix}");
    let submitted_airdrop = repository
        .set_funding_airdrop_signature(&airdrop.id, &airdrop_signature)
        .await?;
    assert_eq!(submitted_airdrop.status, "submitted");

    let confirmed_airdrop = repository.confirm_funding_airdrop(&airdrop.id).await?;
    assert_eq!(confirmed_airdrop.status, "confirmed");

    let airdrops = repository.list_funding_airdrops(500).await?;
    assert!(airdrops
        .iter()
        .any(|entry| entry.signature.as_deref() == Some(airdrop_signature.as_str())));

    let grants_after_airdrop = repository.list_funding_grants(500).await?;
    assert!(!grants_after_airdrop
        .iter()
        .any(|grant| grant.signature.as_deref() == Some(airdrop_signature.as_str())));

    let after_airdrop = repository.funding_policy_snapshot().await?;
    assert_eq!(
        after_airdrop.public_spent_aeko,
        after_public.public_spent_aeko
    );
    assert_eq!(
        after_airdrop.public_reserved_aeko,
        after_public.public_reserved_aeko
    );

    // A terminal failed grant releases the reservation and never records a grant.
    let failed_address = format!("integration-failed-{suffix}");
    let failed_pending = repository
        .create_public_funding_request(&failed_address)
        .await?;
    repository
        .reserve_public_funding_request(&failed_pending.id)
        .await?;
    let failed_blockhash = format!("integration-failed-blockhash-{suffix}");
    repository
        .set_funding_request_submission_blockhash(&failed_pending.id, &failed_blockhash)
        .await?;
    let failed_signature = format!("integration-failed-signature-{suffix}");
    repository
        .set_funding_request_signature(&failed_pending.id, &failed_signature)
        .await?;
    let before_failure = repository.funding_policy_snapshot().await?;
    let failed = repository
        .mark_funding_request_failed(
            &failed_pending.id,
            "FUNDING_TRANSACTION_FAILED",
            "test failure",
        )
        .await?;
    assert_eq!(failed.status, "failed");

    let after_failure = repository.funding_policy_snapshot().await?;
    assert!(
        after_failure.public_reserved_aeko
            <= before_failure.public_reserved_aeko - failed.amount_aeko
    );
    let grants_after_failure = repository.list_funding_grants(500).await?;
    assert!(!grants_after_failure
        .iter()
        .any(|grant| grant.signature.as_deref() == Some(failed_signature.as_str())));

    Ok(())
}
