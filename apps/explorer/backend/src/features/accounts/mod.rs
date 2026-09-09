use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::persistence::social::StakeQuery,
        models::{AccountDetailRecord, CreatorProfileRecord, CreatorRewardRecord, SocialStakeRecord},
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
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/accounts/:address", get(get_account))
        .route("/creators/:address", get(get_creator))
        .route("/creators/:address/rewards", get(creator_rewards))
        .route("/creators/:address/stake", get(creator_stakes))
}

#[derive(Debug, Deserialize)]
struct LimitParams {
    limit: Option<usize>,
}

fn validate_address(address: &str) -> Result<(), ApiError> {
    address
        .parse::<Pubkey>()
        .map(|_| ())
        .map_err(|_| ApiError::BadRequest("invalid AEKO account address".to_string()))
}

async fn fetch_live_account(
    state: &SharedState,
    address: String,
) -> ApiResult<Option<crate::models::ChainAccountRecord>> {
    validate_address(&address)?;
    let rpc = state.rpc.clone();
    tokio::task::spawn_blocking(move || rpc.fetch_account(&address))
        .await
        .context("live account RPC worker panicked")?
        .map_err(ApiError::from)
}

async fn get_account(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<AccountDetailRecord>>> {
    let account = fetch_live_account(&state, address).await?
        .ok_or(ApiError::NotFound("account"))?;
    let detail = state
        .repository
        .get_account_detail_from_chain(account, clamp_limit(params.limit))
        .await?;
    Ok(response::data_from_source(&state.network, detail, "rpc+indexer"))
}

async fn get_creator(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<CreatorProfileRecord>>> {
    let account = fetch_live_account(&state, address.clone()).await?
        .ok_or(ApiError::NotFound("creator"))?;
    let profile = state
        .repository
        .get_creator_profile_from_chain(
            &address,
            Some(account.lamports),
            clamp_limit(params.limit),
        )
        .await?;
    Ok(response::data_from_source(&state.network, profile, "rpc+indexer"))
}

async fn creator_rewards(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorRewardRecord>>>> {
    validate_address(&address)?;
    let items = state
        .repository
        .list_creator_rewards(Some(&address), clamp_limit(params.limit))
        .await?;
    Ok(response::data(&state.network, items))
}

async fn creator_stakes(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialStakeRecord>>>> {
    validate_address(&address)?;
    let items = state
        .repository
        .list_social_stakes(&StakeQuery {
            creator: Some(address),
            limit: clamp_limit(params.limit),
            ..StakeQuery::default()
        })
        .await?;
    Ok(response::data(&state.network, items))
}
