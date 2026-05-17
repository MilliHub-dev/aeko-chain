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
//!   5. Spawn the catch-up + live-sync tasks off-thread so the HTTP server
//!      binds RIGHT AWAY (closed port → 502 behind Traefik).
//!   6. Serve.

use {
    aeko_explorer_backend::{
        app, config,
        indexer::{ExplorerIndexer, IndexSink},
        services::ExplorerApiService,
        state::AppState,
        store::{ExplorerReadStore, InMemoryExplorerStore, PgExplorerStore},
        telemetry, ChainDataSource, RpcChainDataSource,
    },
    anyhow::{Context, Result},
    std::sync::Arc,
    tokio::net::TcpListener,
};

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

    // 3. Pick the storage backend. Each branch hands back an `Arc<dyn ...>`
    //    for the read path and an `Arc<dyn IndexSink>` for the write path —
    //    same physical object behind two trait views.
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

    // 4. Indexer. `ExplorerIndexer` is generic over `S: IndexSink`; we hand
    //    it the Arc-trait sink so the same code path drives both backends.
    let data_source = RpcChainDataSource::new(backend_cfg.clone());
    let indexer = Arc::new(ExplorerIndexer::new(backend_cfg.clone(), data_source, sink));

    // 5. Off-thread catch-up + live-sync. All chain RPC + DB writes go
    //    through `tokio::task::spawn_blocking` — the indexer's data-source
    //    methods are sync, and the PgStore deliberately calls block_on
    //    inside its trait impls (see store/postgres.rs header).
    let start_slot = backend_cfg.start_slot;
    let sync_indexer = Arc::clone(&indexer);
    let sync_interval = server_cfg.sync_interval;
    tokio::spawn(async move {
        let initial_target_task = {
            let indexer = Arc::clone(&sync_indexer);
            tokio::task::spawn_blocking(move || indexer.data_source.latest_slot())
        };
        let initial_target = match initial_target_task.await {
            Ok(Ok(slot)) => slot,
            Ok(Err(e)) => {
                tracing::error!(error = %e, "latest_slot() failed at boot; deferring catch-up");
                start_slot
            }
            Err(e) => {
                tracing::error!(error = %e, "spawn_blocking panicked at boot");
                start_slot
            }
        };

        if initial_target > start_slot {
            let indexer = Arc::clone(&sync_indexer);
            let result = tokio::task::spawn_blocking(move || {
                indexer.sync_range(start_slot, initial_target)
            })
            .await;
            match result {
                Ok(Ok(())) => {
                    tracing::info!(through_slot = initial_target, "initial catch-up complete")
                }
                Ok(Err(e)) => tracing::error!(error = %e, "initial catch-up failed"),
                Err(e) => tracing::error!(error = %e, "catch-up task panicked"),
            }
        }

        let mut last_synced_slot = initial_target;
        loop {
            tokio::time::sleep(sync_interval).await;
            let indexer = Arc::clone(&sync_indexer);
            let result = tokio::task::spawn_blocking(move || {
                let latest = indexer.data_source.latest_slot()?;
                if latest > last_synced_slot {
                    indexer.sync_range(last_synced_slot + 1, latest)?;
                    Ok::<u64, anyhow::Error>(latest)
                } else {
                    Ok::<u64, anyhow::Error>(last_synced_slot)
                }
            })
            .await;
            match result {
                Ok(Ok(new_slot)) => last_synced_slot = new_slot,
                Ok(Err(e)) => tracing::warn!(error = %e, "live sync tick failed"),
                Err(e) => tracing::error!(error = %e, "live sync task panicked"),
            }
        }
    });

    // 6. Serve. The HTTP layer only needs the read view of the store —
    //    ApiService composes the Arc<dyn ExplorerReadStore>.
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
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received Ctrl-C, shutting down"),
        _ = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
