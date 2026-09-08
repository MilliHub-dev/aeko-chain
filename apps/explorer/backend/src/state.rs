//! Shared application dependencies for feature routes.

use {
    crate::{
        infrastructure::{chain::RpcChainClient, persistence::PostgresRepository},
    },
    std::sync::Arc,
};

pub type SharedState = Arc<AppState>;

pub struct AppState {
    pub repository: PostgresRepository,
    pub rpc: Arc<RpcChainClient>,
    pub network: String,
    pub max_ready_lag_slots: u64,
}

impl AppState {
    pub fn new(
        repository: PostgresRepository,
        rpc: Arc<RpcChainClient>,
        network: impl Into<String>,
        max_ready_lag_slots: u64,
    ) -> Self {
        Self {
            repository,
            rpc,
            network: network.into(),
            max_ready_lag_slots,
        }
    }

    pub fn shared(self) -> SharedState {
        Arc::new(self)
    }
}
