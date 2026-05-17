use {
    crate::{error::ApiResult, response, state::SharedState},
    axum::extract::State,
    serde_json::json,
};

pub async fn root(State(state): State<SharedState>) -> ApiResult<axum::Json<response::DataEnvelope<serde_json::Value>>> {
    Ok(response::data(&state.network, json!({ "ok": true })))
}

pub async fn health(state: State<SharedState>) -> ApiResult<axum::Json<response::DataEnvelope<serde_json::Value>>> {
    root(state).await
}
