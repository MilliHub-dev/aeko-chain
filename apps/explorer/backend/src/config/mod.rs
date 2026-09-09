//! Strict environment-backed configuration for the Explorer backend.
//!
//! Production must never guess its RPC endpoint, database, deployment
//! identity, readiness policy, or indexing cadence. All environment-specific
//! values are required and documented in `.env.example`.

use {
    anyhow::{anyhow, Context, Result},
    std::{env, net::SocketAddr, time::Duration},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExplorerBackendConfig {
    pub rpc_url: String,
    pub websocket_url: Option<String>,
    pub network: String,
    pub start_slot: u64,
    pub max_batch_size: usize,
    pub persist_socialfi_views: bool,
    pub database_url: String,
    pub db_max_connections: u32,
    pub db_min_connections: u32,
    pub db_acquire_timeout: Duration,
    pub rpc_timeout: Duration,
    pub asset_refresh_slots: u64,
    pub social_refresh_slots: u64,
    pub max_ready_lag_slots: u64,
}

impl ExplorerBackendConfig {
    pub fn from_env() -> Result<Self> {
        let rpc_url = required_env("AEKO_EXPLORER_RPC")?;
        let websocket_url = optional_env("AEKO_EXPLORER_WS");
        let network = required_env("AEKO_EXPLORER_NETWORK")?;
        let start_slot = required_parse_env::<u64>("AEKO_EXPLORER_START_SLOT")?;
        let max_batch_size = required_nonzero::<usize>("AEKO_EXPLORER_MAX_BATCH_SIZE")?;
        let persist_socialfi_views = required_parse_env::<bool>("AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS")?;
        let database_url = optional_env("AEKO_EXPLORER_DATABASE_URL")
            .or_else(|| optional_env("DATABASE_URL"))
            .ok_or_else(|| anyhow!("PostgreSQL is required: set AEKO_EXPLORER_DATABASE_URL or DATABASE_URL"))?;
        let db_max_connections = required_nonzero::<u32>("AEKO_EXPLORER_DB_MAX_CONNECTIONS")?;
        let db_min_connections = required_nonzero::<u32>("AEKO_EXPLORER_DB_MIN_CONNECTIONS")?;
        if db_min_connections > db_max_connections {
            return Err(anyhow!("AEKO_EXPLORER_DB_MIN_CONNECTIONS cannot exceed AEKO_EXPLORER_DB_MAX_CONNECTIONS"));
        }
        let db_acquire_timeout = required_duration("AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS")?;
        let rpc_timeout = required_duration("AEKO_EXPLORER_RPC_TIMEOUT_SECS")?;
        let asset_refresh_slots = required_nonzero::<u64>("AEKO_EXPLORER_ASSET_REFRESH_SLOTS")?;
        let social_refresh_slots = required_nonzero::<u64>("AEKO_EXPLORER_SOCIAL_REFRESH_SLOTS")?;
        let max_ready_lag_slots = required_parse_env::<u64>("AEKO_EXPLORER_MAX_READY_LAG_SLOTS")?;

        Ok(Self { rpc_url, websocket_url, network, start_slot, max_batch_size, persist_socialfi_views,
            database_url, db_max_connections, db_min_connections, db_acquire_timeout, rpc_timeout,
            asset_refresh_slots, social_refresh_slots, max_ready_lag_slots })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServerConfig {
    pub bind_addr: SocketAddr,
    pub request_timeout: Duration,
    pub max_body_bytes: usize,
    pub sync_interval: Duration,
}

impl ServerConfig {
    pub fn from_env() -> Result<Self> {
        let bind_value = required_env("AEKO_EXPLORER_BIND")?;
        let bind_addr = bind_value.parse::<SocketAddr>()
            .with_context(|| format!("AEKO_EXPLORER_BIND={bind_value:?} is not a valid host:port"))?;
        Ok(Self {
            bind_addr,
            request_timeout: required_duration("AEKO_EXPLORER_REQUEST_TIMEOUT_SECS")?,
            max_body_bytes: required_nonzero::<usize>("AEKO_EXPLORER_MAX_BODY_BYTES")?,
            sync_interval: required_duration("AEKO_EXPLORER_SYNC_INTERVAL_SECS")?,
        })
    }
}

fn required_env(key: &str) -> Result<String> {
    optional_env(key).ok_or_else(|| anyhow!("required environment variable {key} is missing or empty"))
}
fn optional_env(key: &str) -> Option<String> {
    env::var(key).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}
fn required_parse_env<T: std::str::FromStr>(key: &str) -> Result<T>
where <T as std::str::FromStr>::Err: std::fmt::Display {
    let value = required_env(key)?;
    value.parse::<T>().map_err(|error| anyhow!("{key}={value:?} is not parseable: {error}"))
}
fn required_nonzero<T>(key: &str) -> Result<T>
where T: std::str::FromStr + PartialEq + Default, <T as std::str::FromStr>::Err: std::fmt::Display {
    let value = required_parse_env::<T>(key)?;
    if value == T::default() { return Err(anyhow!("{key} must be greater than zero")); }
    Ok(value)
}
fn required_duration(key: &str) -> Result<Duration> {
    Ok(Duration::from_secs(required_nonzero::<u64>(key)?))
}

#[cfg(test)]
impl Default for ExplorerBackendConfig {
    fn default() -> Self {
        Self {
            rpc_url: "http://127.0.0.1:8899".to_string(), websocket_url: None, network: "test".to_string(),
            start_slot: 0, max_batch_size: 256, persist_socialfi_views: true,
            database_url: "postgres://test:test@127.0.0.1:5432/aeko_explorer_test".to_string(),
            db_max_connections: 4, db_min_connections: 1, db_acquire_timeout: Duration::from_secs(5),
            rpc_timeout: Duration::from_secs(5), asset_refresh_slots: 64, social_refresh_slots: 16,
            max_ready_lag_slots: 128,
        }
    }
}
