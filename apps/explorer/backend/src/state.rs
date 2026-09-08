//! `AppState` — the type passed to every Axum handler via
//! `State<Arc<AppState>>`. Holds the read store wrapped in the service layer,
//! plus per-deployment metadata (network name) for response envelopes.
//!
//! Today the store is the in-memory implementation. When the durable store
//! lands, only this type changes: handlers stay identical because they go
//! through `services::ExplorerApiService`.

use {crate::services::ExplorerApiService, std::sync::Arc};

pub type SharedState = Arc<AppState>;

pub struct AppState {
    pub api: ExplorerApiService,
    pub network: String,
}

impl AppState {
    pub fn new(api: ExplorerApiService, network: impl Into<String>) -> Self {
        Self {
            api,
            network: network.into(),
        }
    }

    pub fn shared(self) -> SharedState {
        Arc::new(self)
    }
}
