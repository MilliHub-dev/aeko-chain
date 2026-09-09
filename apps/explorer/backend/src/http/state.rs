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
}

impl AppState {
    pub fn new(
        repository: PostgresRepository,
        rpc: Arc<RpcChainClient>,
        network: impl Into<String>,
        genesis_hash: impl Into<String>,
        max_ready_lag_slots: u64,
        social_enabled: bool,
    ) -> Self {
        Self {
            repository,
            rpc,
            network: network.into(),
            genesis_hash: genesis_hash.into(),
            max_ready_lag_slots,
            social_enabled,
        }
    }

    pub fn shared(self) -> SharedState {
        Arc::new(self)
    }
}
