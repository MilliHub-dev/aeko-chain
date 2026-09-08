use {
    crate::{
        api::query::clamp_limit,
        error::ApiResult,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
    serde_json::{json, Value},
};

pub fn router() -> Router<SharedState> {
    Router::new().route("/search", get(search))
}

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    q: Option<String>,
    limit: Option<usize>,
}

async fn search(
    State(state): State<SharedState>,
    Query(params): Query<SearchParams>,
) -> ApiResult<Json<DataEnvelope<Value>>> {
    let query = params.q.as_deref().unwrap_or("");
    let matches = state.api.search(query, clamp_limit(params.limit))?;
    Ok(response::data(&state.network, json!({ "matches": matches })))
}
