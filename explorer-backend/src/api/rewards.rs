use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::ApiResult,
        models::CreatorRewardRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new().route("/rewards", get(list_rewards))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    creator: Option<String>,
    limit: Option<usize>,
}

async fn list_rewards(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<CreatorRewardRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_creator_rewards(params.creator.as_deref(), over_fetch(limit))?;
    items.truncate(limit);
    Ok(response::data(&state.network, items))
}
