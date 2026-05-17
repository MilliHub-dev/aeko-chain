use {
    crate::{
        api::query::clamp_limit,
        error::{ApiError, ApiResult},
        models::{CreatorProfileRecord, CreatorRewardRecord, SocialStakeRecord},
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/creators/:address", get(get_creator))
        .route("/creators/:address/rewards", get(creator_rewards))
        .route("/creators/:address/stake", get(creator_stakes))
}

#[derive(Debug, Deserialize)]
pub struct ProfileParams {
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    limit: Option<usize>,
}

async fn get_creator(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<ProfileParams>,
) -> ApiResult<Json<DataEnvelope<CreatorProfileRecord>>> {
    match state
        .api
        .get_creator_profile(&address, clamp_limit(params.limit))?
    {
        Some(profile) => Ok(response::data(&state.network, profile)),
        None => Err(ApiError::NotFound("creator")),
    }
}

async fn creator_rewards(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorRewardRecord>>>> {
    let items = state
        .api
        .list_creator_rewards(Some(&address), clamp_limit(params.limit))?;
    Ok(response::data(&state.network, items))
}

async fn creator_stakes(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialStakeRecord>>>> {
    let items = state
        .api
        .list_social_stakes(Some(&address), clamp_limit(params.limit))?;
    Ok(response::data(&state.network, items))
}
