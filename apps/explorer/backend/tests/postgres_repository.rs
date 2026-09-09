use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{
            assets::TokenTransferQuery,
            ledger::{BlockQuery, TransactionQuery},
            social::{StakeQuery, SubscriptionQuery, TipQuery, UnlockQuery, YieldQuery},
            PostgresRepository,
        },
        models::{
            AntiSpamProfileRecord, AssetSnapshot, BlockRecord, ChainAccountRecord, CoreSlotRecord,
            CreatorRevenueRecord, CreatorRewardRecord, CreatorTipRecord, EngagementRecord, NftRecord,
            PaidContentUnlockRecord, RewardSettlementRecord, SocialDomainSnapshotRecord,
            SocialPostRecord, SocialRewardAccountRecord, SocialSnapshot, SocialStakeRecord,
            StakeYieldRecord, SubscriptionRecord, TokenAccountRecord, TokenMintRecord,
            TokenTransferRecord, TransactionAccountRecord, TransactionRecord,
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
async fn postgres_cursor_filters_assets_and_social_are_durable() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;

    let slot = 9_000_000_001u64;
    let signer = "11111111111111111111111111111111".to_string();
    let other = "22222222222222222222222222222222".to_string();
    let mint = "33333333333333333333333333333333".to_string();
    let participant = "44444444444444444444444444444444".to_string();
    let replacement_participant = "55555555555555555555555555555555".to_string();

    repository.persist_core_slot(CoreSlotRecord {
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
            TransactionAccountRecord { signature: "integration-signature-match".to_string(), account_index: 0, address: signer.clone() },
            TransactionAccountRecord { signature: "integration-signature-match".to_string(), account_index: 1, address: participant.clone() },
            TransactionAccountRecord { signature: "integration-signature-other".to_string(), account_index: 0, address: other.clone() },
        ],
        token_transfers: vec![
            TokenTransferRecord { mint: mint.clone(), source: "source-token-account".to_string(), destination: "destination-token-account".to_string(), amount: "25".to_string(), signature: "integration-signature-match".to_string(), event_index: "0".to_string(), slot },
            TokenTransferRecord { mint: mint.clone(), source: "stale-source-token-account".to_string(), destination: "stale-destination-token-account".to_string(), amount: "99".to_string(), signature: "integration-signature-other".to_string(), event_index: "0".to_string(), slot },
        ],
    }).await?;

    assert_eq!(repository.next_core_slot(0).await?, slot + 1);
    let blocks = repository.list_blocks(&BlockQuery { after: Some(slot - 1), limit: 1, ..BlockQuery::default() }).await?;
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].slot, slot);

    let transactions = repository.list_transactions(&TransactionQuery {
        address: Some(signer.clone()), success: Some(true), limit: 5, ..TransactionQuery::default()
    }).await?;
    assert_eq!(transactions.len(), 1);

    let participant_transactions = repository.list_transactions(&TransactionQuery {
        address: Some(participant.clone()), success: Some(true), limit: 5, ..TransactionQuery::default()
    }).await?;
    assert_eq!(participant_transactions.len(), 1);

    repository.persist_core_slot(CoreSlotRecord {
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
            signature: "integration-signature-match".to_string(), slot, success: true, fee: 5_000,
            primary_program: Some("program-a".to_string()), signer: Some(signer.clone()),
        }],
        transaction_accounts: vec![
            TransactionAccountRecord { signature: "integration-signature-match".to_string(), account_index: 0, address: signer.clone() },
            TransactionAccountRecord { signature: "integration-signature-match".to_string(), account_index: 1, address: replacement_participant.clone() },
        ],
        token_transfers: vec![TokenTransferRecord {
            mint: mint.clone(), source: "source-token-account".to_string(), destination: "destination-token-account".to_string(),
            amount: "25".to_string(), signature: "integration-signature-match".to_string(), event_index: "0".to_string(), slot,
        }],
    }).await?;

    let finalized_block = repository.get_block(slot).await?.context("finalized replacement block should exist")?;
    assert_eq!(finalized_block.blockhash, "integration-finalized-blockhash");
    let stale = repository.list_transactions(&TransactionQuery { address: Some(participant), limit: 5, ..TransactionQuery::default() }).await?;
    assert!(stale.is_empty());
    let replacement = repository.list_transactions(&TransactionQuery { address: Some(replacement_participant), limit: 5, ..TransactionQuery::default() }).await?;
    assert_eq!(replacement.len(), 1);
    assert!(repository.get_transaction("integration-signature-other").await?.is_none());

    let transfers = repository.list_token_transfers(&TokenTransferQuery { mint: Some(mint.clone()), limit: 5, ..TokenTransferQuery::default() }).await?;
    assert_eq!(transfers.len(), 1);
    assert_eq!(transfers[0].amount, "25");

    repository.persist_asset_snapshot(AssetSnapshot {
        slot,
        token_mints: vec![TokenMintRecord {
            mint: mint.clone(), mint_authority: None, freeze_authority: None, name: "Integration Token".to_string(),
            symbol: "ITEST".to_string(), decimals: 6, total_supply: "1000000".to_string(), supply_cap: None,
            metadata_uri: None, mint_policy: "fixed-supply".to_string(), last_seen_slot: slot,
        }],
        token_accounts: vec![
            TokenAccountRecord { address: "token-account-a".to_string(), owner: signer.clone(), mint: mint.clone(), balance: "25".to_string(), frozen: false, last_seen_slot: slot },
            TokenAccountRecord { address: "token-account-b".to_string(), owner: signer.clone(), mint: mint.clone(), balance: "0".to_string(), frozen: false, last_seen_slot: slot },
        ],
        nft_collections: Vec::new(),
        nfts: vec![NftRecord { token_id: "integration-nft".to_string(), collection_id: None, owner: signer.clone(), creator: other, metadata_uri: Some("https://example.invalid/integration-nft.json".to_string()), frozen: false, last_seen_slot: slot }],
    }).await?;
    repository.mark_projection_slot("assets", slot).await?;
    assert_eq!(repository.latest_projection_slot("assets").await?, Some(slot));

    let summary = repository.get_token_summary(&mint, 5).await?.context("token summary should exist")?;
    assert_eq!(summary.total_supply, "1000000");
    assert_eq!(summary.holder_count, 1);

    let social_slot = slot + 10;
    repository.persist_social_snapshot(SocialSnapshot {
        slot: social_slot,
        epoch: 77,
        domains: vec![
            SocialDomainSnapshotRecord { domain: "posts".into(), state_account: "posts-state".into(), program_id: "posts-program".into(), slot: social_slot, epoch: 77, item_count: 2 },
            SocialDomainSnapshotRecord { domain: "rewards".into(), state_account: "rewards-state".into(), program_id: "rewards-program".into(), slot: social_slot, epoch: 77, item_count: 3 },
            SocialDomainSnapshotRecord { domain: "staking".into(), state_account: "staking-state".into(), program_id: "staking-program".into(), slot: social_slot, epoch: 77, item_count: 2 },
            SocialDomainSnapshotRecord { domain: "anti-spam".into(), state_account: "anti-spam-state".into(), program_id: "anti-spam-program".into(), slot: social_slot, epoch: 77, item_count: 1 },
            SocialDomainSnapshotRecord { domain: "monetization".into(), state_account: "monetization-state".into(), program_id: "monetization-program".into(), slot: social_slot, epoch: 77, item_count: 4 },
        ],
        posts: vec![SocialPostRecord {
            post_id: "post-1".into(), creator: signer.clone(), content_hash: "content-hash".into(), metadata_hash: "metadata-hash".into(),
            content_uri: "https://example.invalid/post".into(), parent_post_id: None, post_kind: "original".into(), created_at_unix: 1_700_000_100,
            edited_at_unix: Some(1_700_000_101), visibility: "public".into(), moderation_state: "active".into(), signature_ref: Some("signature-ref".into()),
        }],
        engagement: vec![EngagementRecord {
            proof_id: "proof-1".into(), actor: signer.clone(), target_creator: signer.clone(), target_post_id: Some("post-1".into()),
            action_kind: "like".into(), action_weight: 1, slot: social_slot, unix_timestamp: 1_700_000_102, replay_guard: "guard-1".into(),
        }],
        reward_accounts: vec![SocialRewardAccountRecord { creator: signer.clone(), total_earned: "100".into(), total_claimed: "40".into(), claimable_amount: 60, last_settled_epoch: 77 }],
        reward_epochs: vec![CreatorRewardRecord { creator: signer.clone(), epoch: 77, earned_points: "123".into(), reward_amount: 100, claimed_amount: 40, claimable_amount: 60, penalty_bps: 50 }],
        reward_settlements: vec![RewardSettlementRecord { epoch: 77, reward_pool_amount: 1000, total_effective_points: "123".into(), settled_creator_count: 1 }],
        stakes: vec![SocialStakeRecord { position_id: "stake-1".into(), staker: signer.clone(), creator: signer.clone(), staked_amount: 500, activated_at_epoch: 70, unlock_epoch: Some(80), state: "active".into(), accumulated_yield: 12, claimed_yield: 2 }],
        stake_yields: vec![StakeYieldRecord { epoch: 77, position_id: "stake-1".into(), creator: signer.clone(), staker: signer.clone(), yield_amount: 10 }],
        anti_spam_profiles: vec![AntiSpamProfileRecord { wallet: signer.clone(), post_count_window: 3, engagement_count_window: 8, spam_flags: 1, gated_until_epoch: None, slash_count: 0, last_flagged_at_unix: Some(1_700_000_103), reputation_score: 950 }],
        tips: vec![CreatorTipRecord { tip_id: "tip-1".into(), creator: signer.clone(), sender: "sender-1".into(), amount: 9, timestamp: 1_700_000_104 }],
        subscriptions: vec![SubscriptionRecord { subscription_id: "subscription-1".into(), creator: signer.clone(), subscriber: "subscriber-1".into(), amount_per_period: 20, period_seconds: 86_400, started_at_unix: 1_700_000_000, valid_until_unix: 1_700_086_400, state: "active".into() }],
        unlocks: vec![PaidContentUnlockRecord { unlock_id: "unlock-1".into(), content_id: "content-1".into(), creator: signer.clone(), buyer: "buyer-1".into(), amount: 5, unlocked_at_unix: 1_700_000_105 }],
        revenues: vec![CreatorRevenueRecord { creator: signer.clone(), total_earned: "34".into(), total_claimed: "10".into(), claimable_amount: 24 }],
    }).await?;

    assert_eq!(repository.latest_projection_slot("social").await?, Some(social_slot));
    assert_eq!(repository.reputation_score(&signer).await?, Some(950));
    assert_eq!(repository.list_social_domains().await?.len(), 5);
    assert_eq!(repository.list_reward_accounts(Some(&signer), 5).await?.len(), 1);
    assert_eq!(repository.list_reward_settlements(5).await?.len(), 1);
    assert_eq!(repository.list_stake_yields(&YieldQuery { wallet: Some(signer.clone()), limit: 5, ..YieldQuery::default() }).await?.len(), 1);
    assert_eq!(repository.list_anti_spam_profiles(Some(&signer), 5).await?.len(), 1);
    assert_eq!(repository.list_tips(&TipQuery { creator: Some(signer.clone()), limit: 5, ..TipQuery::default() }).await?.len(), 1);
    assert_eq!(repository.list_subscriptions(&SubscriptionQuery { creator: Some(signer.clone()), limit: 5, ..SubscriptionQuery::default() }).await?.len(), 1);
    assert_eq!(repository.list_unlocks(&UnlockQuery { creator: Some(signer.clone()), limit: 5, ..UnlockQuery::default() }).await?.len(), 1);
    assert_eq!(repository.list_creator_revenues(Some(&signer), 5).await?.len(), 1);
    assert_eq!(repository.list_social_stakes(&StakeQuery { wallet: Some(signer.clone()), limit: 5, ..StakeQuery::default() }).await?.len(), 1);

    let detail = repository.get_account_detail_from_chain(
        ChainAccountRecord { address: signer.clone(), lamports: 42_000, owner: "11111111111111111111111111111111".to_string(), executable: false, data_len: 0 },
        5,
    ).await?;
    assert_eq!(detail.account.address, signer);
    assert_eq!(detail.profile.native_balance, Some(42_000));
    assert_eq!(detail.profile.reputation_score, Some(950));
    assert_eq!(detail.profile.token_count, 1);
    assert_eq!(detail.profile.nft_count, 1);
    assert_eq!(detail.recent_posts.len(), 1);
    assert_eq!(detail.social_stakes.len(), 1);
    assert_eq!(detail.creator_rewards.len(), 1);

    Ok(())
}
