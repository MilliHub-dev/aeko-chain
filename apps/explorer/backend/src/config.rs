//! Backend configuration.
//!
//! `ExplorerBackendConfig` is the indexer-side config (RPC URL, network,
//! start-slot). `ServerConfig` is HTTP-server side (bind address, request
//! limits). Both ship `from_env()` constructors so the binary can boot from
//! environment variables alone, which is how the Docker image launches it.

use {anyhow::{anyhow, Context, Result}, std::{env, net::SocketAddr, time::Duration}};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExplorerBackendConfig {
    pub rpc_url: String,
    pub websocket_url: Option<String>,
    pub network: String,
    pub start_slot: u64,
    pub max_batch_size: usize,
    pub persist_socialfi_views: bool,
    /// Postgres DSN, e.g. `postgres://user:pass@host:5432/db`. When set the
    /// boot path uses `PgExplorerStore` and runs migrations; when unset it
    /// falls back to `InMemoryExplorerStore` so local dev works without a DB.
    pub database_url: Option<String>,
}

impl Default for ExplorerBackendConfig {
    fn default() -> Self {
        Self {
            rpc_url: "https://api.testnet.aeko.chain".to_string(),
            websocket_url: None,
            network: "testnet".to_string(),
            start_slot: 0,
            max_batch_size: 256,
            persist_socialfi_views: true,
            database_url: None,
        }
    }
}

impl ExplorerBackendConfig {
    /// Build a config from environment variables. Falls back to defaults for
    /// anything not set. Returns Err only when a value IS set but malformed.
    pub fn from_env() -> Result<Self> {
        let defaults = Self::default();
        let rpc_url = env::var("AEKO_EXPLORER_RPC").unwrap_or(defaults.rpc_url);
        let websocket_url = env::var("AEKO_EXPLORER_WS").ok();
        let network = env::var("AEKO_EXPLORER_NETWORK").unwrap_or(defaults.network);
        let start_slot = parse_env::<u64>("AEKO_EXPLORER_START_SLOT")?.unwrap_or(defaults.start_slot);
        let max_batch_size =
            parse_env::<usize>("AEKO_EXPLORER_MAX_BATCH_SIZE")?.unwrap_or(defaults.max_batch_size);
        let persist_socialfi_views = parse_env::<bool>("AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS")?
            .unwrap_or(defaults.persist_socialfi_views);
        // Either `DATABASE_URL` (Coolify convention) or `AEKO_EXPLORER_DATABASE_URL`
        // (explicit, in case the host also runs an unrelated app reading DATABASE_URL).
        let database_url = env::var("AEKO_EXPLORER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .ok()
            .filter(|v| !v.trim().is_empty());

        Ok(Self {
            rpc_url,
            websocket_url,
            network,
            start_slot,
            max_batch_size,
            persist_socialfi_views,
            database_url,
        })
    }
}

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub bind_addr: SocketAddr,
    pub request_timeout: Duration,
    /// Maximum incoming body size in bytes — 1 MiB by default. Indexer reads
    /// are GETs so the body is always empty; this is just a safety belt.
    pub max_body_bytes: usize,
    /// How often the live-sync task polls the chain for new slots.
    pub sync_interval: Duration,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind_addr: "127.0.0.1:8088".parse().expect("default bind addr parses"),
            request_timeout: Duration::from_secs(30),
            max_body_bytes: 1024 * 1024,
            sync_interval: Duration::from_secs(2),
        }
    }
}

impl ServerConfig {
    pub fn from_env() -> Result<Self> {
        let defaults = Self::default();
        let bind_addr = match env::var("AEKO_EXPLORER_BIND") {
            Ok(value) => value
                .parse::<SocketAddr>()
                .with_context(|| format!("AEKO_EXPLORER_BIND={value:?} is not a valid host:port"))?,
            Err(_) => defaults.bind_addr,
        };
        let request_timeout = parse_env::<u64>("AEKO_EXPLORER_REQUEST_TIMEOUT_SECS")?
            .map(Duration::from_secs)
            .unwrap_or(defaults.request_timeout);
        let max_body_bytes =
            parse_env::<usize>("AEKO_EXPLORER_MAX_BODY_BYTES")?.unwrap_or(defaults.max_body_bytes);
        let sync_interval = parse_env::<u64>("AEKO_EXPLORER_SYNC_INTERVAL_SECS")?
            .map(Duration::from_secs)
            .unwrap_or(defaults.sync_interval);

        Ok(Self {
            bind_addr,
            request_timeout,
            max_body_bytes,
            sync_interval,
        })
    }
}

fn parse_env<T: std::str::FromStr>(key: &str) -> Result<Option<T>>
where
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    match env::var(key) {
        Ok(value) if !value.trim().is_empty() => value
            .trim()
            .parse::<T>()
            .map(Some)
            .map_err(|e| anyhow!("{key}={value:?} is not parseable: {e}")),
        _ => Ok(None),
    }
}
