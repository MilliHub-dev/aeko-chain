use {
    crate::{
        config::{ExplorerBackendConfig, ServerConfig},
        http::{self, state::AppState},
        indexing::service::IndexerService,
        infrastructure::{
            chain::RpcChainClient,
            persistence::PostgresRepository,
            social::CanonicalChainDataSource,
        },
        observability,
    },
    anyhow::{Context, Result},
    std::sync::Arc,
    tokio::net::TcpListener,
};

pub async fn run() -> Result<()> {
    observability::init();
    let backend = ExplorerBackendConfig::from_env()
        .context("loading Explorer backend environment")?;
    let server = ServerConfig::from_env()
        .context("loading Explorer server environment")?;

    let repository = PostgresRepository::connect(&backend)
        .await
        .context("initializing required PostgreSQL repository")?;
    let rpc = RpcChainClient::new(backend.clone()).context("initializing validator RPC client")?;
    let startup_rpc = rpc.clone();
    tokio::task::spawn_blocking(move || startup_rpc.health())
        .await
        .context("validator RPC startup health worker panicked")??;

    tracing::info!(
        rpc = %backend.rpc_url,
        network = %backend.network,
        bind = %server.bind_addr,
        start_slot = backend.start_slot,
        "Explorer production dependencies ready"
    );

    let chain_source = Arc::new(CanonicalChainDataSource::new(rpc.clone()));
    let indexer = IndexerService::new(chain_source, repository.clone(), backend.clone());
    let sync_interval = server.sync_interval;
    tokio::spawn(async move {
        indexer.run(sync_interval).await;
    });

    let state = AppState::new(
        repository,
        Arc::new(rpc),
        backend.network.clone(),
        backend.max_ready_lag_slots,
        backend.persist_socialfi_views,
    )
    .shared();
    let router = http::build_router(state, &server);
    let listener = TcpListener::bind(server.bind_addr)
        .await
        .with_context(|| format!("binding Explorer API to {}", server.bind_addr))?;
    tracing::info!(addr = %server.bind_addr, "serving Explorer API");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Explorer HTTP server failed")?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(error = %error, "failed to install Ctrl-C handler");
        }
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => tracing::error!(error = %error, "failed to install SIGTERM handler"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received Ctrl-C, shutting down"),
        _ = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
