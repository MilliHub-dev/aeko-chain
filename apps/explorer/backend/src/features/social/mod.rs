use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::{
            chain::RpcChainClient,
            persistence::social::{
                EngagementQuery, PostQuery, StakeQuery, SubscriptionQuery, TipQuery, UnlockQuery,
                YieldQuery,
            },
            registry::{resolve_social_registry, SocialRegistry},
        },
        models::{
            AntiSpamProfileRecord, CreatorRevenueRecord, CreatorRewardRecord, CreatorTipRecord,
            EngagementRecord, PaidContentUnlockRecord, RewardSettlementRecord,
            SocialDomainSnapshotRecord, SocialPostRecord, SocialRewardAccountRecord,
            SocialStakeRecord, StakeYieldRecord, SubscriptionRecord,
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::pubkey::Pubkey,
    anyhow::Context,
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
    borsh::BorshDeserialize,
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    std::collections::BTreeMap,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/posts", get(list_posts))
        .route("/posts/:post_id", get(get_post))
        .route("/engagement", get(list_engagement))
        .route("/stakes", get(list_stakes))
        .route("/rewards", get(list_rewards))
        .route("/social/reward-accounts", get(list_reward_accounts))
        .route("/social/reward-settlements", get(list_reward_settlements))
        .route("/social/stake-yields", get(list_stake_yields))
        .route("/social/anti-spam", get(list_anti_spam))
        .route("/social/tips", get(list_tips))
        .route("/social/subscriptions", get(list_subscriptions))
        .route("/social/unlocks", get(list_unlocks))
        .route("/social/revenues", get(list_revenues))
        .route("/social/domains", get(list_social_domains))
        .route("/registry/social", get(get_registry))
        .route("/social/status", get(get_social_status))
}

#[derive(Debug, Deserialize)]
struct PostParams {
    creator: Option<String>,
    before: Option<i64>,
    after: Option<i64>,
    #[serde(rename = "postKind")]
    post_kind: Option<String>,
    visibility: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct EngagementParams {
    creator: Option<String>,
    actor: Option<String>,
    #[serde(rename = "postId")]
    post_id: Option<String>,
    #[serde(rename = "actionKind")]
    action_kind: Option<String>,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct StakeParams {
    wallet: Option<String>,
    creator: Option<String>,
    staker: Option<String>,
    state: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct RewardParams {
    creator: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct YieldParams {
    wallet: Option<String>,
    creator: Option<String>,
    staker: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct WalletParams {
    wallet: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct TipParams {
    creator: Option<String>,
    sender: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct SubscriptionParams {
    creator: Option<String>,
    subscriber: Option<String>,
    state: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct UnlockParams {
    creator: Option<String>,
    buyer: Option<String>,
    #[serde(rename = "contentId")]
    content_id: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct LimitParams {
    limit: Option<usize>,
}

async fn list_posts(
    State(state): State<SharedState>,
    Query(params): Query<PostParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialPostRecord>>>> {
    let items = state
        .repository
        .list_posts(&PostQuery {
            creator: params.creator,
            before: params.before,
            after: params.after,
            post_kind: params.post_kind,
            visibility: params.visibility,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_post(
    State(state): State<SharedState>,
    Path(post_id): Path<String>,
) -> ApiResult<Json<DataEnvelope<SocialPostRecord>>> {
    state
        .repository
        .get_post(&post_id)
        .await?
        .map(|post| response::data(&state.network, post))
        .ok_or(ApiError::NotFound("post"))
}

async fn list_engagement(
    State(state): State<SharedState>,
    Query(params): Query<EngagementParams>,
) -> ApiResult<Json<DataEnvelope<Vec<EngagementRecord>>>> {
    let items = state
        .repository
        .list_engagement_events(&EngagementQuery {
            creator: params.creator,
            actor: params.actor,
            post_id: params.post_id,
            action_kind: params.action_kind,
            before: params.before,
            after: params.after,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_stakes(
    State(state): State<SharedState>,
    Query(params): Query<StakeParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialStakeRecord>>>> {
    let items = state
        .repository
        .list_social_stakes(&StakeQuery {
            wallet: params.wallet,
            creator: params.creator,
            staker: params.staker,
            state: params.state,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_rewards(
    State(state): State<SharedState>,
    Query(params): Query<RewardParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorRewardRecord>>>> {
    let items = state
        .repository
        .list_creator_rewards(params.creator.as_deref(), clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_reward_accounts(
    State(state): State<SharedState>,
    Query(params): Query<RewardParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialRewardAccountRecord>>>> {
    let items = state
        .repository
        .list_reward_accounts(params.creator.as_deref(), clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_reward_settlements(
    State(state): State<SharedState>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<Vec<RewardSettlementRecord>>>> {
    let items = state
        .repository
        .list_reward_settlements(clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_stake_yields(
    State(state): State<SharedState>,
    Query(params): Query<YieldParams>,
) -> ApiResult<Json<DataEnvelope<Vec<StakeYieldRecord>>>> {
    let items = state
        .repository
        .list_stake_yields(&YieldQuery {
            wallet: params.wallet,
            creator: params.creator,
            staker: params.staker,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_anti_spam(
    State(state): State<SharedState>,
    Query(params): Query<WalletParams>,
) -> ApiResult<Json<DataEnvelope<Vec<AntiSpamProfileRecord>>>> {
    let items = state
        .repository
        .list_anti_spam_profiles(params.wallet.as_deref(), clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_tips(
    State(state): State<SharedState>,
    Query(params): Query<TipParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorTipRecord>>>> {
    let items = state
        .repository
        .list_tips(&TipQuery {
            creator: params.creator,
            sender: params.sender,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_subscriptions(
    State(state): State<SharedState>,
    Query(params): Query<SubscriptionParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SubscriptionRecord>>>> {
    let items = state
        .repository
        .list_subscriptions(&SubscriptionQuery {
            creator: params.creator,
            subscriber: params.subscriber,
            state: params.state,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_unlocks(
    State(state): State<SharedState>,
    Query(params): Query<UnlockParams>,
) -> ApiResult<Json<DataEnvelope<Vec<PaidContentUnlockRecord>>>> {
    let items = state
        .repository
        .list_unlocks(&UnlockQuery {
            creator: params.creator,
            buyer: params.buyer,
            content_id: params.content_id,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_revenues(
    State(state): State<SharedState>,
    Query(params): Query<RewardParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorRevenueRecord>>>> {
    let items = state
        .repository
        .list_creator_revenues(params.creator.as_deref(), clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn list_social_domains(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialDomainSnapshotRecord>>>> {
    let items = state.repository.list_social_domains().await?;
    Ok(response::data(&state.network, items))
}

async fn get_registry(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SocialRegistry>>> {
    Ok(response::data(&state.network, resolve_social_registry()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SocialFiStatus {
    complete: bool,
    condition: String,
    registry_complete: bool,
    registry_schema_version: Option<u32>,
    registry_genesis_hash: Option<String>,
    bootstrap_in_progress: bool,
    live_genesis_hash: String,
    genesis_matches: bool,
    domains: BTreeMap<String, SocialDomainStatus>,
}

impl SocialFiStatus {
    pub(crate) fn is_complete(&self) -> bool {
        self.complete
    }

    pub(crate) fn condition(&self) -> &str {
        &self.condition
    }

    pub(crate) fn registry_complete(&self) -> bool {
        self.registry_complete
    }

    pub(crate) fn registry_genesis_hash(&self) -> Option<&str> {
        self.registry_genesis_hash.as_deref()
    }

    pub(crate) fn genesis_matches(&self) -> bool {
        self.genesis_matches
    }

    pub(crate) fn healthy_domain_count(&self) -> usize {
        self.domains
            .values()
            .filter(|domain| domain.condition == "healthy")
            .count()
    }

    pub(crate) fn domain_count(&self) -> usize {
        self.domains.len()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocialDomainStatus {
    state_account: Option<String>,
    program_id: String,
    present: bool,
    owner_matches: bool,
    initialized: bool,
    condition: String,
    metrics: Value,
    error: Option<String>,
}

async fn get_social_status(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SocialFiStatus>>> {
    let rpc = state.rpc.clone();
    let live_genesis = state.genesis_hash.clone();
    let status = tokio::task::spawn_blocking(move || inspect_social_status(&rpc, &live_genesis))
        .await
        .context("SocialFi status worker panicked")?;
    Ok(response::data_from_source(
        &state.network,
        status,
        "rpc-live",
    ))
}

pub(crate) fn inspect_social_status(rpc: &RpcChainClient, live_genesis: &str) -> SocialFiStatus {
    inspect_social_domains(rpc, resolve_social_registry(), live_genesis)
}

fn inspect_social_domains(
    rpc: &RpcChainClient,
    registry: SocialRegistry,
    live_genesis: &str,
) -> SocialFiStatus {
    let registry_complete = registry.complete;
    let registry_schema_version = registry.schema_version;
    let registry_genesis_hash = registry.genesis_hash.clone();
    let bootstrap_in_progress = registry.bootstrap_in_progress;
    let genesis_matches = registry_genesis_hash.as_deref() == Some(live_genesis);

    let mut domains = BTreeMap::new();
    domains.insert(
        "posts".to_string(),
        inspect_domain::<aeko_social_posts_program::state::SocialPostsStateAccount>(
            rpc,
            registry.posts,
            aeko_social_posts_program::id(),
            "social-posts",
            summarize_posts,
        ),
    );
    domains.insert(
        "rewards".to_string(),
        inspect_domain::<aeko_social_rewards_program::state::SocialRewardsStateAccount>(
            rpc,
            registry.rewards,
            aeko_social_rewards_program::id(),
            "social-rewards",
            summarize_rewards,
        ),
    );
    domains.insert(
        "staking".to_string(),
        inspect_domain::<aeko_social_staking_program::state::SocialStakingStateAccount>(
            rpc,
            registry.staking,
            aeko_social_staking_program::id(),
            "social-staking",
            summarize_staking,
        ),
    );
    domains.insert(
        "antiSpam".to_string(),
        inspect_domain::<aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount>(
            rpc,
            registry.anti_spam,
            aeko_social_anti_spam_program::id(),
            "social-anti-spam",
            summarize_anti_spam,
        ),
    );
    domains.insert(
        "monetization".to_string(),
        inspect_domain::<aeko_social_monetization_program::state::SocialMonetizationStateAccount>(
            rpc,
            registry.monetization,
            aeko_social_monetization_program::id(),
            "social-monetization",
            summarize_monetization,
        ),
    );

    let domains_healthy = domains.values().all(|domain| domain.condition == "healthy");
    let condition = if bootstrap_in_progress {
        "bootstrapInProgress"
    } else if !registry_complete {
        "registryIncomplete"
    } else if registry_genesis_hash.is_none() {
        "legacyRegistry"
    } else if !genesis_matches {
        "genesisMismatch"
    } else if domains_healthy {
        "healthy"
    } else {
        "stateIncomplete"
    }
    .to_string();

    SocialFiStatus {
        complete: registry_complete && genesis_matches && domains_healthy,
        condition,
        registry_complete,
        registry_schema_version,
        registry_genesis_hash,
        bootstrap_in_progress,
        live_genesis_hash: live_genesis.to_string(),
        genesis_matches,
        domains,
    }
}

fn inspect_domain<T>(
    rpc: &RpcChainClient,
    state_account: Option<String>,
    program_id: Pubkey,
    label: &str,
    summarize: fn(T) -> (bool, Value),
) -> SocialDomainStatus
where
    T: BorshDeserialize,
{
    let program_id_string = program_id.to_string();
    let Some(address) = state_account else {
        return SocialDomainStatus {
            state_account: None,
            program_id: program_id_string,
            present: false,
            owner_matches: false,
            initialized: false,
            condition: "registryMissing".to_string(),
            metrics: json!({}),
            error: Some(format!(
                "{label} state is missing from the canonical registry"
            )),
        };
    };

    match rpc.fetch_account_with_data(&address) {
        Ok(None) => SocialDomainStatus {
            state_account: Some(address.clone()),
            program_id: program_id_string,
            present: false,
            owner_matches: false,
            initialized: false,
            condition: "missing".to_string(),
            metrics: json!({}),
            error: Some(format!(
                "canonical {label} state account {address} does not exist"
            )),
        },
        Ok(Some((account, _))) if account.owner != program_id_string => SocialDomainStatus {
            state_account: Some(address),
            program_id: program_id_string.clone(),
            present: true,
            owner_matches: false,
            initialized: false,
            condition: "wrongOwner".to_string(),
            metrics: json!({}),
            error: Some(format!(
                "canonical {label} state owner mismatch: expected {program_id_string}, got {}",
                account.owner
            )),
        },
        Ok(Some((_account, data))) => match deserialize_padded::<T>(&data) {
            Some(value) => {
                let (initialized, metrics) = summarize(value);
                SocialDomainStatus {
                    state_account: Some(address),
                    program_id: program_id_string,
                    present: true,
                    owner_matches: true,
                    initialized,
                    condition: if initialized {
                        "healthy".to_string()
                    } else {
                        "uninitialized".to_string()
                    },
                    metrics,
                    error: if initialized {
                        None
                    } else {
                        Some(format!(
                            "canonical {label} state exists with the expected owner but is not initialized"
                        ))
                    },
                }
            }
            None => SocialDomainStatus {
                state_account: Some(address),
                program_id: program_id_string,
                present: true,
                owner_matches: true,
                initialized: false,
                condition: "invalidData".to_string(),
                metrics: json!({}),
                error: Some(format!(
                    "canonical {label} state is not valid padded Borsh data"
                )),
            },
        },
        Err(error) => SocialDomainStatus {
            state_account: Some(address),
            program_id: program_id_string,
            present: false,
            owner_matches: false,
            initialized: false,
            condition: "rpcError".to_string(),
            metrics: json!({}),
            error: Some(error.to_string()),
        },
    }
}

fn deserialize_padded<T: BorshDeserialize>(data: &[u8]) -> Option<T> {
    let mut input = data;
    let value = T::deserialize(&mut input).ok()?;
    if input.iter().any(|byte| *byte != 0) {
        return None;
    }
    Some(value)
}

fn summarize_posts(
    state: aeko_social_posts_program::state::SocialPostsStateAccount,
) -> (bool, Value) {
    (
        state.is_initialized,
        json!({"posts": state.posts.len(), "engagements": state.engagement_proofs.len(), "postingEnabled": state.config.posting_enabled, "engagementEnabled": state.config.engagement_enabled}),
    )
}
fn summarize_rewards(
    state: aeko_social_rewards_program::state::SocialRewardsStateAccount,
) -> (bool, Value) {
    (
        state.is_initialized,
        json!({"creators": state.creators.len(), "epochs": state.epochs.len(), "settlements": state.settlements.len(), "rewardsEnabled": state.config.rewards_enabled}),
    )
}
fn summarize_staking(
    state: aeko_social_staking_program::state::SocialStakingStateAccount,
) -> (bool, Value) {
    (
        state.is_initialized,
        json!({"positions": state.positions.len(), "yieldRecords": state.yield_records.len(), "stakingEnabled": state.config.staking_enabled}),
    )
}
fn summarize_anti_spam(
    state: aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount,
) -> (bool, Value) {
    (
        state.is_initialized,
        json!({"profiles": state.profiles.len(), "mode": format!("{:?}", state.config.mode), "minPostStake": state.config.min_post_stake, "minPostReputation": state.config.min_post_reputation}),
    )
}
fn summarize_monetization(
    state: aeko_social_monetization_program::state::SocialMonetizationStateAccount,
) -> (bool, Value) {
    (
        state.is_initialized,
        json!({"tips": state.tips.len(), "subscriptions": state.subscriptions.len(), "unlocks": state.unlocks.len(), "revenues": state.revenues.len(), "subscriptionsEnabled": state.config.subscriptions_enabled, "paidContentEnabled": state.config.paid_content_enabled, "platformFeeBps": state.config.platform_fee_bps}),
    )
}
