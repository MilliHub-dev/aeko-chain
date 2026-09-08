use {
    crate::{
        api::query::clamp_limit,
        error::{ApiError, ApiResult},
        models::AccountDetailRecord,
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
    Router::new().route("/accounts/:address", get(get_account))
}

#[derive(Debug, Deserialize)]
pub struct DetailParams {
    limit: Option<usize>,
}

async fn get_account(
    State(state): State<SharedState>,
    Path(address): Path<String>,
    Query(params): Query<DetailParams>,
) -> ApiResult<Json<DataEnvelope<AccountDetailRecord>>> {
    match state
        .api
        .get_account_detail(&address, clamp_limit(params.limit))?
    {
        Some(detail) => Ok(response::data(&state.network, detail)),
        None => Err(ApiError::NotFound("account")),
    }
}
