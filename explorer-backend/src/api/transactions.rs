use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::{ApiError, ApiResult},
        models::TransactionRecord,
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
        .route("/transactions", get(list_transactions))
        .route("/transactions/:signature", get(get_transaction))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    before: Option<u64>,
    after: Option<u64>,
    address: Option<String>,
    #[serde(rename = "type")]
    primary_program: Option<String>,
    status: Option<String>,
    limit: Option<usize>,
}

async fn list_transactions(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<TransactionRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state.api.list_transactions(over_fetch(limit))?;

    if let Some(before) = params.before {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = params.after {
        items.retain(|item| item.slot > after);
    }
    if let Some(address) = params.address.as_deref() {
        items.retain(|item| item.signer.as_deref() == Some(address));
    }
    if let Some(kind) = params.primary_program.as_deref() {
        items.retain(|item| item.primary_program.as_deref() == Some(kind));
    }
    if let Some(status) = params.status.as_deref() {
        let want_success = matches!(status, "success" | "confirmed" | "ok");
        let want_failed = matches!(status, "failed" | "error");
        if want_success || want_failed {
            items.retain(|item| item.success == want_success);
        }
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}

async fn get_transaction(
    State(state): State<SharedState>,
    Path(signature): Path<String>,
) -> ApiResult<Json<DataEnvelope<TransactionRecord>>> {
    match state.api.get_transaction(&signature)? {
        Some(tx) => Ok(response::data(&state.network, tx)),
        None => Err(ApiError::NotFound("transaction")),
    }
}
