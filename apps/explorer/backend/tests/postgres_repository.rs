use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{
            assets::TokenTransferQuery,
            ledger::{BlockQuery, TransactionQuery},
            PostgresRepository,
        },
        models::{
            AssetSnapshot, BlockRecord, ChainAccountRecord, CoreSlotRecord, NftRecord,
            TokenAccountRecord, TokenMintRecord, TokenTransferRecord, TransactionAccountRecord,
            TransactionRecord,
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
    let participant = "44444444444444444444444444444444".to_string();
    let replacement_participant = "55555555555555555555555555555555".to_string();
    repository
        .persist_core_slot(CoreSlotRecord {
            slot,
            block: Some(BlockRecord {
                slot,
                blockhash: "integration-confirmed-blockhash".to_string(),
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
                    signer: Some(other.clone()),
                },
            ],
            transaction_accounts: vec![
                TransactionAccountRecord {
                    signature: "integration-signature-match".to_string(),
                    account_index: 0,
                    address: signer.clone(),
                },
                TransactionAccountRecord {
                    signature: "integration-signature-match".to_string(),
                    account_index: 1,
                    address: participant.clone(),
                },
                TransactionAccountRecord {
                    signature: "integration-signature-other".to_string(),
                    account_index: 0,
                    address: other.clone(),
                },
            ],
            token_transfers: vec![
                TokenTransferRecord {
                    mint: mint.clone(),
                    source: "source-token-account".to_string(),
                    destination: "destination-token-account".to_string(),
                    amount: "25".to_string(),
                    signature: "integration-signature-match".to_string(),
                    event_index: "0".to_string(),
                    slot,
                },
                TokenTransferRecord {
                    mint: mint.clone(),
                    source: "stale-source-token-account".to_string(),
                    destination: "stale-destination-token-account".to_string(),
                    amount: "99".to_string(),
                    signature: "integration-signature-other".to_string(),
                    event_index: "0".to_string(),
                    slot,
                },
            ],
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
            address: Some(signer.clone()),
            success: Some(true),
            limit: 5,
            ..TransactionQuery::default()
        })
        .await?;
    assert_eq!(transactions.len(), 1);
    assert_eq!(transactions[0].signature, "integration-signature-match");

    let participant_transactions = repository
        .list_transactions(&TransactionQuery {
            address: Some(participant.clone()),
            success: Some(true),
            limit: 5,
            ..TransactionQuery::default()
        })
        .await?;
    assert_eq!(participant_transactions.len(), 1);
    assert_eq!(
        participant_transactions[0].signature,
        "integration-signature-match"
    );

    // Replaying a slot from finalized chain data is an authoritative
    // replacement. Fork-only transactions, account memberships, and transfer
    // events from the earlier confirmed observation must disappear.
    repository
        .persist_core_slot(CoreSlotRecord {
            slot,
            block: Some(BlockRecord {
                slot,
                blockhash: "integration-finalized-blockhash".to_string(),
                parent_slot: slot - 1,
                transaction_count: 1,
                producer: None,
                unix_timestamp: Some(1_700_000_001),
            }),
            transactions: vec![TransactionRecord {
                signature: "integration-signature-match".to_string(),
                slot,
                success: true,
                fee: 5_000,
                primary_program: Some("program-a".to_string()),
                signer: Some(signer.clone()),
            }],
            transaction_accounts: vec![
                TransactionAccountRecord {
                    signature: "integration-signature-match".to_string(),
                    account_index: 0,
                    address: signer.clone(),
                },
                TransactionAccountRecord {
                    signature: "integration-signature-match".to_string(),
                    account_index: 1,
                    address: replacement_participant.clone(),
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

    let finalized_block = repository
        .get_block(slot)
        .await?
        .context("finalized replacement block should exist")?;
    assert_eq!(finalized_block.blockhash, "integration-finalized-blockhash");
    assert_eq!(finalized_block.transaction_count, 1);

    let stale = repository
        .list_transactions(&TransactionQuery {
            address: Some(participant),
            limit: 5,
            ..TransactionQuery::default()
        })
        .await?;
    assert!(stale.is_empty());
    let replacement = repository
        .list_transactions(&TransactionQuery {
            address: Some(replacement_participant),
            limit: 5,
            ..TransactionQuery::default()
        })
        .await?;
    assert_eq!(replacement.len(), 1);
    assert_eq!(replacement[0].signature, "integration-signature-match");
    assert!(repository
        .get_transaction("integration-signature-other")
        .await?
        .is_none());

    let transfers = repository
        .list_token_transfers(&TokenTransferQuery {
            mint: Some(mint.clone()),
            limit: 5,
            ..TokenTransferQuery::default()
        })
        .await?;
    assert_eq!(transfers.len(), 1);
    assert_eq!(transfers[0].event_index, "0");
    assert_eq!(transfers[0].amount, "25");

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
                    owner: signer.clone(),
                    mint: mint.clone(),
                    balance: "25".to_string(),
                    frozen: false,
                    last_seen_slot: slot,
                },
                TokenAccountRecord {
                    address: "token-account-b".to_string(),
                    owner: signer.clone(),
                    mint: mint.clone(),
                    balance: "0".to_string(),
                    frozen: false,
                    last_seen_slot: slot,
                },
            ],
            nft_collections: Vec::new(),
            nfts: vec![NftRecord {
                token_id: "integration-nft".to_string(),
                collection_id: None,
                owner: signer.clone(),
                creator: other,
                metadata_uri: Some("https://example.invalid/integration-nft.json".to_string()),
                frozen: false,
                last_seen_slot: slot,
            }],
        })
        .await?;
    let summary = repository
        .get_token_summary(&mint, 5)
        .await?
        .context("token summary should exist")?;
    assert_eq!(summary.total_supply, "1000000");
    assert_eq!(summary.holder_count, 1);
    assert_eq!(summary.recent_transfers.len(), 1);

    let detail = repository
        .get_account_detail_from_chain(
            ChainAccountRecord {
                address: signer.clone(),
                lamports: 42_000,
                owner: "11111111111111111111111111111111".to_string(),
                executable: false,
                data_len: 0,
            },
            None,
            5,
        )
        .await?;
    assert_eq!(detail.account.address, signer);
    assert_eq!(detail.profile.native_balance, Some(42_000));
    assert_eq!(detail.profile.token_count, 1);
    assert_eq!(detail.profile.nft_count, 1);
    assert_eq!(detail.token_holdings.len(), 1);
    assert_eq!(detail.token_holdings[0].balance, "25");
    assert_eq!(detail.nft_holdings.len(), 1);
    assert_eq!(detail.nft_holdings[0].token_id, "integration-nft");
    assert_eq!(detail.recent_transactions.len(), 1);

    Ok(())
}
