use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::{ApiError, ApiResult},
        models::NftRecord,
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
        .route("/nfts", get(list_nfts))
        .route("/nfts/:token_id", get(get_nft))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    collection: Option<String>,
    owner: Option<String>,
    creator: Option<String>,
    limit: Option<usize>,
}

async fn list_nfts(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<NftRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_nfts(params.collection.as_deref(), over_fetch(limit))?;

    if let Some(owner) = params.owner.as_deref() {
        items.retain(|item| item.owner == owner);
    }
    if let Some(creator) = params.creator.as_deref() {
        items.retain(|item| item.creator == creator);
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}

async fn get_nft(
    State(state): State<SharedState>,
    Path(token_id): Path<String>,
) -> ApiResult<Json<DataEnvelope<NftRecord>>> {
    match state.api.get_nft(&token_id)? {
        Some(nft) => Ok(response::data(&state.network, nft)),
        None => Err(ApiError::NotFound("nft")),
    }
}
