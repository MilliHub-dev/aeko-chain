use {
    crate::models::{AssetSnapshot, CoreSlotRecord, SocialSnapshot},
    anyhow::Result,
};

pub mod service;

/// Authoritative chain reads used by the indexer. Implementations may project
/// chain-wide state, but must never synthesize event rows from snapshots.
pub trait ChainDataSource: Send + Sync {
    fn latest_slot(&self) -> Result<u64>;
    fn fetch_core_slot(&self, slot: u64) -> Result<CoreSlotRecord>;
    fn fetch_asset_snapshot(&self, slot: u64) -> Result<AssetSnapshot>;
    fn fetch_social_snapshot(&self, slot: u64) -> Result<SocialSnapshot>;
}
