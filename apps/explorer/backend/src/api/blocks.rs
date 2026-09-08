use {
    crate::{
        api::query::{over_fetch, SlotWindowParams},
        error::{ApiError, ApiResult},
        models::BlockRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/blocks", get(list_blocks))
        .route("/blocks/:slot", get(get_block))
}

async fn list_blocks(
    State(state): State<SharedState>,
    Query(params): Query<SlotWindowParams>,
) -> ApiResult<Json<DataEnvelope<Vec<BlockRecord>>>> {
    let limit = params.resolved_limit();
    let mut items = state.api.list_blocks(over_fetch(limit))?;
    if let Some(before) = params.before {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = params.after {
        items.retain(|item| item.slot > after);
    }
    items.truncate(limit);
    Ok(response::data(&state.network, items))
}

async fn get_block(
    State(state): State<SharedState>,
    Path(slot): Path<u64>,
) -> ApiResult<Json<DataEnvelope<BlockRecord>>> {
    match state.api.get_block(slot)? {
        Some(block) => Ok(response::data(&state.network, block)),
        None => Err(ApiError::NotFound("block")),
    }
}
