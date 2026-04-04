use {
    aeko_rpc_client_api::{
        config::{RpcCreatorRewardsConfig, RpcEngagementEventsConfig, RpcPostListConfig},
        response::{
            RpcCreatorRewardEpoch, RpcCreatorRewardsSummary, RpcEngagementEvent,
            RpcEngagementScore, RpcPostAnchor, RpcReputationScore, RpcSocialStakePosition,
        },
    },
    aeko_runtime::bank::Bank,
    aeko_sdk::{account::{AccountSharedData, ReadableAccount}, pubkey::Pubkey},
    aeko_social_anti_spam_program::state::{AntiSpamProfile, SocialAntiSpamStateAccount},
    aeko_social_posts_program::state::{
        EngagementActionKind, EngagementProof, ModerationState, PostAnchor, PostKind,
        SocialPostsStateAccount, VisibilityClass,
    },
    aeko_social_rewards_program::state::{CreatorRewardEpochRecord, SocialRewardsStateAccount},
    aeko_social_staking_program::state::{SocialStakeState, SocialStakingStateAccount},
    std::collections::HashMap,
};

pub(crate) fn get_account_from_overwrites_or_bank(
    pubkey: &Pubkey,
    bank: &Bank,
    overwrite_accounts: Option<&HashMap<Pubkey, AccountSharedData>>,
) -> Option<AccountSharedData> {
    overwrite_accounts
        .and_then(|accounts| accounts.get(pubkey).cloned())
        .or_else(|| bank.get_account(pubkey))
}

pub(crate) fn decode_social_rewards_state(
    account: &AccountSharedData,
) -> Option<SocialRewardsStateAccount> {
    if !aeko_social_rewards_program::check_id(account.owner()) {
        return None;
    }
    SocialRewardsStateAccount::deserialize_padded(account.data()).ok()
}

pub(crate) fn decode_social_anti_spam_state(
    account: &AccountSharedData,
) -> Option<SocialAntiSpamStateAccount> {
    if !aeko_social_anti_spam_program::check_id(account.owner()) {
        return None;
    }
    SocialAntiSpamStateAccount::deserialize_padded(account.data()).ok()
}

pub(crate) fn decode_social_posts_state(account: &AccountSharedData) -> Option<SocialPostsStateAccount> {
    if !aeko_social_posts_program::check_id(account.owner()) {
        return None;
    }
    SocialPostsStateAccount::deserialize_padded(account.data()).ok()
}

pub(crate) fn decode_social_staking_state(
    account: &AccountSharedData,
) -> Option<SocialStakingStateAccount> {
    if !aeko_social_staking_program::check_id(account.owner()) {
        return None;
    }
    SocialStakingStateAccount::deserialize_padded(account.data()).ok()
}

pub(crate) fn find_social_rewards_state(
    accounts: Vec<(Pubkey, AccountSharedData)>,
) -> Option<SocialRewardsStateAccount> {
    accounts
        .into_iter()
        .find_map(|(_, account)| decode_social_rewards_state(&account))
}

pub(crate) fn find_social_anti_spam_state(
    accounts: Vec<(Pubkey, AccountSharedData)>,
) -> Option<SocialAntiSpamStateAccount> {
    accounts
        .into_iter()
        .find_map(|(_, account)| decode_social_anti_spam_state(&account))
}

pub(crate) fn find_social_posts_state(
    accounts: Vec<(Pubkey, AccountSharedData)>,
) -> Option<SocialPostsStateAccount> {
    accounts
        .into_iter()
        .find_map(|(_, account)| decode_social_posts_state(&account))
}

pub(crate) fn find_social_staking_state(
    accounts: Vec<(Pubkey, AccountSharedData)>,
) -> Option<SocialStakingStateAccount> {
    accounts
        .into_iter()
        .find_map(|(_, account)| decode_social_staking_state(&account))
}

pub(crate) fn creator_rewards_summary_from_state(
    state: &SocialRewardsStateAccount,
    creator: &Pubkey,
    config: Option<&RpcCreatorRewardsConfig>,
) -> RpcCreatorRewardsSummary {
    let creator_rewards = state.creators.iter().find(|entry| entry.creator == *creator);
    let start_epoch = config.and_then(|cfg| cfg.start_epoch);
    let end_epoch = config.and_then(|cfg| cfg.end_epoch);
    let epochs = state
        .epochs
        .iter()
        .filter(|entry| {
            entry.creator == *creator
                && start_epoch.map_or(true, |start| entry.epoch >= start)
                && end_epoch.map_or(true, |end| entry.epoch <= end)
        })
        .map(rpc_creator_reward_epoch_from_record)
        .collect();

    RpcCreatorRewardsSummary {
        creator: creator.to_string(),
        total_earned: creator_rewards.map(|entry| entry.total_earned).unwrap_or(0),
        total_claimed: creator_rewards.map(|entry| entry.total_claimed).unwrap_or(0),
        total_claimable: creator_rewards
            .map(|entry| entry.claimable_amount)
            .unwrap_or(0),
        epochs,
    }
}

pub(crate) fn creator_reward_epoch_from_state(
    state: &SocialRewardsStateAccount,
    creator: &Pubkey,
    epoch: u64,
) -> Option<RpcCreatorRewardEpoch> {
    state
        .epochs
        .iter()
        .find(|entry| entry.creator == *creator && entry.epoch == epoch)
        .map(rpc_creator_reward_epoch_from_record)
}

pub(crate) fn social_stake_positions_from_state(
    state: &SocialStakingStateAccount,
    wallet: &Pubkey,
    role: Option<&str>,
) -> Vec<RpcSocialStakePosition> {
    state
        .positions
        .iter()
        .filter(|position| match role {
            Some(role) if role.eq_ignore_ascii_case("creator") => position.creator == *wallet,
            Some(role) if role.eq_ignore_ascii_case("staker") => position.staker == *wallet,
            _ => position.creator == *wallet || position.staker == *wallet,
        })
        .map(|position| RpcSocialStakePosition {
            position_id: bs58::encode(position.position_id).into_string(),
            staker: position.staker.to_string(),
            creator: position.creator.to_string(),
            staked_amount: position.staked_amount,
            activated_at_epoch: position.activated_at_epoch,
            unlock_epoch: position.unlock_epoch,
            accumulated_yield: position.accumulated_yield,
            claimed_yield: position.claimed_yield,
            state: social_stake_state_label(position.state).to_string(),
        })
        .collect()
}

pub(crate) fn post_anchor_from_state(
    state: &SocialPostsStateAccount,
    post_id: &[u8; 32],
) -> Option<RpcPostAnchor> {
    state
        .posts
        .iter()
        .find(|post| &post.post_id == post_id)
        .map(rpc_post_anchor_from_record)
}

pub(crate) fn posts_by_creator_from_state(
    state: &SocialPostsStateAccount,
    creator: &Pubkey,
    config: Option<&RpcPostListConfig>,
) -> Vec<RpcPostAnchor> {
    let mut posts = state
        .posts
        .iter()
        .filter(|post| post.creator == *creator)
        .filter(|post| {
            config
                .and_then(|cfg| cfg.parent_post_id.as_ref())
                .and_then(|value| decode_social_record_id(value).ok())
                .map_or(true, |parent_post_id| post.parent_post_id == Some(parent_post_id))
        })
        .filter(|post| {
            config
                .and_then(|cfg| cfg.post_kind.as_deref())
                .map_or(true, |post_kind| post_kind_matches(post.post_kind, post_kind))
        })
        .filter(|post| {
            config
                .and_then(|cfg| cfg.visibility.as_deref())
                .map_or(true, |visibility| visibility_matches(post.visibility, visibility))
        })
        .cloned()
        .collect::<Vec<_>>();

    posts.sort_by(|left, right| right.created_at_unix.cmp(&left.created_at_unix));
    apply_post_cursor(&mut posts, config);
    let limit = config
        .and_then(|cfg| cfg.cursor.limit)
        .unwrap_or(25)
        .min(100);
    posts.into_iter()
        .take(limit)
        .map(|post| rpc_post_anchor_from_record(&post))
        .collect()
}

pub(crate) fn engagement_events_from_state(
    state: &SocialPostsStateAccount,
    config: Option<&RpcEngagementEventsConfig>,
) -> Vec<RpcEngagementEvent> {
    let creator_filter = config
        .and_then(|cfg| cfg.creator.as_ref())
        .and_then(|value| value.parse::<Pubkey>().ok());
    let post_id_filter = config
        .and_then(|cfg| cfg.post_id.as_ref())
        .and_then(|value| decode_social_record_id(value).ok());
    let actor_filter = config
        .and_then(|cfg| cfg.actor.as_ref())
        .and_then(|value| value.parse::<Pubkey>().ok());
    let action_filter = config.and_then(|cfg| cfg.action_kind.as_deref());

    let mut proofs = state
        .engagement_proofs
        .iter()
        .filter(|proof| creator_filter.map_or(true, |creator| proof.target_creator == creator))
        .filter(|proof| post_id_filter.map_or(true, |post_id| proof.target_post_id == Some(post_id)))
        .filter(|proof| actor_filter.map_or(true, |actor| proof.actor == actor))
        .filter(|proof| {
            action_filter.map_or(true, |action_kind| {
                engagement_action_kind_matches(proof.action_kind, action_kind)
            })
        })
        .cloned()
        .collect::<Vec<_>>();

    proofs.sort_by(|left, right| right.slot.cmp(&left.slot));
    apply_engagement_cursor(&mut proofs, config);
    let limit = config
        .and_then(|cfg| cfg.cursor.limit)
        .unwrap_or(25)
        .min(100);
    proofs
        .into_iter()
        .take(limit)
        .map(|proof| rpc_engagement_event_from_record(&proof))
        .collect()
}

pub(crate) fn engagement_score_from_state(
    state: &SocialPostsStateAccount,
    target: &Pubkey,
) -> RpcEngagementScore {
    let (score, last_updated_slot) = state
        .engagement_proofs
        .iter()
        .filter(|proof| proof.target_creator == *target || proof.actor == *target)
        .fold((0u128, None), |(score, last_updated_slot), proof| {
            (
                score.saturating_add(proof.action_weight as u128),
                Some(last_updated_slot.map_or(proof.slot, |slot: u64| slot.max(proof.slot))),
            )
        });

    RpcEngagementScore {
        target: target.to_string(),
        score,
        last_updated_slot,
    }
}

pub(crate) fn reputation_score_from_anti_spam_state(
    state: &SocialAntiSpamStateAccount,
    wallet: &Pubkey,
    current_epoch: u64,
) -> RpcReputationScore {
    let profile = state.profile_for_wallet(wallet);
    let score = anti_spam_profile_score(profile, current_epoch);
    RpcReputationScore {
        wallet: wallet.to_string(),
        score,
        tier: Some(reputation_tier_label(score, profile, current_epoch).to_string()),
    }
}

fn rpc_creator_reward_epoch_from_record(record: &CreatorRewardEpochRecord) -> RpcCreatorRewardEpoch {
    RpcCreatorRewardEpoch {
        epoch: record.epoch,
        creator: record.creator.to_string(),
        earned_points: record.earned_points,
        reward_amount: record.reward_amount,
        claimed_amount: record.claimed_amount,
        claimable_amount: record.reward_amount.saturating_sub(record.claimed_amount),
    }
}

fn rpc_post_anchor_from_record(post: &PostAnchor) -> RpcPostAnchor {
    RpcPostAnchor {
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
        moderation_state: moderation_state_label(post.moderation_state).to_string(),
    }
}

fn rpc_engagement_event_from_record(proof: &EngagementProof) -> RpcEngagementEvent {
    RpcEngagementEvent {
        proof_id: bs58::encode(proof.proof_id).into_string(),
        actor: proof.actor.to_string(),
        target_post_id: proof
            .target_post_id
            .map(|post_id| bs58::encode(post_id).into_string()),
        target_creator: proof.target_creator.to_string(),
        action_kind: engagement_action_kind_label(proof.action_kind).to_string(),
        action_weight: proof.action_weight,
        slot: proof.slot,
        unix_timestamp: proof.unix_timestamp,
    }
}

fn social_stake_state_label(state: SocialStakeState) -> &'static str {
    match state {
        SocialStakeState::Active => "active",
        SocialStakeState::CoolingDown => "cooling-down",
        SocialStakeState::Closed => "closed",
        SocialStakeState::Slashed => "slashed",
    }
}

fn post_kind_label(post_kind: PostKind) -> &'static str {
    match post_kind {
        PostKind::Original => "original",
        PostKind::Reply => "reply",
        PostKind::Repost => "repost",
        PostKind::Quote => "quote",
    }
}

fn visibility_label(visibility: VisibilityClass) -> &'static str {
    match visibility {
        VisibilityClass::Public => "public",
        VisibilityClass::FollowersOnly => "followers-only",
        VisibilityClass::Permissioned => "permissioned",
        VisibilityClass::Paid => "paid",
    }
}

fn moderation_state_label(state: ModerationState) -> &'static str {
    match state {
        ModerationState::Active => "active",
        ModerationState::ReducedReach => "reduced-reach",
        ModerationState::HiddenByApp => "hidden-by-app",
        ModerationState::LockedByProtocol => "locked-by-protocol",
    }
}

fn engagement_action_kind_label(action_kind: EngagementActionKind) -> &'static str {
    match action_kind {
        EngagementActionKind::Like => "like",
        EngagementActionKind::Comment => "comment",
        EngagementActionKind::Repost => "repost",
        EngagementActionKind::Quote => "quote",
        EngagementActionKind::Share => "share",
        EngagementActionKind::Save => "save",
    }
}

fn post_kind_matches(post_kind: PostKind, value: &str) -> bool {
    post_kind_label(post_kind).eq_ignore_ascii_case(value)
}

fn visibility_matches(visibility: VisibilityClass, value: &str) -> bool {
    visibility_label(visibility).eq_ignore_ascii_case(value)
}

fn engagement_action_kind_matches(action_kind: EngagementActionKind, value: &str) -> bool {
    engagement_action_kind_label(action_kind).eq_ignore_ascii_case(value)
}

pub(crate) fn decode_social_record_id(value: &str) -> Result<[u8; 32], bs58::decode::Error> {
    let bytes = bs58::decode(value).into_vec()?;
    if bytes.len() != 32 {
        return Err(bs58::decode::Error::BufferTooSmall);
    }
    let mut id = [0u8; 32];
    id.copy_from_slice(&bytes[..32]);
    Ok(id)
}

fn apply_post_cursor(posts: &mut Vec<PostAnchor>, config: Option<&RpcPostListConfig>) {
    if let Some(after) = config.and_then(|cfg| cfg.cursor.after.as_ref()) {
        if let Ok(after_id) = decode_social_record_id(after) {
            if let Some(index) = posts.iter().position(|post| post.post_id == after_id) {
                posts.drain(..=index);
            }
        }
    }
    if let Some(before) = config.and_then(|cfg| cfg.cursor.before.as_ref()) {
        if let Ok(before_id) = decode_social_record_id(before) {
            if let Some(index) = posts.iter().position(|post| post.post_id == before_id) {
                posts.truncate(index);
            }
        }
    }
}

fn apply_engagement_cursor(
    proofs: &mut Vec<EngagementProof>,
    config: Option<&RpcEngagementEventsConfig>,
) {
    if let Some(after) = config.and_then(|cfg| cfg.cursor.after.as_ref()) {
        if let Ok(after_id) = decode_social_record_id(after) {
            if let Some(index) = proofs.iter().position(|proof| proof.proof_id == after_id) {
                proofs.drain(..=index);
            }
        }
    }
    if let Some(before) = config.and_then(|cfg| cfg.cursor.before.as_ref()) {
        if let Ok(before_id) = decode_social_record_id(before) {
            if let Some(index) = proofs.iter().position(|proof| proof.proof_id == before_id) {
                proofs.truncate(index);
            }
        }
    }
}

fn anti_spam_profile_score(profile: Option<&AntiSpamProfile>, current_epoch: u64) -> u16 {
    let Some(profile) = profile else {
        return 1_000;
    };

    let spam_penalty = u32::from(profile.spam_flags).saturating_mul(50);
    let slash_penalty = u32::from(profile.slash_count).saturating_mul(150);
    let gated_penalty = match profile.gated_until_epoch {
        Some(gated_until_epoch) if gated_until_epoch > current_epoch => 250,
        _ => 0,
    };
    let total_penalty = spam_penalty
        .saturating_add(slash_penalty)
        .saturating_add(gated_penalty)
        .min(1_000);

    (1_000u32.saturating_sub(total_penalty)) as u16
}

fn reputation_tier_label(
    score: u16,
    profile: Option<&AntiSpamProfile>,
    current_epoch: u64,
) -> &'static str {
    if profile
        .and_then(|profile| profile.gated_until_epoch)
        .is_some_and(|gated_until_epoch| gated_until_epoch > current_epoch)
    {
        return "restricted";
    }

    match score {
        900..=1_000 => "trusted",
        700..=899 => "established",
        400..=699 => "active",
        200..=399 => "watch",
        _ => "restricted",
    }
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        aeko_social_anti_spam_program::state::{AntiSpamConfig, AntiSpamMode},
        aeko_social_posts_program::state::{
            EngagementActionKind, EngagementProof, ModerationState, PostAnchor, PostKind,
            SocialPostsConfig, SocialPostsStateAccount, VisibilityClass,
        },
        aeko_social_rewards_program::state::{
            CreatorRewardAccount, RewardConfig, RewardEpochSettlement,
        },
        aeko_social_staking_program::state::{SocialStakeConfig, SocialStakePosition},
    };

    #[test]
    fn creator_rewards_summary_filters_epochs() {
        let creator = Pubkey::new_unique();
        let mut state = SocialRewardsStateAccount::new(RewardConfig {
            authority: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            reward_vault: Pubkey::new_unique(),
            settlement_authority: Pubkey::new_unique(),
            min_claim_amount: 1,
            rewards_enabled: true,
        });
        state.creators.push(CreatorRewardAccount {
            creator,
            total_earned: 100,
            total_claimed: 30,
            claimable_amount: 70,
            last_settled_epoch: 4,
        });
        state.epochs.push(CreatorRewardEpochRecord {
            epoch: 3,
            creator,
            earned_points: 10,
            reward_amount: 25,
            claimed_amount: 5,
            penalty_bps: 0,
        });
        state.epochs.push(CreatorRewardEpochRecord {
            epoch: 4,
            creator,
            earned_points: 20,
            reward_amount: 75,
            claimed_amount: 25,
            penalty_bps: 0,
        });
        state.settlements.push(RewardEpochSettlement {
            epoch: 4,
            reward_pool_amount: 100,
            total_effective_points: 20,
            settled_creator_count: 1,
        });

        let summary = creator_rewards_summary_from_state(
            &state,
            &creator,
            Some(&RpcCreatorRewardsConfig {
                start_epoch: Some(4),
                end_epoch: Some(4),
                commitment: None,
            }),
        );

        assert_eq!(summary.total_earned, 100);
        assert_eq!(summary.total_claimed, 30);
        assert_eq!(summary.total_claimable, 70);
        assert_eq!(summary.epochs.len(), 1);
        assert_eq!(summary.epochs[0].epoch, 4);
        assert_eq!(summary.epochs[0].claimable_amount, 50);
    }

    #[test]
    fn social_stake_positions_support_role_filtering() {
        let wallet = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let mut state = SocialStakingStateAccount::new(SocialStakeConfig {
            authority: Pubkey::new_unique(),
            stake_vault: Pubkey::new_unique(),
            reward_vault: Pubkey::new_unique(),
            min_stake_amount: 1,
            cooldown_epochs: 2,
            staking_enabled: true,
        });
        state.positions.push(SocialStakePosition {
            position_id: [7u8; 32],
            staker: wallet,
            creator,
            staked_amount: 50,
            activated_at_epoch: 1,
            unlock_epoch: None,
            accumulated_yield: 10,
            claimed_yield: 2,
            state: SocialStakeState::Active,
        });
        state.positions.push(SocialStakePosition {
            position_id: [8u8; 32],
            staker: other,
            creator: wallet,
            staked_amount: 25,
            activated_at_epoch: 2,
            unlock_epoch: Some(5),
            accumulated_yield: 4,
            claimed_yield: 1,
            state: SocialStakeState::CoolingDown,
        });

        let all = social_stake_positions_from_state(&state, &wallet, None);
        let as_staker = social_stake_positions_from_state(&state, &wallet, Some("staker"));
        let as_creator = social_stake_positions_from_state(&state, &wallet, Some("creator"));

        assert_eq!(all.len(), 2);
        assert_eq!(as_staker.len(), 1);
        assert_eq!(as_creator.len(), 1);
        assert_eq!(as_staker[0].state, "active");
        assert_eq!(as_creator[0].state, "cooling-down");
    }

    #[test]
    fn reputation_score_uses_anti_spam_penalties() {
        let wallet = Pubkey::new_unique();
        let mut state = SocialAntiSpamStateAccount::new(AntiSpamConfig {
            authority: Pubkey::new_unique(),
            mode: AntiSpamMode::PenaltyEnabled,
            min_post_stake: 1,
            min_post_reputation: 400,
            cooldown_epochs: 3,
            slash_bps: 100,
        });
        state.profiles.push(AntiSpamProfile {
            wallet,
            post_count_window: 0,
            engagement_count_window: 0,
            spam_flags: 2,
            gated_until_epoch: Some(12),
            slash_count: 1,
            last_flagged_at_unix: None,
        });

        let reputation = reputation_score_from_anti_spam_state(&state, &wallet, 10);
        assert_eq!(reputation.score, 500);
        assert_eq!(reputation.tier.as_deref(), Some("restricted"));
    }

    #[test]
    fn posts_by_creator_applies_filters_and_limit() {
        let creator = Pubkey::new_unique();
        let reply_parent = [8u8; 32];
        let mut state = SocialPostsStateAccount::new(SocialPostsConfig {
            authority: Pubkey::new_unique(),
            posting_enabled: true,
            engagement_enabled: true,
            max_content_uri_len: 128,
        });
        state.posts.push(PostAnchor {
            post_id: [1u8; 32],
            creator,
            content_hash: [2u8; 32],
            metadata_hash: [3u8; 32],
            content_uri: "ipfs://post/1".to_string(),
            parent_post_id: None,
            post_kind: PostKind::Original,
            created_at_unix: 10,
            edited_at_unix: None,
            visibility: VisibilityClass::Public,
            moderation_state: ModerationState::Active,
            signature_ref: None,
        });
        state.posts.push(PostAnchor {
            post_id: [4u8; 32],
            creator,
            content_hash: [5u8; 32],
            metadata_hash: [6u8; 32],
            content_uri: "ipfs://post/2".to_string(),
            parent_post_id: Some(reply_parent),
            post_kind: PostKind::Reply,
            created_at_unix: 20,
            edited_at_unix: None,
            visibility: VisibilityClass::FollowersOnly,
            moderation_state: ModerationState::Active,
            signature_ref: None,
        });

        let posts = posts_by_creator_from_state(
            &state,
            &creator,
            Some(&RpcPostListConfig {
                creator: None,
                parent_post_id: Some(bs58::encode(reply_parent).into_string()),
                post_kind: Some("reply".to_string()),
                visibility: Some("followers-only".to_string()),
                cursor: Default::default(),
                commitment: None,
            }),
        );

        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].post_kind, "reply");
        assert_eq!(posts[0].visibility, "followers-only");
    }

    #[test]
    fn engagement_events_apply_filters() {
        let creator = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mut state = SocialPostsStateAccount::new(SocialPostsConfig {
            authority: Pubkey::new_unique(),
            posting_enabled: true,
            engagement_enabled: true,
            max_content_uri_len: 128,
        });
        state.engagement_proofs.push(EngagementProof {
            proof_id: [1u8; 32],
            actor,
            target_post_id: Some([7u8; 32]),
            target_creator: creator,
            action_kind: EngagementActionKind::Like,
            action_weight: 1,
            slot: 100,
            unix_timestamp: 1_700_000_100,
            replay_guard: [9u8; 32],
        });
        state.engagement_proofs.push(EngagementProof {
            proof_id: [2u8; 32],
            actor,
            target_post_id: Some([7u8; 32]),
            target_creator: creator,
            action_kind: EngagementActionKind::Share,
            action_weight: 2,
            slot: 101,
            unix_timestamp: 1_700_000_101,
            replay_guard: [10u8; 32],
        });

        let events = engagement_events_from_state(
            &state,
            Some(&RpcEngagementEventsConfig {
                creator: Some(creator.to_string()),
                post_id: Some(bs58::encode([7u8; 32]).into_string()),
                actor: Some(actor.to_string()),
                action_kind: Some("share".to_string()),
                cursor: Default::default(),
                commitment: None,
            }),
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].action_kind, "share");
        assert_eq!(events[0].slot, 101);
    }

    #[test]
    fn engagement_score_aggregates_matching_proofs() {
        let creator = Pubkey::new_unique();
        let actor = Pubkey::new_unique();
        let mut state = SocialPostsStateAccount::new(SocialPostsConfig {
            authority: Pubkey::new_unique(),
            posting_enabled: true,
            engagement_enabled: true,
            max_content_uri_len: 128,
        });
        state.engagement_proofs.push(EngagementProof {
            proof_id: [1u8; 32],
            actor,
            target_post_id: Some([7u8; 32]),
            target_creator: creator,
            action_kind: EngagementActionKind::Like,
            action_weight: 1,
            slot: 100,
            unix_timestamp: 1_700_000_100,
            replay_guard: [9u8; 32],
        });
        state.engagement_proofs.push(EngagementProof {
            proof_id: [2u8; 32],
            actor: creator,
            target_post_id: Some([8u8; 32]),
            target_creator: Pubkey::new_unique(),
            action_kind: EngagementActionKind::Comment,
            action_weight: 3,
            slot: 105,
            unix_timestamp: 1_700_000_105,
            replay_guard: [10u8; 32],
        });

        let score = engagement_score_from_state(&state, &creator);

        assert_eq!(score.target, creator.to_string());
        assert_eq!(score.score, 4);
        assert_eq!(score.last_updated_slot, Some(105));
    }
}
