//! Feature-oriented HTTP surface. Each feature owns its routes, query
//! contracts, and composition against live RPC and/or durable PostgreSQL.

use {crate::state::SharedState, axum::Router};

pub mod accounts;
pub mod assets;
pub mod health;
pub mod ledger;
pub mod search;
pub mod social;
pub mod social_feed;

const DEFAULT_LIST_LIMIT: usize = 25;
const MAX_LIST_LIMIT: usize = 500;

pub(crate) fn clamp_limit(value: Option<usize>) -> usize {
    value.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT)
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .merge(health::router())
        .merge(ledger::router())
        .merge(accounts::router())
        .merge(assets::router())
        .merge(social::router())
        .merge(social_feed::router())
        .merge(search::router())
}
