use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{
            assets::TokenTransferQuery,
            ledger::{BlockQuery, TransactionQuery},
            PostgresRepository,
        },
        models::{
            AssetSnapshot, BlockRecord, CoreSlotRecord, TokenAccountRecord, TokenMintRecord,
            TokenTransferRecord, TransactionRecord,
        },
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
        persist_socialfi_views: false,
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
async fn postgres_cursor_filters_and_asset_aggregates_are_durable() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    let slot = 9_000_000_001u64;
    let signer = "11111111111111111111111111111111".to_string();
    let other = "22222222222222222222222222222222".to_string();
    let mint = "33333333333333333333333333333333".to_string();
    repository
        .persist_core_slot(CoreSlotRecord {
            slot,
            block: Some(BlockRecord {
                slot,
                blockhash: "integration-blockhash".to_string(),
                parent_slot: slot - 1,
                transaction_count: 2,
                producer: None,
                unix_timestamp: Some(1_700_000_000),
            }),
            transactions: vec![
                TransactionRecord {
                    signature: "integration-signature-match".to_string(),
                    slot,
                    success: true,
                    fee: 5_000,
                    primary_program: Some("program-a".to_string()),
                    signer: Some(signer.clone()),
                },
                TransactionRecord {
                    signature: "integration-signature-other".to_string(),
                    slot,
                    success: false,
                    fee: 5_000,
                    primary_program: Some("program-b".to_string()),
                    signer: Some(other),
                },
            ],
            token_transfers: vec![TokenTransferRecord {
                mint: mint.clone(),
                source: "source-token-account".to_string(),
                destination: "destination-token-account".to_string(),
                amount: "25".to_string(),
                signature: "integration-signature-match".to_string(),
                event_index: "0".to_string(),
                slot,
            }],
        })
        .await?;

    assert_eq!(repository.next_core_slot(0).await?, slot + 1);
    let blocks = repository
        .list_blocks(&BlockQuery {
            after: Some(slot - 1),
            limit: 1,
            ..BlockQuery::default()
        })
        .await?;
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].slot, slot);

    let transactions = repository
        .list_transactions(&TransactionQuery {
            address: Some(signer),
            success: Some(true),
            limit: 5,
            ..TransactionQuery::default()
        })
        .await?;
    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].signature, "integration-signature-match");

    let transfers = repository
        .list_token_transfers(&TokenTransferQuery {
            mint: Some(mint.clone()),
            limit: 5,
            ..TokenTransferQuery::default()
        })
        .await?;
    assert_eq!(transfers.len(), 1);
    assert_eq!(transfers[0].event_index, "0");

    repository
        .persist_asset_snapshot(AssetSnapshot {
            slot,
            token_mints: vec![TokenMintRecord {
                mint: mint.clone(),
                mint_authority: None,
                freeze_authority: None,
                name: "Integration Token".to_string(),
                symbol: "ITEST".to_string(),
                decimals: 6,
                total_supply: "1000000".to_string(),
                supply_cap: None,
                metadata_uri: None,
                mint_policy: "fixed-supply".to_string(),
                last_seen_slot: slot,
            }],
            token_accounts: vec![
                TokenAccountRecord {
                    address: "token-account-a".to_string(),
                    owner: "holder-a".to_string(),
                    mint: mint.clone(),
                    balance: "25".to_string(),
                    frozen: false,
                    last_seen_slot: slot,
                },
                TokenAccountRecord {
                    address: "token-account-b".to_string(),
                    owner: "holder-b".to_string(),
                    mint: mint.clone(),
                    balance: "0".to_string(),
                    frozen: false,
                    last_seen_slot: slot,
                },
            ],
            nft_collections: Vec::new(),
            nfts: Vec::new(),
        })
        .await?;
    let summary = repository
        .get_token_summary(&mint, 5)
        .await?
        .context("token summary should exist")?;
    assert_eq!(summary.total_supply, "1000000");
    assert_eq!(summary.holder_count, 1);
    assert_eq!(summary.recent_transfers.len(), 1);

    Ok(())
}
