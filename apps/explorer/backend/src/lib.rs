//! AEKO Explorer backend.
//!
//! Production data flow is deliberately explicit:
//! validator RPC -> indexing -> PostgreSQL -> feature routes. PostgreSQL is
//! the durable Explorer system of record; live account/readiness data comes
//! directly from the configured validator RPC. No production in-memory store
//! or simulated chain-data fallback is exported by this crate.

pub mod app;
pub mod config;
pub mod error;
pub mod features;
pub mod indexing;
pub mod infrastructure;
pub mod models;
pub mod response;
pub mod state;
pub mod telemetry;

pub use {
    config::{ExplorerBackendConfig, ServerConfig},
    indexing::{service::IndexerService, ChainDataSource},
    infrastructure::{
        chain::RpcChainClient,
        persistence::PostgresRepository,
        social::CanonicalChainDataSource,
    },
};
