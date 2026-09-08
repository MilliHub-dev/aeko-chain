use {
    crate::models::{
        AssetSnapshot, CoreSlotRecord, CreatorRewardRecord, EngagementRecord, SocialPostRecord,
        SocialStakeRecord, WalletProfileRecord,
    },
    anyhow::Result,
};

/// Authoritative chain reads used by the indexer. Implementations may project
/// chain-wide state, but must never synthesize event rows from snapshots.
pub trait ChainDataSource: Send + Sync {
    fn latest_slot(&self) -> Result<u64>;
    fn fetch_core_slot(&self, slot: u64) -> Result<CoreSlotRecord>;
    fn fetch_asset_snapshot(&self, slot: u64) -> Result<AssetSnapshot>;
    fn fetch_social_posts(&self) -> Result<Vec<SocialPostRecord>>;
    fn fetch_creator_rewards(&self) -> Result<Vec<CreatorRewardRecord>>;
    fn fetch_engagement_events(&self) -> Result<Vec<EngagementRecord>>;
    fn fetch_social_stakes(&self) -> Result<Vec<SocialStakeRecord>>;
    fn fetch_wallet_profiles(&self, slot: u64) -> Result<Vec<WalletProfileRecord>>;
}

/// Durable projection boundary. Core slot persistence includes the cursor in
/// the same PostgreSQL transaction so an acknowledged slot can never be only
/// partially indexed.
pub trait IndexSink: Send + Sync {
    fn next_core_slot(&self, configured_start_slot: u64) -> Result<u64>;
    fn persist_core_slot(&self, slot: CoreSlotRecord) -> Result<()>;
    fn persist_asset_snapshot(&self, snapshot: AssetSnapshot) -> Result<()>;
    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()>;
    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()>;
    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()>;
    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()>;
    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()>;
}

impl<T: IndexSink + ?Sized> IndexSink for std::sync::Arc<T> {
    fn next_core_slot(&self, configured_start_slot: u64) -> Result<u64> {
        (**self).next_core_slot(configured_start_slot)
    }

    fn persist_core_slot(&self, slot: CoreSlotRecord) -> Result<()> {
        (**self).persist_core_slot(slot)
    }

    fn persist_asset_snapshot(&self, snapshot: AssetSnapshot) -> Result<()> {
        (**self).persist_asset_snapshot(snapshot)
    }

    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()> {
        (**self).persist_social_posts(posts)
    }

    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()> {
        (**self).persist_creator_rewards(rewards)
    }

    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()> {
        (**self).persist_engagement_events(events)
    }

    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()> {
        (**self).persist_social_stakes(stakes)
    }

    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()> {
        (**self).persist_wallet_profiles(profiles)
    }
}
