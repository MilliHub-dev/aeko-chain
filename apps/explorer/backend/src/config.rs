//! Strict environment-backed configuration for the Explorer backend.
//!
//! The production binary must never guess which chain or database it should
//! use. Connection endpoints and deployment identity are required at startup;
//! operational tuning remains explicit environment configuration as well.

use {
    anyhow::{anyhow, Context, Result},
    std::{env, net::SocketAddr, time::Duration},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExplorerBackendConfig {
    pub rpc_url: String,
    pub websocket_url: Option<String>,
    pub network: String,
    /// First slot to index when the database has no durable cursor yet.
    pub start_slot: u64,
    pub max_batch_size: usize,
    pub persist_socialfi_views: bool,
    /// Postgres is the production system of record. The backend refuses to
    /// start when neither supported database environment variable is present.
    pub database_url: String,
    pub db_max_connections: u32,
    pub db_min_connections: u32,
    pub db_acquire_timeout: Duration,
    pub rpc_timeout: Duration,
}

impl ExplorerBackendConfig {
    pub fn from_env() -> Result<Self> {
        let rpc_url = required_env("AEKO_EXPLORER_RPC")?;
        let websocket_url = optional_env("AEKO_EXPLORER_WS");
        let network = required_env("AEKO_EXPLORER_NETWORK")?;
        let start_slot = required_parse_env::<u64>("AEKO_EXPLORER_START_SLOT")?;
        let max_batch_size = required_parse_env::<usize>("AEKO_EXPLORER_MAX_BATCH_SIZE")?;
        if max_batch_size == 0 {
            return Err(anyhow!("AEKO_EXPLORER_MAX_BATCH_SIZE must be greater than zero"));
        }
        let persist_socialfi_views =
            required_parse_env::<bool>("AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS")?;
        let database_url = optional_env("AEKO_EXPLORER_DATABASE_URL")
            .or_else(|| optional_env("DATABASE_URL"))
            .ok_or_else(|| {
                anyhow!(
                    "PostgreSQL is required: set AEKO_EXPLORER_DATABASE_URL or DATABASE_URL"
                )
            })?;
        let db_max_connections =
            required_parse_env::<u32>("AEKO_EXPLORER_DB_MAX_CONNECTIONS")?;
        let db_min_connections =
            required_parse_env::<u32>("AEKO_EXPLORER_DB_MIN_CONNECTIONS")?;
        if db_max_connections == 0 || db_min_connections == 0 {
            return Err(anyhow!(
                "AEKO_EXPLORER_DB_MAX_CONNECTIONS and AEKO_EXPLORER_DB_MIN_CONNECTIONS must be greater than zero"
            ));
        }
        if db_min_connections > db_max_connections {
            return Err(anyhow!(
                "AEKO_EXPLORER_DB_MIN_CONNECTIONS cannot exceed AEKO_EXPLORER_DB_MAX_CONNECTIONS"
            ));
        }
        let db_acquire_timeout = Duration::from_secs(required_parse_env::<u64>(
            "AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS",
        )?);
        if db_acquire_timeout.is_zero() {
            return Err(anyhow!(
                "AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS must be greater than zero"
            ));
        }
        let rpc_timeout = Duration::from_secs(required_parse_env::<u64>(
            "AEKO_EXPLORER_RPC_TIMEOUT_SECS",
        )?);
        if rpc_timeout.is_zero() {
            return Err(anyhow!(
                "AEKO_EXPLORER_RPC_TIMEOUT_SECS must be greater than zero"
            ));
        }

        Ok(Self {
            rpc_url,
            websocket_url,
            network,
            start_slot,
            max_batch_size,
            persist_socialfi_views,
            database_url,
            db_max_connections,
            db_min_connections,
            db_acquire_timeout,
            rpc_timeout,
        })
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
        let bind_addr = bind_value
            .parse::<SocketAddr>()
            .with_context(|| format!("AEKO_EXPLORER_BIND={bind_value:?} is not a valid host:port"))?;
        let request_timeout = Duration::from_secs(required_parse_env::<u64>(
            "AEKO_EXPLORER_REQUEST_TIMEOUT_SECS",
        )?);
        if request_timeout.is_zero() {
            return Err(anyhow!(
                "AEKO_EXPLORER_REQUEST_TIMEOUT_SECS must be greater than zero"
            ));
        }
        let max_body_bytes = required_parse_env::<usize>("AEKO_EXPLORER_MAX_BODY_BYTES")?;
        if max_body_bytes == 0 {
            return Err(anyhow!("AEKO_EXPLORER_MAX_BODY_BYTES must be greater than zero"));
        }
        let sync_interval = Duration::from_secs(required_parse_env::<u64>(
            "AEKO_EXPLORER_SYNC_INTERVAL_SECS",
        )?);
        if sync_interval.is_zero() {
            return Err(anyhow!(
                "AEKO_EXPLORER_SYNC_INTERVAL_SECS must be greater than zero"
            ));
        }

        Ok(Self {
            bind_addr,
            request_timeout,
            max_body_bytes,
            sync_interval,
        })
    }
}

fn required_env(key: &str) -> Result<String> {
    optional_env(key).ok_or_else(|| anyhow!("required environment variable {key} is missing or empty"))
}

fn optional_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn required_parse_env<T: std::str::FromStr>(key: &str) -> Result<T>
where
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    let value = required_env(key)?;
    value
        .parse::<T>()
        .map_err(|error| anyhow!("{key}={value:?} is not parseable: {error}"))
}

#[cfg(test)]
impl Default for ExplorerBackendConfig {
    fn default() -> Self {
        Self {
            rpc_url: "http://127.0.0.1:8899".to_string(),
            websocket_url: None,
            network: "test".to_string(),
            start_slot: 0,
            max_batch_size: 256,
            persist_socialfi_views: true,
            database_url: "postgres://test:test@127.0.0.1:5432/aeko_explorer_test".to_string(),
            db_max_connections: 4,
            db_min_connections: 1,
            db_acquire_timeout: Duration::from_secs(5),
            rpc_timeout: Duration::from_secs(5),
        }
    }
}
