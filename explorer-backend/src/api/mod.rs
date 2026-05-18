//! HTTP route surface. One submodule per resource (blocks, transactions,
//! tokens, …). Each submodule exposes a `router()` returning a typed
//! `Router<SharedState>`. The crate-level `router()` here composes them.
//!
//! Handlers use Axum extractors (`State`, `Path`, `Query`) and return
//! `Result<Json<DataEnvelope<T>>, ApiError>`. Filtering happens via per-
//! resource Query structs so requests are validated at extraction time —
//! malformed query strings come back as 400s without entering the handler.

use {
    crate::state::SharedState,
    axum::{routing::get, Router},
};

pub mod accounts;
pub mod blocks;
pub mod collections;
pub mod creators;
pub mod engagement;
pub mod health;
pub mod nfts;
pub mod posts;
pub mod registry;
pub mod search;
pub mod stakes;
pub mod tokens;
pub mod transactions;

mod query;

pub fn router() -> Router<SharedState> {
    Router::new()
        // Liveness — kept on both root and /health for backward compat with
        // existing Coolify/Docker healthchecks.
        .route("/", get(health::root))
        .route("/health", get(health::health))
        .merge(blocks::router())
        .merge(transactions::router())
        .merge(tokens::router())
        .merge(nfts::router())
        .merge(collections::router())
        .merge(posts::router())
        .merge(engagement::router())
        .merge(stakes::router())
        .merge(creators::router())
        .merge(accounts::router())
        .merge(registry::router())
        .merge(search::router())
}
