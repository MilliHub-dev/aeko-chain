//! Canonical five-domain Social chain projection.
//!
//! Social state is read only from bootstrap-registered, program-owned state
//! accounts through `getAccountInfo`. There is no `getProgramAccounts`
//! fallback and no fabricated local state.

use {
    crate::{
        indexing::ChainDataSource,
        infrastructure::{chain::RpcChainClient, registry::resolve_social_registry},
        models::{
            AntiSpamProfileRecord, AssetSnapshot, CoreSlotRecord, CreatorRevenueRecord,
            CreatorRewardRecord, CreatorTipRecord, EngagementRecord, PaidContentUnlockRecord,
            RewardSettlementRecord, SocialDomainSnapshotRecord, SocialPostRecord,
            SocialRewardAccountRecord, SocialSnapshot, SocialStakeRecord, StakeYieldRecord,
            SubscriptionRecord,
        },
    },
    anyhow::{anyhow, Result},
    aeko_sdk::pubkey::Pubkey,
    aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount,
    aeko_social_monetization_program::state::{SocialMonetizationStateAccount, SubscriptionState},
    aeko_social_posts_program::state::{
        EngagementActionKind, ModerationState, PostKind, SocialPostsStateAccount, VisibilityClass,
    },
    aeko_social_rewards_program::state::SocialRewardsStateAccount,
    aeko_social_staking_program::state::{SocialStakeState, SocialStakingStateAccount},
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

    fn required_state<T: borsh::BorshDeserialize>(
        &self,
        address: Option<&str>,
        program_id: Pubkey,
        label: &str,
    ) -> Result<(String, T)> {
        let address = address.ok_or_else(|| anyhow!("{label} state is missing from the canonical bootstrap registry"))?;
        let state = self.rpc.fetch_owned_state::<T>(address, program_id, label)?;
        Ok((address.to_string(), state))
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

    fn fetch_social_snapshot(&self, slot: u64) -> Result<SocialSnapshot> {
        let registry = resolve_social_registry();
        let epoch = self.rpc.current_epoch()?;

        let (posts_address, posts_state) = self.required_state::<SocialPostsStateAccount>(
            registry.posts.as_deref(),
            aeko_social_posts_program::id(),
            "social-posts",
        )?;
        let (rewards_address, rewards_state) = self.required_state::<SocialRewardsStateAccount>(
            registry.rewards.as_deref(),
            aeko_social_rewards_program::id(),
            "social-rewards",
        )?;
        let (staking_address, staking_state) = self.required_state::<SocialStakingStateAccount>(
            registry.staking.as_deref(),
            aeko_social_staking_program::id(),
            "social-staking",
        )?;
        let (anti_spam_address, anti_spam_state) = self.required_state::<SocialAntiSpamStateAccount>(
            registry.anti_spam.as_deref(),
            aeko_social_anti_spam_program::id(),
            "social-anti-spam",
        )?;
        let (monetization_address, monetization_state) = self.required_state::<SocialMonetizationStateAccount>(
            registry.monetization.as_deref(),
            aeko_social_monetization_program::id(),
            "social-monetization",
        )?;

        if !posts_state.is_initialized
            || !rewards_state.is_initialized
            || !staking_state.is_initialized
            || !anti_spam_state.is_initialized
            || !monetization_state.is_initialized
        {
            return Err(anyhow!("one or more canonical Social state accounts are not initialized"));
        }

        let posts = posts_state.posts.iter().map(|post| SocialPostRecord {
            post_id: bs58::encode(post.post_id).into_string(),
            creator: post.creator.to_string(),
            content_hash: bs58::encode(post.content_hash).into_string(),
            metadata_hash: bs58::encode(post.metadata_hash).into_string(),
            content_uri: post.content_uri.clone(),
            parent_post_id: post.parent_post_id.map(|value| bs58::encode(value).into_string()),
            post_kind: post_kind_label(post.post_kind).to_string(),
            created_at_unix: post.created_at_unix,
            edited_at_unix: post.edited_at_unix,
            visibility: visibility_label(post.visibility).to_string(),
            moderation_state: moderation_label(post.moderation_state).to_string(),
            signature_ref: post.signature_ref.map(|value| bs58::encode(value).into_string()),
        }).collect::<Vec<_>>();

        let engagement = posts_state.engagement_proofs.iter().map(|proof| EngagementRecord {
            proof_id: bs58::encode(proof.proof_id).into_string(),
            actor: proof.actor.to_string(),
            target_creator: proof.target_creator.to_string(),
            target_post_id: proof.target_post_id.map(|value| bs58::encode(value).into_string()),
            action_kind: engagement_label(proof.action_kind).to_string(),
            action_weight: proof.action_weight,
            slot: proof.slot,
            unix_timestamp: proof.unix_timestamp,
            replay_guard: bs58::encode(proof.replay_guard).into_string(),
        }).collect::<Vec<_>>();

        let reward_accounts = rewards_state.creators.iter().map(|entry| SocialRewardAccountRecord {
            creator: entry.creator.to_string(),
            total_earned: entry.total_earned.to_string(),
            total_claimed: entry.total_claimed.to_string(),
            claimable_amount: entry.claimable_amount,
            last_settled_epoch: entry.last_settled_epoch,
        }).collect::<Vec<_>>();
        let reward_epochs = rewards_state.epochs.iter().map(|entry| CreatorRewardRecord {
            creator: entry.creator.to_string(),
            epoch: entry.epoch,
            earned_points: entry.earned_points.to_string(),
            reward_amount: entry.reward_amount,
            claimed_amount: entry.claimed_amount,
            claimable_amount: entry.reward_amount.saturating_sub(entry.claimed_amount),
            penalty_bps: entry.penalty_bps,
        }).collect::<Vec<_>>();
        let reward_settlements = rewards_state.settlements.iter().map(|entry| RewardSettlementRecord {
            epoch: entry.epoch,
            reward_pool_amount: entry.reward_pool_amount,
            total_effective_points: entry.total_effective_points.to_string(),
            settled_creator_count: entry.settled_creator_count,
        }).collect::<Vec<_>>();

        let stakes = staking_state.positions.iter().map(|position| SocialStakeRecord {
            position_id: bs58::encode(position.position_id).into_string(),
            staker: position.staker.to_string(),
            creator: position.creator.to_string(),
            staked_amount: position.staked_amount,
            activated_at_epoch: position.activated_at_epoch,
            unlock_epoch: position.unlock_epoch,
            state: stake_state_label(position.state).to_string(),
            accumulated_yield: position.accumulated_yield,
            claimed_yield: position.claimed_yield,
        }).collect::<Vec<_>>();
        let stake_yields = staking_state.yield_records.iter().map(|entry| StakeYieldRecord {
            epoch: entry.epoch,
            position_id: bs58::encode(entry.position_id).into_string(),
            creator: entry.creator.to_string(),
            staker: entry.staker.to_string(),
            yield_amount: entry.yield_amount,
        }).collect::<Vec<_>>();

        let anti_spam_profiles = anti_spam_state.profiles.iter().map(|profile| AntiSpamProfileRecord {
            wallet: profile.wallet.to_string(),
            post_count_window: profile.post_count_window,
            engagement_count_window: profile.engagement_count_window,
            spam_flags: profile.spam_flags,
            gated_until_epoch: profile.gated_until_epoch,
            slash_count: profile.slash_count,
            last_flagged_at_unix: profile.last_flagged_at_unix,
            reputation_score: reputation_score(profile, epoch),
        }).collect::<Vec<_>>();

        let tips = monetization_state.tips.iter().map(|entry| CreatorTipRecord {
            tip_id: bs58::encode(entry.tip_id).into_string(),
            creator: entry.creator.to_string(),
            sender: entry.sender.to_string(),
            amount: entry.amount,
            timestamp: entry.timestamp,
        }).collect::<Vec<_>>();
        let subscriptions = monetization_state.subscriptions.iter().map(|entry| SubscriptionRecord {
            subscription_id: bs58::encode(entry.subscription_id).into_string(),
            creator: entry.creator.to_string(),
            subscriber: entry.subscriber.to_string(),
            amount_per_period: entry.amount_per_period,
            period_seconds: entry.period_seconds,
            started_at_unix: entry.started_at_unix,
            valid_until_unix: entry.valid_until_unix,
            state: subscription_state_label(entry.state).to_string(),
        }).collect::<Vec<_>>();
        let unlocks = monetization_state.unlocks.iter().map(|entry| PaidContentUnlockRecord {
            unlock_id: bs58::encode(entry.unlock_id).into_string(),
            content_id: bs58::encode(entry.content_id).into_string(),
            creator: entry.creator.to_string(),
            buyer: entry.buyer.to_string(),
            amount: entry.amount,
            unlocked_at_unix: entry.unlocked_at_unix,
        }).collect::<Vec<_>>();
        let revenues = monetization_state.revenues.iter().map(|entry| CreatorRevenueRecord {
            creator: entry.creator.to_string(),
            total_earned: entry.total_earned.to_string(),
            total_claimed: entry.total_claimed.to_string(),
            claimable_amount: entry.claimable_amount,
        }).collect::<Vec<_>>();

        let domains = vec![
            SocialDomainSnapshotRecord { domain: "posts".to_string(), state_account: posts_address, program_id: aeko_social_posts_program::id().to_string(), slot, epoch, item_count: posts.len() + engagement.len() },
            SocialDomainSnapshotRecord { domain: "rewards".to_string(), state_account: rewards_address, program_id: aeko_social_rewards_program::id().to_string(), slot, epoch, item_count: reward_accounts.len() + reward_epochs.len() + reward_settlements.len() },
            SocialDomainSnapshotRecord { domain: "staking".to_string(), state_account: staking_address, program_id: aeko_social_staking_program::id().to_string(), slot, epoch, item_count: stakes.len() + stake_yields.len() },
            SocialDomainSnapshotRecord { domain: "anti-spam".to_string(), state_account: anti_spam_address, program_id: aeko_social_anti_spam_program::id().to_string(), slot, epoch, item_count: anti_spam_profiles.len() },
            SocialDomainSnapshotRecord { domain: "monetization".to_string(), state_account: monetization_address, program_id: aeko_social_monetization_program::id().to_string(), slot, epoch, item_count: tips.len() + subscriptions.len() + unlocks.len() + revenues.len() },
        ];

        Ok(SocialSnapshot { slot, epoch, domains, posts, engagement, reward_accounts, reward_epochs, reward_settlements, stakes, stake_yields, anti_spam_profiles, tips, subscriptions, unlocks, revenues })
    }
}

fn reputation_score(profile: &aeko_social_anti_spam_program::state::AntiSpamProfile, current_epoch: u64) -> u16 {
    let spam_penalty = u32::from(profile.spam_flags).saturating_mul(50);
    let slash_penalty = u32::from(profile.slash_count).saturating_mul(150);
    let gated_penalty = match profile.gated_until_epoch {
        Some(gated_until_epoch) if gated_until_epoch > current_epoch => 250,
        _ => 0,
    };
    let total_penalty = spam_penalty.saturating_add(slash_penalty).saturating_add(gated_penalty).min(1_000);
    (1_000u32.saturating_sub(total_penalty)) as u16
}

fn post_kind_label(value: PostKind) -> &'static str { match value { PostKind::Original => "original", PostKind::Reply => "reply", PostKind::Repost => "repost", PostKind::Quote => "quote" } }
fn visibility_label(value: VisibilityClass) -> &'static str { match value { VisibilityClass::Public => "public", VisibilityClass::FollowersOnly => "followers-only", VisibilityClass::Permissioned => "permissioned", VisibilityClass::Paid => "paid" } }
fn moderation_label(value: ModerationState) -> &'static str { match value { ModerationState::Active => "active", ModerationState::ReducedReach => "reduced-reach", ModerationState::HiddenByApp => "hidden-by-app", ModerationState::LockedByProtocol => "locked-by-protocol" } }
fn engagement_label(value: EngagementActionKind) -> &'static str { match value { EngagementActionKind::Like => "like", EngagementActionKind::Comment => "comment", EngagementActionKind::Repost => "repost", EngagementActionKind::Quote => "quote", EngagementActionKind::Share => "share", EngagementActionKind::Save => "save" } }
fn stake_state_label(value: SocialStakeState) -> &'static str { match value { SocialStakeState::Active => "active", SocialStakeState::CoolingDown => "cooling-down", SocialStakeState::Closed => "closed", SocialStakeState::Slashed => "slashed" } }
fn subscription_state_label(value: SubscriptionState) -> &'static str { match value { SubscriptionState::Active => "active", SubscriptionState::Expired => "expired", SubscriptionState::Canceled => "canceled" } }
