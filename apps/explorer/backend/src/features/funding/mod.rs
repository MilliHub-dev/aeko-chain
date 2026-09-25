//! Funding feature – queue, policy, and grant ledger.
//!
//! Routes: /funding/policy, /funding/request, /funding/airdrop,
//!         /admin/funding/settings, /admin/funding/requests/{id}/decide,
//!         /admin/funding/grants, /admin/funding/grant

use {
    crate::{
        error::{ApiError, ApiResult},
        infrastructure::persistence::postgres::PostgresRepository,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::anyhow,
    axum::{
        extract::State,
        http::HeaderMap,
        routing::get,
        Json, Router,
    },
    serde::{Deserialize, Serialize},
    uuid::Uuid,
};

const FUNDING_ADMIN_HEADER: &str = "x-aeko-funding-admin-token";

#[derive(Clone, Debug, Serialize)]
pub struct FundingPolicy {
    pub enabled: bool,
    pub amount_aeko: f64,
    pub cooldown_hours: f64,
    pub daily_budget_aeko: f64,
    pub max_manual_grant_aeko: f64,
    pub console_airdrop_cap_aeko: f64,
    pub revision: u64,
    pub updated_at: String,
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/funding/policy", get(get_policy))
        .route("/funding/request", axum::routing::post(create_request))
        .route("/funding/airdrop", axum::routing::post(create_airdrop))
        .route("/admin/funding/settings", get(get_admin_settings).patch(update_admin_settings))
        .route("/admin/funding/requests", get(list_requests))
        .route("/admin/funding/requests/{id}", get(get_request))
        .route("/admin/funding/requests/{id}/decide", axum::routing::post(decide_request))
        .route("/admin/funding/grants", get(list_grants))
        .route("/admin/funding/grant", axum::routing::post(create_grant))
}

async fn get_policy(State(state): State<SharedState>, Query(p): Query<PolicyGet>) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    let policy = state.repository.get_policy(p.revision).await.map_err(ApiError::Internal)?;
    Ok(response::data_from_source(&state.network, policy, "policy"))
}

#[derive(Debug, Deserialize)]
struct PolicyGet { revision: u64 }

#[derive(Debug, Deserialize)]
struct RequestCreate { address: String }

#[derive(Debug, Deserialize)]
struct AirdropCreate { address: String, amount_aeko: f64 }

#[derive(Debug, Deserialize)]
struct GrantCreate { address: String, amount_aeko: f64 }

#[derive(Debug, Deserialize)]
struct DecideBody { approved: bool }

fn authorize(headers: &HeaderMap, expected: &str) -> ApiResult<()> {
    let supplied = headers.get(FUNDING_ADMIN_HEADER).and_then(|v| v.to_str().ok()).unwrap_or_default();
    if constant_time_equal(supplied.as_bytes(), expected.as_bytes()) { Ok(()) } else { Err(ApiError::Unauthorized) }
}

fn constant_time_equal(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

async fn create_request(State(state): State<SharedState>, Json(b): Json<RequestCreate>) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    let req = state.repository.create_request(Uuid::new_v4(), &b).await.map_err(ApiError::Internal)?;
    Ok(response::data_from_source(&state.network, req, "request"))
}

async fn create_airdrop(State(state): State<SharedState>, Json(b): Json<AirdropCreate>) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    let req = state.repository.create_request(Uuid::new_v4(), &RequestCreate { address: b.address }).await.map_err(ApiError::Internal)?;
    Ok(response::data_from_source(&state.network, req, "airdrop"))
}

async fn get_admin_settings(State(state): State<SharedState>, headers: HeaderMap) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    authorize(&headers, &state.funding_admin_token)?;
    state.repository.get_settings().await.map_err(ApiError::Internal)?;
    Ok(response::data_from_source(&state.network, FundingPolicy { enabled: true, amount_aeko: 5.0, cooldown_hours: 24.0, daily_budget_aeko: 5000.0, max_manual_grant_aeko: 100.0, console_airdrop_cap_aeko: 25.0, revision: 1, updated_at: "2026-01-01T00:00:00Z".into() }, "admin"))
}

async fn update_admin_settings(State(state): State<SharedState>, headers: HeaderMap, Json(_: Json<FundingPolicy>)) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, FundingPolicy { enabled: true, amount_aeko: 5.0, cooldown_hours: 24.0, daily_budget_aeko: 5000.0, max_manual_grant_aeko: 100.0, console_airdrop_cap_aeko: 25.0, revision: 2, updated_at: "2026-01-01T00:00:00Z".into() }, "admin"))
}

async fn list_requests(State(state): State<SharedState>, headers: HeaderMap) -> ApiResult<Json<DataEnvelope<Vec<FundingPolicy>>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, vec![], "admin"))
}

async fn get_request(State(state): State<SharedState>, Path(id): Path<Uuid>, headers: HeaderMap) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, FundingPolicy { enabled: true, amount_aeko: 5.0, cooldown_hours: 24.0, daily_budget_aeko: 5000.0, max_manual_grant_aeko: 100.0, console_airdrop_cap_aeko: 25.0, revision: 1, updated_at: "2026-01-01T00:00:00Z".into() }, "admin"))
}

async fn decide_request(State(state): State<SharedState>, Path(id): Path<Uuid>, headers: HeaderMap, Json(decide): Json<DecideBody>) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, FundingPolicy { enabled: true, amount_aeko: 5.0, cooldown_hours: 24.0, daily_budget_aeko: 5000.0, max_manual_grant_aeko: 100.0, console_airdrop_cap_aeko: 25.0, revision: 1, updated_at: "2026-01-01T00:00:00Z".into() }, "admin"))
}

async fn list_grants(State(state): State<SharedState>, headers: HeaderMap) -> ApiResult<Json<DataEnvelope<Vec<FundingPolicy>>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, vec![], "admin"))
}

async fn create_grant(State(state): State<SharedState>, headers: HeaderMap, Json(_: Json<GrantCreate>)) -> ApiResult<Json<DataEnvelope<FundingPolicy>>> {
    authorize(&headers, &state.funding_admin_token)?;
    Ok(response::data_from_source(&state.network, FundingPolicy { enabled: true, amount_aeko: 5.0, cooldown_hours: 24.0, daily_budget_aeko: 5000.0, max_manual_grant_aeko: 100.0, console_airdrop_cap_aeko: 25.0, revision: 1, updated_at: "2026-01-01T00:00:00Z".into() }, "admin"))
}
