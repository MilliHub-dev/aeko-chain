//! Canonical SocialFi chain projection.
//!
//! Social state is read only from bootstrap-registered, program-owned state
//! accounts through `getAccountInfo`. There is no `getProgramAccounts`
//! fallback for SocialFi and no fabricated local state.

use {
    crate::{
        indexing::ChainDataSource,
        infrastructure::{chain::RpcChainClient, registry::resolve_social_registry},
        models::{
            AssetSnapshot, CoreSlotRecord, CreatorRewardRecord, EngagementRecord, SocialPostRecord,
            SocialStakeRecord,
        },
    },
    anyhow::{anyhow, Result},
    aeko_social_posts_program::state::SocialPostsStateAccount,
    aeko_social_rewards_program::state::SocialRewardsStateAccount,
    aeko_social_staking_program::state::SocialStakingStateAccount,
};

#[derive(Clone)]
pub struct CanonicalChainDataSource {
    rpc: RpcChainClient,
}

impl CanonicalChainDataSource {
    pub fn new(rpc: RpcChainClient) -> Self {
        Self { rpc }
    }

    pub fn rpc(&self) -> &RpcChainClient {
        &self.rpc
    }

    fn posts_state(&self) -> Result<SocialPostsStateAccount> {
        let registry = resolve_social_registry();
        let address = registry.posts.as_deref().ok_or_else(|| {
            anyhow!("social-posts state is missing from the canonical bootstrap registry")
        })?;
        let state = self.rpc.fetch_owned_state::<SocialPostsStateAccount>(
            address,
            aeko_social_posts_program::id(),
            "social-posts",
        )?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-posts state is not initialized"));
        }
        Ok(state)
    }

    fn rewards_state(&self) -> Result<SocialRewardsStateAccount> {
        let registry = resolve_social_registry();
        let address = registry.rewards.as_deref().ok_or_else(|| {
            anyhow!("social-rewards state is missing from the canonical bootstrap registry")
        })?;
        let state = self.rpc.fetch_owned_state::<SocialRewardsStateAccount>(
            address,
            aeko_social_rewards_program::id(),
            "social-rewards",
        )?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-rewards state is not initialized"));
        }
        Ok(state)
    }

    fn staking_state(&self) -> Result<SocialStakingStateAccount> {
        let registry = resolve_social_registry();
        let address = registry.staking.as_deref().ok_or_else(|| {
            anyhow!("social-staking state is missing from the canonical bootstrap registry")
        })?;
        let state = self.rpc.fetch_owned_state::<SocialStakingStateAccount>(
            address,
            aeko_social_staking_program::id(),
            "social-staking",
        )?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-staking state is not initialized"));
        }
        Ok(state)
    }
}

impl ChainDataSource for CanonicalChainDataSource {
    fn latest_slot(&self) -> Result<u64> {
        self.rpc.latest_slot()
    }

    fn fetch_core_slot(&self, slot: u64) -> Result<CoreSlotRecord> {
        self.rpc.fetch_core_slot(slot)
    }

    fn fetch_asset_snapshot(&self, slot: u64) -> Result<AssetSnapshot> {
        self.rpc.fetch_asset_snapshot(slot)
    }

    fn fetch_social_posts(&self) -> Result<Vec<SocialPostRecord>> {
        Ok(self
            .posts_state()?
            .posts
            .into_iter()
            .map(|post| SocialPostRecord {
                post_id: bs58::encode(post.post_id).into_string(),
                creator: post.creator.to_string(),
                content_uri: post.content_uri,
                post_kind: post_kind_label(post.post_kind).to_string(),
                visibility: visibility_label(post.visibility).to_string(),
                moderation_state: moderation_label(post.moderation_state).to_string(),
                created_at_unix: post.created_at_unix,
            })
            .collect())
    }

    fn fetch_creator_rewards(&self) -> Result<Vec<CreatorRewardRecord>> {
        Ok(self
            .rewards_state()?
            .epochs
            .into_iter()
            .map(|epoch| CreatorRewardRecord {
                creator: epoch.creator.to_string(),
                epoch: epoch.epoch,
                reward_amount: epoch.reward_amount,
                claimable_amount: epoch.reward_amount.saturating_sub(epoch.claimed_amount),
            })
            .collect())
    }

    fn fetch_engagement_events(&self) -> Result<Vec<EngagementRecord>> {
        Ok(self
            .posts_state()?
            .engagement_proofs
            .into_iter()
            .map(|proof| EngagementRecord {
                proof_id: bs58::encode(proof.proof_id).into_string(),
                actor: proof.actor.to_string(),
                target_creator: proof.target_creator.to_string(),
                target_post_id: proof
                    .target_post_id
                    .map(|value| bs58::encode(value).into_string()),
                action_kind: engagement_label(proof.action_kind).to_string(),
                action_weight: proof.action_weight,
                slot: proof.slot,
                unix_timestamp: proof.unix_timestamp,
            })
            .collect())
    }

    fn fetch_social_stakes(&self) -> Result<Vec<SocialStakeRecord>> {
        Ok(self
            .staking_state()?
            .positions
            .into_iter()
            .map(|position| SocialStakeRecord {
                position_id: bs58::encode(position.position_id).into_string(),
                staker: position.staker.to_string(),
                creator: position.creator.to_string(),
                staked_amount: position.staked_amount,
                state: stake_state_label(position.state).to_string(),
                accumulated_yield: position.accumulated_yield,
                claimed_yield: position.claimed_yield,
            })
            .collect())
    }
}

fn post_kind_label(value: aeko_social_posts_program::state::PostKind) -> &'static str {
    use aeko_social_posts_program::state::PostKind;
    match value {
        PostKind::Original => "original",
        PostKind::Reply => "reply",
        PostKind::Repost => "repost",
        PostKind::Quote => "quote",
    }
}

fn visibility_label(value: aeko_social_posts_program::state::VisibilityClass) -> &'static str {
    use aeko_social_posts_program::state::VisibilityClass;
    match value {
        VisibilityClass::Public => "public",
        VisibilityClass::FollowersOnly => "followers-only",
        VisibilityClass::Permissioned => "permissioned",
        VisibilityClass::Paid => "paid",
    }
}

fn moderation_label(value: aeko_social_posts_program::state::ModerationState) -> &'static str {
    use aeko_social_posts_program::state::ModerationState;
    match value {
        ModerationState::Active => "active",
        ModerationState::ReducedReach => "reduced-reach",
        ModerationState::HiddenByApp => "hidden-by-app",
        ModerationState::LockedByProtocol => "locked-by-protocol",
    }
}

fn engagement_label(value: aeko_social_posts_program::state::EngagementActionKind) -> &'static str {
    use aeko_social_posts_program::state::EngagementActionKind;
    match value {
        EngagementActionKind::Like => "like",
        EngagementActionKind::Comment => "comment",
        EngagementActionKind::Repost => "repost",
        EngagementActionKind::Quote => "quote",
        EngagementActionKind::Share => "share",
        EngagementActionKind::Save => "save",
    }
}

fn stake_state_label(value: aeko_social_staking_program::state::SocialStakeState) -> &'static str {
    use aeko_social_staking_program::state::SocialStakeState;
    match value {
        SocialStakeState::Active => "active",
        SocialStakeState::CoolingDown => "cooling-down",
        SocialStakeState::Closed => "closed",
        SocialStakeState::Slashed => "slashed",
    }
}
