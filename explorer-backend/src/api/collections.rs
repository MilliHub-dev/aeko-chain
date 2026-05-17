use {
    crate::{
        api::query::clamp_limit,
        error::{ApiError, ApiResult},
        models::CollectionSummaryRecord,
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
    Router::new().route("/collections/:collection_id", get(get_collection))
}

#[derive(Debug, Deserialize)]
pub struct SummaryParams {
    limit: Option<usize>,
}

async fn get_collection(
    State(state): State<SharedState>,
    Path(collection_id): Path<String>,
    Query(params): Query<SummaryParams>,
) -> ApiResult<Json<DataEnvelope<CollectionSummaryRecord>>> {
    match state
        .api
        .get_collection_summary(&collection_id, clamp_limit(params.limit))?
    {
        Some(collection) => Ok(response::data(&state.network, collection)),
        None => Err(ApiError::NotFound("collection")),
    }
}
