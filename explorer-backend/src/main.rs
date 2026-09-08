//! `aeko-explorer-backend` — production binary.
//!
//! Boot sequence:
//!   1. Init tracing.
//!   2. Load config from env.
//!   3. Pick the storage backend:
//!        - `DATABASE_URL` set → `PgExplorerStore::connect()` (runs migrations).
//!        - unset → `InMemoryExplorerStore::new()` (local dev / smoke tests).
//!   4. Wire the store as both `IndexSink` (writes) and `ExplorerReadStore`
//!      (reads) — same instance behind two trait objects.
//!   5. Spawn catch-up + live-sync off-thread so the HTTP server binds
//!      immediately. Core block/transaction indexing is isolated from optional
//!      token/NFT/SocialFi projection refreshes so an RPC enrichment failure
//!      cannot freeze the Explorer cursor.
//!   6. Serve.

use {
    aeko_explorer_backend::{
        app, config,
        indexer::IndexSink,
        services::ExplorerApiService,
        state::AppState,
        store::{ExplorerReadStore, InMemoryExplorerStore, PgExplorerStore},
        telemetry, ChainDataSource, RpcChainDataSource,
    },
    anyhow::{Context, Result},
    std::sync::Arc,
    tokio::net::TcpListener,
};

// Program-account snapshots are chain-wide views, not per-slot events. Running
// the same getProgramAccounts scans for every slot is wasteful and, more
// importantly, previously allowed one optional projection error to stop block
// and transaction indexing forever. Social views refresh more frequently than
// token/NFT inventory while core block/transaction ingestion stays per-slot.
const SOCIAL_VIEW_REFRESH_SLOTS: u64 = 16;
const ASSET_VIEW_REFRESH_SLOTS: u64 = 64;

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init();

    let backend_cfg = config::ExplorerBackendConfig::from_env()
        .context("loading explorer backend config from env")?;
    let server_cfg = config::ServerConfig::from_env().context("loading server config from env")?;

    let store_label = if backend_cfg.database_url.is_some() {
        "postgres"
    } else {
        "in-memory"
    };
    tracing::info!(
        rpc = %backend_cfg.rpc_url,
        network = %backend_cfg.network,
        bind = %server_cfg.bind_addr,
        start_slot = backend_cfg.start_slot,
        store = store_label,
        "explorer-backend starting"
    );

    let (read_store, sink): (Arc<dyn ExplorerReadStore>, Arc<dyn IndexSink>) =
        match backend_cfg.database_url.as_deref() {
            Some(url) => {
                let pg = PgExplorerStore::connect(url)
                    .await
                    .context("initializing postgres store")?;
                let pg = Arc::new(pg);
                (pg.clone(), pg)
            }
            None => {
                let mem = Arc::new(InMemoryExplorerStore::new());
                (mem.clone(), mem)
            }
        };

    let data_source = RpcChainDataSource::new(backend_cfg.clone());

    // Catch-up + live-sync. All RPC and synchronous store work runs inside
    // spawn_blocking because the Postgres store bridges sync traits to sqlx.
    let start_slot = backend_cfg.start_slot;
    let sync_interval = server_cfg.sync_interval;
    let persist_socialfi_views = backend_cfg.persist_socialfi_views;
    let sync_source = data_source.clone();
    let sync_sink = Arc::clone(&sink);
    tokio::spawn(async move {
        let initial_target_task = {
            let data_source = sync_source.clone();
            tokio::task::spawn_blocking(move || data_source.latest_slot())
        };
        let initial_target = match initial_target_task.await {
            Ok(Ok(slot)) => slot,
            Ok(Err(e)) => {
                tracing::error!(error = %e, "latest_slot() failed at boot; deferring catch-up");
                start_slot.saturating_sub(1)
            }
            Err(e) => {
                tracing::error!(error = %e, "spawn_blocking panicked at boot");
                start_slot.saturating_sub(1)
            }
        };

        // Track the next slot that still needs core ingestion. Unlike a
        // last-synced cursor this works for start_slot=0 without underflow and,
        // crucially, remains unchanged when catch-up fails.
        let mut next_slot = start_slot;
        if initial_target >= start_slot {
            let data_source = sync_source.clone();
            let sink = Arc::clone(&sync_sink);
            let result = tokio::task::spawn_blocking(move || {
                sync_range_resilient(
                    &data_source,
                    &sink,
                    start_slot,
                    initial_target,
                    persist_socialfi_views,
                )
            })
            .await;
            match result {
                Ok(Ok(())) => {
                    next_slot = initial_target.saturating_add(1);
                    tracing::info!(through_slot = initial_target, "initial catch-up complete");
                }
                Ok(Err(e)) => tracing::error!(error = %e, retry_from = next_slot, "initial catch-up failed; live sync will retry"),
                Err(e) => tracing::error!(error = %e, retry_from = next_slot, "catch-up task panicked; live sync will retry"),
            }
        }

        loop {
            tokio::time::sleep(sync_interval).await;
            let data_source = sync_source.clone();
            let sink = Arc::clone(&sync_sink);
            let result = tokio::task::spawn_blocking(move || {
                let latest = data_source.latest_slot()?;
                if latest >= next_slot {
                    sync_range_resilient(
                        &data_source,
                        &sink,
                        next_slot,
                        latest,
                        persist_socialfi_views,
                    )?;
                    Ok::<u64, anyhow::Error>(latest.saturating_add(1))
                } else {
                    Ok::<u64, anyhow::Error>(next_slot)
                }
            })
            .await;
            match result {
                Ok(Ok(new_next_slot)) => next_slot = new_next_slot,
                Ok(Err(e)) => tracing::warn!(error = %e, retry_from = next_slot, "live sync core tick failed"),
                Err(e) => tracing::error!(error = %e, retry_from = next_slot, "live sync task panicked"),
            }
        }
    });

    let api = ExplorerApiService::from_arc(read_store);
    let state = AppState::new(api, backend_cfg.network.clone()).shared();
    let app = app::build_router(state, &server_cfg);

    let listener = TcpListener::bind(server_cfg.bind_addr)
        .await
        .with_context(|| format!("binding to {}", server_cfg.bind_addr))?;
    tracing::info!(addr = %server_cfg.bind_addr, "serving explorer api");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum::serve failed")?;

    Ok(())
}

fn sync_range_resilient(
    data_source: &RpcChainDataSource,
    sink: &Arc<dyn IndexSink>,
    start_slot: u64,
    end_slot: u64,
    persist_socialfi_views: bool,
) -> Result<()> {
    for slot in start_slot..=end_slot {
        sync_slot_resilient(data_source, sink, slot, persist_socialfi_views)?;
    }
    Ok(())
}

fn sync_slot_resilient(
    data_source: &RpcChainDataSource,
    sink: &Arc<dyn IndexSink>,
    slot: u64,
    persist_socialfi_views: bool,
) -> Result<()> {
    // These are the core Explorer contract. If either fails, do not advance the
    // cursor: the next live tick retries this slot and the stores are idempotent.
    if let Some(block) = data_source.fetch_block(slot)? {
        sink.persist_block(block)?;
    }
    sink.persist_transactions(data_source.fetch_transactions(slot)?)?;

    // Token/NFT/program-account snapshots must never hold the block/transaction
    // cursor hostage. Refresh periodically and keep their error causes visible.
    if slot % ASSET_VIEW_REFRESH_SLOTS == 0 {
        best_effort_projection(slot, "token transfers", || {
            sink.persist_token_transfers(data_source.fetch_token_transfers(slot)?)
        });
        best_effort_projection(slot, "nft inventory", || {
            sink.persist_nft_updates(data_source.fetch_nft_updates(slot)?)
        });
    }

    if persist_socialfi_views && slot % SOCIAL_VIEW_REFRESH_SLOTS == 0 {
        best_effort_projection(slot, "social posts", || {
            sink.persist_social_posts(data_source.fetch_social_posts(slot)?)
        });
        best_effort_projection(slot, "creator rewards", || {
            sink.persist_creator_rewards(data_source.fetch_creator_rewards(slot)?)
        });
        best_effort_projection(slot, "engagement events", || {
            sink.persist_engagement_events(data_source.fetch_engagement_events(slot)?)
        });
        best_effort_projection(slot, "social stakes", || {
            sink.persist_social_stakes(data_source.fetch_social_stakes(slot)?)
        });
    }

    if persist_socialfi_views && slot % ASSET_VIEW_REFRESH_SLOTS == 0 {
        best_effort_projection(slot, "wallet profiles", || {
            sink.persist_wallet_profiles(data_source.fetch_wallet_profiles(slot)?)
        });
    }

    Ok(())
}

fn best_effort_projection<F>(slot: u64, label: &'static str, projection: F)
where
    F: FnOnce() -> Result<()>,
{
    if let Err(error) = projection() {
        tracing::warn!(slot, projection = label, error = %error, "optional explorer projection refresh failed");
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    }
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received Ctrl-C, shutting down"),
        _ = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
