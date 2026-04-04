#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExplorerBackendConfig {
    pub rpc_url: String,
    pub websocket_url: Option<String>,
    pub network: String,
    pub start_slot: u64,
    pub max_batch_size: usize,
    pub persist_socialfi_views: bool,
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
        }
    }
}
