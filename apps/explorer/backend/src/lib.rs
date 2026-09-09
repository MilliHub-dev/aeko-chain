//! AEKO Explorer backend.
//!
//! Production data flow is deliberately explicit:
//! validator RPC -> indexing -> PostgreSQL -> feature routes. PostgreSQL is
//! the durable Explorer system of record; live account/readiness data comes
//! directly from the configured validator RPC.

pub mod bootstrap;
pub mod config;
pub mod domain;
pub mod features;
pub mod http;
pub mod indexing;
pub mod infrastructure;
pub mod observability;

// Compatibility re-exports keep feature/infrastructure imports stable while
// ownership moves under domain/http/observability. There are no loose root
// implementation files for these surfaces after the migration.
pub use domain as models;
pub use http::{error, response, state};
pub use observability as telemetry;

pub use {
    config::{ExplorerBackendConfig, ServerConfig},
    indexing::{service::IndexerService, ChainDataSource},
    infrastructure::{
        chain::RpcChainClient,
        persistence::PostgresRepository,
        social::CanonicalChainDataSource,
    },
};
