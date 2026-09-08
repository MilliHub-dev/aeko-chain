use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::{
            chain::RpcChainClient,
            persistence::social::{EngagementQuery, PostQuery, StakeQuery},
            registry::{resolve_social_registry, SocialRegistry},
        },
        models::{CreatorRewardRecord, EngagementRecord, SocialPostRecord, SocialStakeRecord},
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::Context,
    aeko_sdk::pubkey::Pubkey,
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

async fn get_registry(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SocialRegistry>>> {
    Ok(response::data(&state.network, resolve_social_registry()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocialFiStatus {
    complete: bool,
    domains: BTreeMap<String, SocialDomainStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocialDomainStatus {
    state_account: Option<String>,
    program_id: String,
    owner_matches: bool,
    initialized: bool,
    metrics: Value,
    error: Option<String>,
}

async fn get_social_status(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SocialFiStatus>>> {
    let rpc = state.rpc.clone();
    let registry = resolve_social_registry();
    let status = tokio::task::spawn_blocking(move || inspect_social_domains(&rpc, registry))
        .await
        .context("SocialFi status worker panicked")?;
    Ok(response::data_from_source(&state.network, status, "rpc-live"))
}

fn inspect_social_domains(rpc: &RpcChainClient, registry: SocialRegistry) -> SocialFiStatus {
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
    let complete = domains
        .values()
        .all(|domain| domain.owner_matches && domain.initialized && domain.error.is_none());
    SocialFiStatus { complete, domains }
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
    let Some(address) = state_account else {
        return SocialDomainStatus {
            state_account: None,
            program_id: program_id.to_string(),
            owner_matches: false,
            initialized: false,
            metrics: json!({}),
            error: Some(format!("{label} state is missing from the canonical registry")),
        };
    };
    match rpc.fetch_owned_state::<T>(&address, program_id, label) {
        Ok(value) => {
            let (initialized, metrics) = summarize(value);
            SocialDomainStatus {
                state_account: Some(address),
                program_id: program_id.to_string(),
                owner_matches: true,
                initialized,
                metrics,
                error: None,
            }
        }
        Err(error) => SocialDomainStatus {
            state_account: Some(address),
            program_id: program_id.to_string(),
            owner_matches: false,
            initialized: false,
            metrics: json!({}),
            error: Some(error.to_string()),
        },
    }
}

fn summarize_posts(state: aeko_social_posts_program::state::SocialPostsStateAccount) -> (bool, Value) {
    (state.is_initialized, json!({
        "posts": state.posts.len(),
        "engagements": state.engagement_proofs.len(),
        "postingEnabled": state.config.posting_enabled,
        "engagementEnabled": state.config.engagement_enabled,
    }))
}

fn summarize_rewards(state: aeko_social_rewards_program::state::SocialRewardsStateAccount) -> (bool, Value) {
    (state.is_initialized, json!({
        "creators": state.creators.len(),
        "epochs": state.epochs.len(),
        "settlements": state.settlements.len(),
        "rewardsEnabled": state.config.rewards_enabled,
    }))
}

fn summarize_staking(state: aeko_social_staking_program::state::SocialStakingStateAccount) -> (bool, Value) {
    (state.is_initialized, json!({
        "positions": state.positions.len(),
        "yieldRecords": state.yield_records.len(),
        "stakingEnabled": state.config.staking_enabled,
    }))
}

fn summarize_anti_spam(state: aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount) -> (bool, Value) {
    (state.is_initialized, json!({
        "profiles": state.profiles.len(),
        "mode": format!("{:?}", state.config.mode),
        "minPostStake": state.config.min_post_stake,
        "minPostReputation": state.config.min_post_reputation,
    }))
}

fn summarize_monetization(state: aeko_social_monetization_program::state::SocialMonetizationStateAccount) -> (bool, Value) {
    (state.is_initialized, json!({
        "tips": state.tips.len(),
        "subscriptions": state.subscriptions.len(),
        "unlocks": state.unlocks.len(),
        "revenues": state.revenues.len(),
        "subscriptionsEnabled": state.config.subscriptions_enabled,
        "paidContentEnabled": state.config.paid_content_enabled,
        "platformFeeBps": state.config.platform_fee_bps,
    }))
}
