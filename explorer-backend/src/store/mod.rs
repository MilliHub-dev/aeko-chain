//! `ExplorerReadStore` trait — the read-side contract Axum handlers go
//! through. `IndexSink` (defined in `indexer`) is the write-side contract
//! the sync pipeline goes through. Implementors implement both:
//!   - `memory::InMemoryExplorerStore` — process-local HashMap, default.
//!   - `postgres::PgExplorerStore`     — durable Postgres-backed, used when
//!                                       `DATABASE_URL` is set.
//!
//! Both impls keep the same trait surface; `main.rs` picks one at boot.

use {
    crate::models::{
        BlockRecord, CreatorRewardRecord, EngagementRecord, NftRecord, SearchResultRecord,
        SocialPostRecord, SocialStakeRecord, TokenTransferRecord, TransactionRecord,
        WalletProfileRecord,
    },
    anyhow::Result,
};

pub mod memory;
pub mod postgres;

pub use {memory::InMemoryExplorerStore, postgres::PgExplorerStore};

/// Read-only view of the explorer store. Implementors are responsible for
/// thread-safety; the trait is `Send + Sync` because Axum handlers hold a
/// reference via `Arc<AppState>`.
pub trait ExplorerReadStore: Send + Sync {
    fn list_blocks(&self, limit: usize) -> Result<Vec<BlockRecord>>;
    fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>>;
    fn list_transactions(&self, limit: usize) -> Result<Vec<TransactionRecord>>;
    fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>>;
    fn list_token_transfers(
        &self,
        mint: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TokenTransferRecord>>;
    fn list_nfts(&self, collection_id: Option<&str>, limit: usize) -> Result<Vec<NftRecord>>;
    fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>>;
    fn list_posts(&self, creator: Option<&str>, limit: usize) -> Result<Vec<SocialPostRecord>>;
    fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>>;
    fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>>;
    fn list_engagement_events(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<EngagementRecord>>;
    fn list_social_stakes(
        &self,
        wallet: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialStakeRecord>>;
    fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>>;
    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>>;
}
