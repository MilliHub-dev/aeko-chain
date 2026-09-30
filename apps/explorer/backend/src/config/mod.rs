//! Strict environment-backed configuration for the Explorer backend.
//!
//! Production must never guess its RPC endpoint, database, deployment
//! identity, readiness policy, or indexing cadence. All environment-specific
//! values are required and documented in `.env.example`.

use {
    anyhow::{anyhow, Context, Result},
    axum::http::HeaderValue,
    std::{collections::HashSet, env, net::SocketAddr, time::Duration},
    url::Url,
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
    pub reset_chain_on_start: bool,
}

impl ExplorerBackendConfig {
    pub fn from_env() -> Result<Self> {
        let network = required_env("AEKO_NETWORK")?;
        validate_network(&network)?;
        let rpc_url = required_env("AEKO_RPC_URL")?;
        let websocket_url = optional_env("AEKO_WS_URL");
        let start_slot = required_parse_env::<u64>("AEKO_EXPLORER_START_SLOT")?;
        let max_batch_size = required_nonzero::<usize>("AEKO_EXPLORER_MAX_BATCH_SIZE")?;
        let persist_socialfi_views =
            required_parse_env::<bool>("AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS")?;
        let database_url = optional_env("AEKO_EXPLORER_DATABASE_URL")
            .or_else(|| optional_env("DATABASE_URL"))
            .ok_or_else(|| {
                anyhow!("PostgreSQL is required: set AEKO_EXPLORER_DATABASE_URL or DATABASE_URL")
            })?;
        let db_max_connections = required_nonzero::<u32>("AEKO_EXPLORER_DB_MAX_CONNECTIONS")?;
        let db_min_connections = required_nonzero::<u32>("AEKO_EXPLORER_DB_MIN_CONNECTIONS")?;
        if db_min_connections > db_max_connections {
            return Err(anyhow!(
                "AEKO_EXPLORER_DB_MIN_CONNECTIONS cannot exceed AEKO_EXPLORER_DB_MAX_CONNECTIONS"
            ));
        }
        let db_acquire_timeout = required_duration("AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS")?;
        let rpc_timeout = required_duration("AEKO_EXPLORER_RPC_TIMEOUT_SECS")?;
        let asset_refresh_slots = required_nonzero::<u64>("AEKO_EXPLORER_ASSET_REFRESH_SLOTS")?;
        let social_refresh_slots = required_nonzero::<u64>("AEKO_EXPLORER_SOCIAL_REFRESH_SLOTS")?;
        let max_ready_lag_slots = required_parse_env::<u64>("AEKO_EXPLORER_MAX_READY_LAG_SLOTS")?;
        let reset_chain_on_start = optional_bool_env("AEKO_RESET_LEDGER")?;

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
            asset_refresh_slots,
            social_refresh_slots,
            max_ready_lag_slots,
            reset_chain_on_start,
        })
    }
}

#[derive(Clone, PartialEq)]
pub struct FundingControlConfig {
    pub authorization_key: Option<String>,
    pub requests_per_10_min: u32,
    pub faucet_per_request_cap_aeko: f64,
    pub reconcile_interval: Duration,
}

impl std::fmt::Debug for FundingControlConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FundingControlConfig")
            .field(
                "funding_authorization_required",
                &self.authorization_key.is_some(),
            )
            .field("requests_per_10_min", &self.requests_per_10_min)
            .field(
                "faucet_per_request_cap_aeko",
                &self.faucet_per_request_cap_aeko,
            )
            .field("reconcile_interval", &self.reconcile_interval)
            .finish()
    }
}

impl FundingControlConfig {
    pub fn from_env(network: &str) -> Result<Self> {
        let authorization_key = optional_env("AEKO_FUNDING_AUTHORIZATION_KEY");
        // The funding flow is network-agnostic: it never branches on the
        // deployment network. The settlement credential is required everywhere
        // except localnet, where developers run an open faucet for iteration.
        if network != "localnet" {
            let key = authorization_key.as_deref().ok_or_else(|| {
                anyhow!(
                    "AEKO_FUNDING_AUTHORIZATION_KEY is required for {network} funding settlement"
                )
            })?;
            if key.len() < 32 {
                return Err(anyhow!(
                    "AEKO_FUNDING_AUTHORIZATION_KEY must be at least 32 characters"
                ));
            }
        }

        let requests_per_10_min =
            optional_parse_env::<u32>("AEKO_FUNDING_REQUESTS_PER_10_MIN")?.unwrap_or(5);
        if requests_per_10_min == 0 {
            return Err(anyhow!(
                "AEKO_FUNDING_REQUESTS_PER_10_MIN must be greater than zero"
            ));
        }

        let faucet_per_request_cap_aeko =
            optional_parse_env::<f64>("AEKO_FAUCET_PER_REQUEST_CAP")?.unwrap_or(100.0);
        if !faucet_per_request_cap_aeko.is_finite() || faucet_per_request_cap_aeko <= 0.0 {
            return Err(anyhow!(
                "AEKO_FAUCET_PER_REQUEST_CAP must be a positive finite number"
            ));
        }

        let reconcile_interval_seconds =
            optional_parse_env::<u64>("AEKO_FUNDING_RECONCILE_INTERVAL_SECS")?.unwrap_or(5);
        if reconcile_interval_seconds == 0 {
            return Err(anyhow!(
                "AEKO_FUNDING_RECONCILE_INTERVAL_SECS must be greater than zero"
            ));
        }

        Ok(Self {
            authorization_key,
            requests_per_10_min,
            faucet_per_request_cap_aeko,
            reconcile_interval: Duration::from_secs(reconcile_interval_seconds),
        })
    }
}

pub struct SettingsControlConfig {
    pub admin_token: String,
}

impl SettingsControlConfig {
    pub fn from_env() -> Result<Self> {
        let admin_token = required_env("AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN")?;
        if admin_token.len() < 32 {
            return Err(anyhow!(
                "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN must be at least 32 characters"
            ));
        }
        Ok(Self { admin_token })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServerConfig {
    pub bind_addr: SocketAddr,
    pub request_timeout: Duration,
    pub max_body_bytes: usize,
    pub sync_interval: Duration,
    pub cors_origins: Vec<HeaderValue>,
}

impl ServerConfig {
    pub fn from_env() -> Result<Self> {
        let bind_value = required_env("AEKO_EXPLORER_BIND")?;
        let bind_addr = bind_value.parse::<SocketAddr>().with_context(|| {
            format!("AEKO_EXPLORER_BIND={bind_value:?} is not a valid host:port")
        })?;
        Ok(Self {
            bind_addr,
            request_timeout: required_duration("AEKO_EXPLORER_REQUEST_TIMEOUT_SECS")?,
            max_body_bytes: required_nonzero::<usize>("AEKO_EXPLORER_MAX_BODY_BYTES")?,
            sync_interval: required_duration("AEKO_EXPLORER_SYNC_INTERVAL_SECS")?,
            cors_origins: parse_cors_origins(&required_env("AEKO_EXPLORER_CORS_ORIGINS")?)?,
        })
    }
}

fn parse_cors_origins(value: &str) -> Result<Vec<HeaderValue>> {
    let mut seen = HashSet::new();
    let mut origins = Vec::new();

    for raw in value.split(',').map(str::trim).filter(|value| !value.is_empty()) {
        let parsed = Url::parse(raw)
            .with_context(|| format!("AEKO_EXPLORER_CORS_ORIGINS contains invalid origin {raw:?}"))?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.host_str().is_none()
            || parsed.path() != "/"
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err(anyhow!(
                "AEKO_EXPLORER_CORS_ORIGINS entry {raw:?} must be an http(s) origin without path, query, fragment, or credentials"
            ));
        }

        let origin = parsed.origin().ascii_serialization();
        if seen.insert(origin.clone()) {
            origins.push(
                origin
                    .parse::<HeaderValue>()
                    .with_context(|| format!("invalid CORS origin header value {origin:?}"))?,
            );
        }
    }

    if origins.is_empty() {
        return Err(anyhow!(
            "AEKO_EXPLORER_CORS_ORIGINS must contain at least one allowed browser origin"
        ));
    }

    Ok(origins)
}

fn validate_network(network: &str) -> Result<()> {
    match network.trim().to_ascii_lowercase().as_str() {
        "testnet" | "mainnet" | "devnet" | "localnet" => Ok(()),
        other => Err(anyhow!(
            "AEKO_NETWORK={other:?} must be testnet, mainnet, devnet, or localnet"
        )),
    }
}

fn required_env(key: &str) -> Result<String> {
    optional_env(key)
        .ok_or_else(|| anyhow!("required environment variable {key} is missing or empty"))
}
fn optional_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn optional_parse_env<T: std::str::FromStr>(key: &str) -> Result<Option<T>>
where
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    let Some(value) = optional_env(key) else {
        return Ok(None);
    };
    value
        .parse::<T>()
        .map(Some)
        .map_err(|error| anyhow!("{key}={value:?} is not parseable: {error}"))
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
fn required_nonzero<T>(key: &str) -> Result<T>
where
    T: std::str::FromStr + PartialEq + Default,
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    let value = required_parse_env::<T>(key)?;
    if value == T::default() {
        return Err(anyhow!("{key} must be greater than zero"));
    }
    Ok(value)
}
fn required_duration(key: &str) -> Result<Duration> {
    Ok(Duration::from_secs(required_nonzero::<u64>(key)?))
}

fn optional_bool_env(key: &str) -> Result<bool> {
    let Some(value) = optional_env(key) else {
        return Ok(false);
    };
    match value.to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" => Ok(false),
        _ => Err(anyhow!("{key}={value:?} must be a boolean")),
    }
}

#[cfg(test)]
impl Default for ExplorerBackendConfig {
    fn default() -> Self {
        Self {
            rpc_url: "http://127.0.0.1:8899".to_string(),
            websocket_url: None,
            network: "localnet".to_string(),
            start_slot: 0,
            max_batch_size: 256,
            persist_socialfi_views: true,
            database_url: "postgres://test:test@127.0.0.1:5432/aeko_explorer_test".to_string(),
            db_max_connections: 4,
            db_min_connections: 1,
            db_acquire_timeout: Duration::from_secs(5),
            rpc_timeout: Duration::from_secs(5),
            asset_refresh_slots: 64,
            social_refresh_slots: 16,
            max_ready_lag_slots: 128,
            reset_chain_on_start: false,
        }
    }
}

#[cfg(test)]
mod config_tests {
    use {
        super::{parse_cors_origins, validate_network, FundingControlConfig},
        std::time::Duration,
    };

    #[test]
    fn accepted_networks_match_deployable_chain_environments() {
        for network in ["testnet", "mainnet", "devnet", "localnet"] {
            validate_network(network).unwrap();
        }
        assert!(validate_network("production").is_err());
    }

    #[test]
    fn cors_origins_are_explicit_normalized_origins() {
        let origins = parse_cors_origins(
            "https://scan.aeko.online, http://localhost:5173, https://scan.aeko.online",
        )
        .unwrap();
        let rendered = origins
            .iter()
            .map(|value| value.to_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            rendered,
            vec!["https://scan.aeko.online", "http://localhost:5173"]
        );

        assert!(parse_cors_origins("https://scan.aeko.online/path").is_err());
        assert!(parse_cors_origins("*").is_err());
        assert!(parse_cors_origins(" ").is_err());
    }

    #[test]
    fn funding_control_debug_redacts_authorization_key() {
        let config = FundingControlConfig {
            authorization_key: Some("do-not-log-explorer-funding-secret".to_string()),
            requests_per_10_min: 5,
            faucet_per_request_cap_aeko: 100.0,
            reconcile_interval: Duration::from_secs(5),
        };

        let rendered = format!("{config:?}");
        assert!(!rendered.contains("do-not-log-explorer-funding-secret"));
        assert!(rendered.contains("funding_authorization_required: true"));
    }
}
