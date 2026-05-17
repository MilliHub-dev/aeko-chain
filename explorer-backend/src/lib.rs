//! Public library surface.
//!
//! The crate is split into:
//!   - `api`        — Axum HTTP handlers (one module per resource)
//!   - `app`        — Router/middleware wiring
//!   - `config`     — env-driven config (`ExplorerBackendConfig`, `ServerConfig`)
//!   - `error`      — `ApiError` + `IntoResponse`
//!   - `indexer`    — chain → store sync pipeline
//!   - `models`     — record types serialized to JSON
//!   - `response`   — shared `{data, meta}` envelope
//!   - `services`   — `ExplorerApiService` composes store calls
//!   - `state`      — `AppState` shared with handlers
//!   - `store`      — `ExplorerReadStore` trait + `InMemoryExplorerStore`
//!   - `telemetry`  — tracing setup
//!
//! The production entrypoint is `src/main.rs` (binary `aeko-explorer-backend`).
//! `examples/api_server.rs` and `examples/demo_sync.rs` consume the library
//! for local-dev and ad-hoc indexer runs.

pub mod api;
pub mod app;
pub mod config;
pub mod error;
pub mod indexer;
pub mod models;
pub mod response;
pub mod services;
pub mod state;
pub mod store;
pub mod telemetry;

// Backward-compat re-exports — code that imported the v1 names keeps building.
pub use {
    config::ExplorerBackendConfig,
    indexer::{ChainDataSource, ExplorerIndexer, IndexSink, RpcChainDataSource},
    models::*,
    services::ExplorerApiService,
    store::{ExplorerReadStore, InMemoryExplorerStore, PgExplorerStore},
};

/// Boot the Axum server. Kept as a free function so `examples/api_server.rs`
/// can call it directly — same code path as `src/main.rs`, just no
/// telemetry init.
pub async fn serve_explorer_api<S>(
    store: S,
    bind_addr: std::net::SocketAddr,
    network: impl Into<String>,
) -> anyhow::Result<()>
where
    S: ExplorerReadStore + 'static,
{
    let api = ExplorerApiService::new(store);
    let state = state::AppState::new(api, network).shared();
    let server_cfg = config::ServerConfig {
        bind_addr,
        ..Default::default()
    };
    let app = app::build_router(state, &server_cfg);
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
