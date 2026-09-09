use {
    aeko_explorer_backend::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::{
            social_feed::SocialFeedCursor,
            PostgresRepository,
        },
        models::{SocialPostRecord, SocialSnapshot},
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

fn post(
    post_id: &str,
    creator: &str,
    created_at_unix: i64,
    parent_post_id: Option<&str>,
    post_kind: &str,
) -> SocialPostRecord {
    SocialPostRecord {
        post_id: post_id.to_string(),
        creator: creator.to_string(),
        content_hash: format!("hash-{post_id}"),
        metadata_hash: format!("meta-{post_id}"),
        content_uri: format!("content:{post_id}"),
        parent_post_id: parent_post_id.map(str::to_string),
        post_kind: post_kind.to_string(),
        created_at_unix,
        edited_at_unix: None,
        visibility: "public".to_string(),
        moderation_state: "active".to_string(),
        signature_ref: None,
    }
}

#[tokio::test]
async fn social_feed_cursor_preserves_equal_timestamp_posts_and_thread_root_order() -> Result<()> {
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;
    let repository = PostgresRepository::connect(&test_config(database_url)).await?;
    let creator = "social-feed-integration-creator";
    let timestamp = 1_800_000_000;

    repository
        .persist_social_snapshot(SocialSnapshot {
            slot: 9_100_000_001,
            epoch: 90,
            domains: Vec::new(),
            posts: vec![
                post("post-a", creator, timestamp, None, "original"),
                post("post-b", creator, timestamp, None, "original"),
                post("post-c", creator, timestamp, None, "original"),
                post("thread-root", creator, timestamp - 10, None, "original"),
                post("thread-reply-b", creator, timestamp - 8, Some("thread-root"), "reply"),
                post("thread-reply-a", creator, timestamp - 9, Some("thread-root"), "reply"),
            ],
            engagement: Vec::new(),
            reward_accounts: Vec::new(),
            reward_epochs: Vec::new(),
            reward_settlements: Vec::new(),
            stakes: Vec::new(),
            stake_yields: Vec::new(),
            anti_spam_profiles: Vec::new(),
            tips: Vec::new(),
            subscriptions: Vec::new(),
            unlocks: Vec::new(),
            revenues: Vec::new(),
        })
        .await?;

    let first = repository
        .list_social_feed_page(Some(creator), None, 2)
        .await?;
    assert_eq!(first.iter().map(|item| item.post_id.as_str()).collect::<Vec<_>>(), vec!["post-a", "post-b"]);

    let cursor = SocialFeedCursor {
        created_at_unix: first[1].created_at_unix,
        post_id: first[1].post_id.clone(),
    };
    let second = repository
        .list_social_feed_page(Some(creator), Some(&cursor), 4)
        .await?;
    let second_ids = second.iter().map(|item| item.post_id.as_str()).collect::<Vec<_>>();
    assert_eq!(second_ids[0], "post-c");
    assert!(!second_ids.contains(&"post-a"));
    assert!(!second_ids.contains(&"post-b"));

    let thread = repository.get_social_thread("thread-root", 10).await?;
    assert_eq!(
        thread.iter().map(|item| item.post_id.as_str()).collect::<Vec<_>>(),
        vec!["thread-root", "thread-reply-a", "thread-reply-b"],
    );

    Ok(())
}
