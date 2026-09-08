use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::persistence::ledger::{BlockQuery, TransactionQuery},
        models::{BlockRecord, TransactionRecord},
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
        .route("/blocks", get(list_blocks))
        .route("/blocks/:slot", get(get_block))
        .route("/transactions", get(list_transactions))
        .route("/transactions/:signature", get(get_transaction))
}

#[derive(Debug, Deserialize)]
struct BlockParams {
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct TransactionParams {
    before: Option<u64>,
    after: Option<u64>,
    address: Option<String>,
    #[serde(rename = "type")]
    primary_program: Option<String>,
    status: Option<String>,
    limit: Option<usize>,
}

async fn list_blocks(
    State(state): State<SharedState>,
    Query(params): Query<BlockParams>,
) -> ApiResult<Json<DataEnvelope<Vec<BlockRecord>>>> {
    let items = state
        .repository
        .list_blocks(&BlockQuery {
            before: params.before,
            after: params.after,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_block(
    State(state): State<SharedState>,
    Path(slot): Path<u64>,
) -> ApiResult<Json<DataEnvelope<BlockRecord>>> {
    state
        .repository
        .get_block(slot)
        .await?
        .map(|block| response::data(&state.network, block))
        .ok_or(ApiError::NotFound("block"))
}

async fn list_transactions(
    State(state): State<SharedState>,
    Query(params): Query<TransactionParams>,
) -> ApiResult<Json<DataEnvelope<Vec<TransactionRecord>>>> {
    let success = match params.status.as_deref() {
        None => None,
        Some("success" | "confirmed" | "ok") => Some(true),
        Some("failed" | "error") => Some(false),
        Some(value) => {
            return Err(ApiError::BadRequest(format!(
                "unsupported transaction status {value:?}"
            )))
        }
    };
    let items = state
        .repository
        .list_transactions(&TransactionQuery {
            before: params.before,
            after: params.after,
            address: params.address,
            primary_program: params.primary_program,
            success,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_transaction(
    State(state): State<SharedState>,
    Path(signature): Path<String>,
) -> ApiResult<Json<DataEnvelope<TransactionRecord>>> {
    state
        .repository
        .get_transaction(&signature)
        .await?
        .map(|transaction| response::data(&state.network, transaction))
        .ok_or(ApiError::NotFound("transaction"))
}
