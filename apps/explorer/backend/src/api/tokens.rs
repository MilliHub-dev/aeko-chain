use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::{ApiError, ApiResult},
        models::{TokenSummaryRecord, TokenTransferRecord},
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
        .route("/tokens/transfers", get(list_transfers))
        .route("/tokens/:mint", get(token_summary))
}

#[derive(Debug, Deserialize)]
pub struct TransfersParams {
    mint: Option<String>,
    address: Option<String>,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct SummaryParams {
    limit: Option<usize>,
}

async fn list_transfers(
    State(state): State<SharedState>,
    Query(params): Query<TransfersParams>,
) -> ApiResult<Json<DataEnvelope<Vec<TokenTransferRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_token_transfers(params.mint.as_deref(), over_fetch(limit))?;

    if let Some(address) = params.address.as_deref() {
        items.retain(|item| item.source == address || item.destination == address);
    }
    if let Some(before) = params.before {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = params.after {
        items.retain(|item| item.slot > after);
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}

async fn token_summary(
    State(state): State<SharedState>,
    Path(mint): Path<String>,
    Query(params): Query<SummaryParams>,
) -> ApiResult<Json<DataEnvelope<TokenSummaryRecord>>> {
    match state.api.get_token_summary(&mint, clamp_limit(params.limit))? {
        Some(token) => Ok(response::data(&state.network, token)),
        None => Err(ApiError::NotFound("token")),
    }
}
