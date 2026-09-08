use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::ApiResult,
        models::SocialStakeRecord,
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
    Router::new().route("/stakes", get(list_stakes))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    wallet: Option<String>,
    creator: Option<String>,
    staker: Option<String>,
    state: Option<String>,
    limit: Option<usize>,
}

async fn list_stakes(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialStakeRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_social_stakes(params.wallet.as_deref(), over_fetch(limit))?;

    if let Some(creator) = params.creator.as_deref() {
        items.retain(|item| item.creator == creator);
    }
    if let Some(staker) = params.staker.as_deref() {
        items.retain(|item| item.staker == staker);
    }
    if let Some(stake_state) = params.state.as_deref() {
        items.retain(|item| item.state == stake_state);
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}
