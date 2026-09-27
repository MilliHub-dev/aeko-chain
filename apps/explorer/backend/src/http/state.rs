use {
    crate::infrastructure::{chain::RpcChainClient, persistence::PostgresRepository},
    std::sync::Arc,
};

pub type SharedState = Arc<AppState>;

pub struct AppState {
    pub repository: PostgresRepository,
    pub rpc: Arc<RpcChainClient>,
    pub network: String,
    pub genesis_hash: String,
    pub max_ready_lag_slots: u64,
    pub social_enabled: bool,
    pub settings_admin_token: String,
    pub funding_authorization_key: Option<String>,
    pub funding_requests_per_10_min: u32,
    pub faucet_per_request_cap_aeko: f64,
    pub funding_reconcile_interval: std::time::Duration,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        repository: PostgresRepository,
        rpc: Arc<RpcChainClient>,
        network: impl Into<String>,
        genesis_hash: impl Into<String>,
        max_ready_lag_slots: u64,
        social_enabled: bool,
        settings_admin_token: impl Into<String>,
        funding_authorization_key: Option<String>,
        funding_requests_per_10_min: u32,
        faucet_per_request_cap_aeko: f64,
        funding_reconcile_interval: std::time::Duration,
    ) -> Self {
        Self {
            repository,
            rpc,
            network: network.into(),
            genesis_hash: genesis_hash.into(),
            max_ready_lag_slots,
            social_enabled,
            settings_admin_token: settings_admin_token.into(),
            funding_authorization_key,
            funding_requests_per_10_min,
            faucet_per_request_cap_aeko,
            funding_reconcile_interval,
        }
    }

    pub fn shared(self) -> SharedState {
        Arc::new(self)
    }

    pub fn is_test_environment(&self) -> bool {
        matches!(self.network.as_str(), "testnet" | "devnet" | "localnet")
    }
}
