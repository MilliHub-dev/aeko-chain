use {
    crate::{
        infrastructure::persistence::funding::{
            FundingAirdropRecord, FundingRequestRecord, FundingSettingsUpdate, FundingStoreError,
            FundingTransferRecord, PersistedFundingSettings,
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Path, Query, State},
        http::{header, HeaderMap, HeaderValue, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
        Json, Router,
    },
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    tower_http::set_header::SetResponseHeaderLayer,
};

mod guards;
mod settlement;

use guards::{
    apply_rate_limit, apply_subject_rate_limit, authorize_admin,
    ensure_developer_airdrop_available, ensure_funding_available, validate_address,
    validate_direct_amount, validate_non_negative, validate_positive,
};
use settlement::{observe_funding, submit_and_observe_airdrop, submit_and_observe_funding};
pub use settlement::{reconcile_submitted_settlements_once, run_settlement_reconciler};

const ADMIN_HEADER: &str = "x-aeko-settings-token";

#[derive(Debug)]
struct FundingHttpError {
    status: StatusCode,
    code: &'static str,
    message: String,
    extra: Value,
    retry_after_seconds: Option<u64>,
}

impl FundingHttpError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            extra: json!({}),
            retry_after_seconds: None,
        }
    }

    fn with_extra(mut self, extra: Value) -> Self {
        self.extra = extra;
        self
    }

    fn with_retry_after(mut self, seconds: u64) -> Self {
        self.retry_after_seconds = Some(seconds);
        self
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(error = %error, "funding request failed internally");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL",
            "Funding service failed internally",
        )
    }
}

impl IntoResponse for FundingHttpError {
    fn into_response(self) -> Response {
        let mut error = json!({
            "code": self.code,
            "message": self.message,
        });
        if let (Some(target), Some(extra)) = (error.as_object_mut(), self.extra.as_object()) {
            for (key, value) in extra {
                target.insert(key.clone(), value.clone());
            }
        }
        let mut response = (self.status, Json(json!({ "error": error }))).into_response();
        if let Some(seconds) = self.retry_after_seconds {
            if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
                response.headers_mut().insert("retry-after", value);
            }
        }
        response
    }
}

type FundingResult<T> = Result<T, FundingHttpError>;

impl From<FundingStoreError> for FundingHttpError {
    fn from(error: FundingStoreError) -> Self {
        match error {
            FundingStoreError::Disabled => Self::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_DISABLED",
                "Funding is paused by the operator",
            ),
            FundingStoreError::Cooldown {
                retry_after_seconds,
            } => Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "COOLDOWN",
                "This wallet is still in its public funding cooldown",
            )
            .with_extra(json!({ "retryAfterSeconds": retry_after_seconds }))
            .with_retry_after(retry_after_seconds),
            FundingStoreError::RequestPending { request_id } => Self::new(
                StatusCode::CONFLICT,
                "REQUEST_PENDING",
                "This wallet already has a funding request awaiting a decision",
            )
            .with_extra(json!({ "requestId": request_id })),
            FundingStoreError::BudgetExhausted => Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "BUDGET_EXHAUSTED",
                "Today's public funding allocation is exhausted",
            ),
            FundingStoreError::RequestNotFound => Self::new(
                StatusCode::NOT_FOUND,
                "REQUEST_NOT_FOUND",
                "Funding request was not found",
            ),
            FundingStoreError::AirdropNotFound => Self::new(
                StatusCode::NOT_FOUND,
                "AIRDROP_NOT_FOUND",
                "Developer airdrop was not found",
            ),
            FundingStoreError::RequestAlreadyDecided { status } => Self::new(
                StatusCode::CONFLICT,
                "REQUEST_ALREADY_DECIDED",
                format!("Funding request is already {status}"),
            ),
            FundingStoreError::RevisionConflict => Self::new(
                StatusCode::CONFLICT,
                "REVISION_CONFLICT",
                "Funding policy changed since it was loaded; reload and retry",
            ),
            FundingStoreError::RateLimited {
                retry_after_seconds,
            } => Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "Too many funding requests from this client",
            )
            .with_extra(json!({ "retryAfterSeconds": retry_after_seconds }))
            .with_retry_after(retry_after_seconds),
            FundingStoreError::Database(error) => Self::internal(error),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingSettingsView {
    enabled: bool,
    amount_aeko: f64,
    cooldown_hours: f64,
    daily_budget_aeko: f64,
    max_admin_funding_aeko: f64,
    console_airdrop_cap_aeko: f64,
    revision: u64,
    updated_at: String,
}

impl TryFrom<PersistedFundingSettings> for FundingSettingsView {
    type Error = FundingHttpError;

    fn try_from(value: PersistedFundingSettings) -> Result<Self, Self::Error> {
        let revision = u64::try_from(value.revision)
            .map_err(|_| FundingHttpError::internal("negative funding settings revision"))?;
        Ok(Self {
            enabled: value.enabled,
            amount_aeko: value.amount_aeko,
            cooldown_hours: value.cooldown_hours,
            daily_budget_aeko: value.daily_budget_aeko,
            max_admin_funding_aeko: value.max_admin_funding_aeko,
            console_airdrop_cap_aeko: value.console_airdrop_cap_aeko,
            revision,
            updated_at: value.updated_at.to_rfc3339(),
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingPolicyView {
    enabled: bool,
    amount_aeko: f64,
    cooldown_hours: f64,
    daily_budget_aeko: f64,
    daily_remaining_aeko: f64,
    public_spent_aeko: f64,
    public_reserved_aeko: f64,
    console_airdrop_cap_aeko: f64,
    developer_airdrop_enabled: bool,
    faucet_per_request_cap_aeko: f64,
    revision: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingRequestView {
    id: String,
    address: String,
    amount_aeko: f64,
    requested_at: String,
    source: String,
    status: String,
    decided_at: Option<String>,
    submitted_at: Option<String>,
    confirmed_at: Option<String>,
    signature: Option<String>,
    confirmed: bool,
    error_code: Option<String>,
    error_message: Option<String>,
}

impl From<FundingRequestRecord> for FundingRequestView {
    fn from(value: FundingRequestRecord) -> Self {
        Self {
            id: value.id,
            address: value.address,
            amount_aeko: value.amount_aeko,
            requested_at: value.requested_at.to_rfc3339(),
            source: value.source,
            status: value.status,
            decided_at: value.decided_at.map(|value| value.to_rfc3339()),
            submitted_at: value.submitted_at.map(|value| value.to_rfc3339()),
            confirmed_at: value.confirmed_at.map(|value| value.to_rfc3339()),
            signature: value.signature,
            confirmed: value.confirmed,
            error_code: value.error_code,
            error_message: value.error_message,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingTransferView {
    id: String,
    request_id: Option<String>,
    address: String,
    amount_aeko: f64,
    signature: Option<String>,
    funded_at: String,
    source: String,
    confirmed: bool,
}

impl From<FundingTransferRecord> for FundingTransferView {
    fn from(value: FundingTransferRecord) -> Self {
        Self {
            id: value.id,
            request_id: value.request_id,
            address: value.address,
            amount_aeko: value.amount_aeko,
            signature: value.signature,
            funded_at: value.funded_at.to_rfc3339(),
            source: value.source,
            confirmed: value.confirmed,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicFundingRequestStatusView {
    id: String,
    amount_aeko: f64,
    requested_at: String,
    status: String,
    decided_at: Option<String>,
    submitted_at: Option<String>,
    confirmed_at: Option<String>,
    signature: Option<String>,
    confirmed: bool,
    error_code: Option<String>,
}

impl From<FundingRequestRecord> for PublicFundingRequestStatusView {
    fn from(value: FundingRequestRecord) -> Self {
        Self {
            id: value.id,
            amount_aeko: value.amount_aeko,
            requested_at: value.requested_at.to_rfc3339(),
            status: value.status,
            decided_at: value.decided_at.map(|value| value.to_rfc3339()),
            submitted_at: value.submitted_at.map(|value| value.to_rfc3339()),
            confirmed_at: value.confirmed_at.map(|value| value.to_rfc3339()),
            signature: value.signature,
            confirmed: value.confirmed,
            error_code: value.error_code,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingAirdropView {
    id: String,
    address: String,
    amount_aeko: f64,
    signature: Option<String>,
    status: String,
    confirmed: bool,
    requested_at: String,
    submitted_at: Option<String>,
    confirmed_at: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
}

impl From<FundingAirdropRecord> for FundingAirdropView {
    fn from(value: FundingAirdropRecord) -> Self {
        let confirmed = value.status == "confirmed";
        Self {
            id: value.id,
            address: value.address,
            amount_aeko: value.amount_aeko,
            signature: value.signature,
            status: value.status,
            confirmed,
            requested_at: value.requested_at.to_rfc3339(),
            submitted_at: value.submitted_at.map(|value| value.to_rfc3339()),
            confirmed_at: value.confirmed_at.map(|value| value.to_rfc3339()),
            error_code: value.error_code,
            error_message: value.error_message,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminFundingSnapshot {
    network: String,
    mode: &'static str,
    settings: Option<FundingSettingsView>,
    daily_remaining_aeko: Option<f64>,
    public_spent_aeko: Option<f64>,
    public_reserved_aeko: Option<f64>,
    console_airdrop_aggregate_unlimited: bool,
    developer_airdrop_enabled: bool,
    faucet_per_request_cap_aeko: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FundingRequestBody {
    address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DirectFundingBody {
    address: String,
    amount_aeko: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FundingDecisionBody {
    approved: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FundingSettingsPatch {
    expected_revision: u64,
    enabled: Option<bool>,
    amount_aeko: Option<f64>,
    cooldown_hours: Option<f64>,
    daily_budget_aeko: Option<f64>,
    max_admin_funding_aeko: Option<f64>,
    console_airdrop_cap_aeko: Option<f64>,
}

impl FundingSettingsPatch {
    fn validate(&self, hard_cap: f64) -> FundingResult<()> {
        if self.expected_revision == 0 {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                "expectedRevision must be greater than zero",
            ));
        }
        let has_change = self.enabled.is_some()
            || self.amount_aeko.is_some()
            || self.cooldown_hours.is_some()
            || self.daily_budget_aeko.is_some()
            || self.max_admin_funding_aeko.is_some()
            || self.console_airdrop_cap_aeko.is_some();
        if !has_change {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                "At least one funding setting must be supplied",
            ));
        }
        validate_positive(self.amount_aeko, "amountAeko")?;
        validate_non_negative(self.cooldown_hours, "cooldownHours")?;
        validate_positive(self.daily_budget_aeko, "dailyBudgetAeko")?;
        validate_positive(self.max_admin_funding_aeko, "maxAdminFundingAeko")?;
        validate_positive(self.console_airdrop_cap_aeko, "consoleAirdropCapAeko")?;
        for (name, value) in [
            ("amountAeko", self.amount_aeko),
            ("maxAdminFundingAeko", self.max_admin_funding_aeko),
            ("consoleAirdropCapAeko", self.console_airdrop_cap_aeko),
        ] {
            if value.is_some_and(|value| value > hard_cap) {
                return Err(FundingHttpError::new(
                    StatusCode::BAD_REQUEST,
                    "ABOVE_FAUCET_HARD_CAP",
                    format!("{name} cannot exceed the Faucet hard cap of {hard_cap} AEKO"),
                ));
            }
        }
        Ok(())
    }

    fn into_update(self) -> FundingSettingsUpdate {
        FundingSettingsUpdate {
            enabled: self.enabled,
            amount_aeko: self.amount_aeko,
            cooldown_hours: self.cooldown_hours,
            daily_budget_aeko: self.daily_budget_aeko,
            max_admin_funding_aeko: self.max_admin_funding_aeko,
            console_airdrop_cap_aeko: self.console_airdrop_cap_aeko,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<i64>,
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/funding/policy", get(get_policy))
        .route("/funding/request", post(create_request))
        .route("/funding/request/:id", get(get_public_request_status))
        .route("/funding/airdrop", post(create_airdrop))
        .route(
            "/admin/funding/settings",
            get(get_admin_settings).patch(update_admin_settings),
        )
        .route("/admin/funding/requests", get(list_requests))
        .route("/admin/funding/requests/:id", get(get_request))
        .route("/admin/funding/requests/:id/decide", post(decide_request))
        .route(
            "/admin/funding/requests/:id/reconcile",
            post(reconcile_request),
        )
        .route("/admin/funding/history", get(list_funding_history))
        .route("/admin/funding/send", post(send_funding))
        .route("/admin/funding/airdrops", get(list_airdrops))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
}

async fn get_policy(
    State(state): State<SharedState>,
) -> FundingResult<Json<DataEnvelope<FundingPolicyView>>> {
    ensure_funding_available(&state)?;
    let snapshot = state
        .repository
        .funding_policy_snapshot()
        .await
        .map_err(FundingHttpError::internal)?;
    let revision = u64::try_from(snapshot.settings.revision)
        .map_err(|_| FundingHttpError::internal("negative funding settings revision"))?;
    let policy = FundingPolicyView {
        enabled: snapshot.settings.enabled,
        amount_aeko: snapshot.settings.amount_aeko,
        cooldown_hours: snapshot.settings.cooldown_hours,
        daily_budget_aeko: snapshot.settings.daily_budget_aeko,
        daily_remaining_aeko: snapshot.daily_remaining_aeko(),
        public_spent_aeko: snapshot.public_spent_aeko,
        public_reserved_aeko: snapshot.public_reserved_aeko,
        console_airdrop_cap_aeko: snapshot
            .settings
            .console_airdrop_cap_aeko
            .min(state.faucet_per_request_cap_aeko),
        developer_airdrop_enabled: state.is_test_environment(),
        faucet_per_request_cap_aeko: state.faucet_per_request_cap_aeko,
        revision,
    };
    Ok(response::data_from_source(
        &state.network,
        policy,
        "funding-policy",
    ))
}

async fn create_request(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<FundingRequestBody>,
) -> FundingResult<(StatusCode, Json<DataEnvelope<FundingRequestView>>)> {
    ensure_funding_available(&state)?;
    let address = validate_address(&body.address)?;
    apply_rate_limit(&state, &headers, "public-request-origin").await?;
    apply_subject_rate_limit(&state, "public-request-wallet", &address).await?;
    let request = state
        .repository
        .create_public_funding_request(&address)
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        response::data_from_source(&state.network, request.into(), "funding-queue"),
    ))
}

async fn get_public_request_status(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> FundingResult<Json<DataEnvelope<PublicFundingRequestStatusView>>> {
    ensure_funding_available(&state)?;
    let request = state
        .repository
        .funding_request(&id)
        .await?
        .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
    if request.source != "public" {
        return Err(FundingHttpError::from(FundingStoreError::RequestNotFound));
    }
    Ok(response::data_from_source(
        &state.network,
        request.into(),
        "funding-request-status",
    ))
}

async fn create_airdrop(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<DirectFundingBody>,
) -> FundingResult<Json<DataEnvelope<FundingAirdropView>>> {
    ensure_funding_available(&state)?;
    ensure_developer_airdrop_available(&state)?;
    let address = validate_address(&body.address)?;
    apply_rate_limit(&state, &headers, "console-airdrop-origin").await?;
    apply_subject_rate_limit(&state, "console-airdrop-wallet", &address).await?;
    let settings = state
        .repository
        .funding_settings()
        .await
        .map_err(FundingHttpError::internal)?;
    let cap = settings
        .console_airdrop_cap_aeko
        .min(state.faucet_per_request_cap_aeko);
    validate_direct_amount(body.amount_aeko, cap, "Test Console airdrop")?;
    let airdrop = state
        .repository
        .create_funding_airdrop(&address, body.amount_aeko)
        .await?;
    let settled = submit_and_observe_airdrop(&state, airdrop).await?;
    Ok(response::data_from_source(
        &state.network,
        settled.into(),
        "developer-airdrop",
    ))
}

async fn get_admin_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> FundingResult<Json<DataEnvelope<AdminFundingSnapshot>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    // Funding is network-agnostic: every deployment serves the same funding
    // contract. The `mode` stays `funding` on all networks; each
    // deployment constrains itself through its own faucet, credential, caps,
    // budgets, and approval queue.
    let snapshot = state
        .repository
        .funding_policy_snapshot()
        .await
        .map_err(FundingHttpError::internal)?;
    let daily_remaining_aeko = snapshot.daily_remaining_aeko();
    let public_spent_aeko = snapshot.public_spent_aeko;
    let public_reserved_aeko = snapshot.public_reserved_aeko;
    let settings = FundingSettingsView::try_from(snapshot.settings)?;
    Ok(response::data_from_source(
        &state.network,
        AdminFundingSnapshot {
            network: state.network.clone(),
            mode: "funding",
            settings: Some(settings),
            daily_remaining_aeko: Some(daily_remaining_aeko),
            public_spent_aeko: Some(public_spent_aeko),
            public_reserved_aeko: Some(public_reserved_aeko),
            console_airdrop_aggregate_unlimited: state.is_test_environment(),
            developer_airdrop_enabled: state.is_test_environment(),
            faucet_per_request_cap_aeko: Some(state.faucet_per_request_cap_aeko),
        },
        "funding-policy",
    ))
}

async fn update_admin_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(patch): Json<FundingSettingsPatch>,
) -> FundingResult<Json<DataEnvelope<AdminFundingSnapshot>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    patch.validate(state.faucet_per_request_cap_aeko)?;
    let expected_revision = i64::try_from(patch.expected_revision).map_err(|_| {
        FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_SETTING",
            "expectedRevision is too large",
        )
    })?;
    state
        .repository
        .update_funding_settings(expected_revision, &patch.into_update())
        .await?;
    get_admin_settings(State(state), headers).await
}

async fn list_requests(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> FundingResult<Json<DataEnvelope<Vec<FundingRequestView>>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let requests = state
        .repository
        .list_funding_requests(limit)
        .await?
        .into_iter()
        .map(FundingRequestView::from)
        .collect();
    Ok(response::data_from_source(
        &state.network,
        requests,
        "funding-queue",
    ))
}

async fn get_request(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let request = state
        .repository
        .funding_request(&id)
        .await?
        .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
    Ok(response::data_from_source(
        &state.network,
        request.into(),
        "funding-queue",
    ))
}

async fn decide_request(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<FundingDecisionBody>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;

    if !body.approved {
        let existing = state
            .repository
            .funding_request(&id)
            .await?
            .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
        let request = match existing.status.as_str() {
            "pending" => {
                state
                    .repository
                    .reject_funding_request(
                        &id,
                        Some("OPERATOR_REJECTED"),
                        Some("Rejected by Admin"),
                    )
                    .await?
            }
            // A stuck approval (submission never produced a durable
            // signature) can be cancelled: one safe replay runs first, and
            // only if no signature exists afterwards is the wallet released.
            // This unblocks the wallet from REQUEST_PENDING so the user can
            // submit a fresh request.
            "processing" => cancel_stuck_funding(&state, existing).await?,
            status => {
                return Err(FundingHttpError::from(
                    FundingStoreError::RequestAlreadyDecided {
                        status: status.to_string(),
                    },
                ))
            }
        };
        return Ok(response::data_from_source(
            &state.network,
            request.into(),
            "funding-queue",
        ));
    }

    let existing = state
        .repository
        .funding_request(&id)
        .await?
        .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;

    let settled = match existing.status.as_str() {
        "pending" => {
            let reserved = state.repository.reserve_public_funding_request(&id).await?;
            submit_and_observe_funding(&state, reserved).await?
        }
        "submitted" => observe_funding(&state, existing).await?,
        "confirmed" => existing,
        "processing" => {
            // Safe retry: the persisted blockhash intent is replayed verbatim
            // (same destination/amount/authorization/blockhash) so the faucet
            // recovers the same signature; no duplicate funding transfer is created. This
            // lets an admin re-drive an approval whose RPC response was lost
            // instead of wedging on FUNDING_SUBMISSION_UNCERTAIN.
            submit_and_observe_funding(&state, existing).await?
        }
        status => {
            return Err(FundingHttpError::from(
                FundingStoreError::RequestAlreadyDecided {
                    status: status.to_string(),
                },
            ))
        }
    };

    Ok(response::data_from_source(
        &state.network,
        settled.into(),
        "funding-settlement",
    ))
}

/// Cancels a stuck approval whose submission never produced a durable
/// transaction signature. Runs one safe replay of the persisted intent
/// first: if the replay recovers a signature (or confirms), the request
/// follows its on-chain outcome instead of being cancelled. Only when no
/// signature exists afterwards is the request released to `rejected`, which
/// frees the wallet from REQUEST_PENDING so a fresh request can be made.
async fn cancel_stuck_funding(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    let request_id = request.id.clone();
    match submit_and_observe_funding(state, request).await {
        Ok(settled) => {
            if settled.status == "confirmed" {
                tracing::info!(
                    request_id = %request_id,
                    "cancel recovered a confirmed funding transfer; keeping the confirmation"
                );
                return Ok(settled);
            }
            Err(FundingHttpError::new(
                StatusCode::CONFLICT,
                "FUNDING_SUBMISSION_RECOVERED",
                format!(
                    "The replay recovered a durable transaction signature for {request_id}; \
                    the transfer may still confirm on-chain, so it cannot be cancelled. \
                    Track it to confirmation instead."
                ),
            ))
        }
        Err(error) => {
            let current = state
                .repository
                .funding_request(&request_id)
                .await?
                .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
            match current.status.as_str() {
                "pending" => Ok(state
                    .repository
                    .reject_funding_request(
                        &request_id,
                        Some("OPERATOR_CANCELLED"),
                        Some("Cancelled by Admin after submission produced no durable signature"),
                    )
                    .await?),
                "processing" => {
                    if current.signature.is_some() {
                        return Err(FundingHttpError::new(
                            StatusCode::CONFLICT,
                            "FUNDING_SUBMISSION_RECOVERED",
                            format!(
                                "The replay recovered a durable transaction signature for {request_id}; \
                                the transfer may still confirm on-chain, so it cannot be cancelled. \
                                Track it to confirmation instead."
                            ),
                        ));
                    }
                    tracing::warn!(
                        request_id = %request_id,
                        previous_error = %error.message,
                        "cancelling stuck funding submission that produced no durable signature"
                    );
                    Ok(state
                        .repository
                        .cancel_processing_funding_request(
                            &request_id,
                            Some("OPERATOR_CANCELLED"),
                            Some(
                                "Cancelled by Admin after submission produced no durable signature",
                            ),
                        )
                        .await?)
                }
                status => Err(FundingHttpError::from(
                    FundingStoreError::RequestAlreadyDecided {
                        status: status.to_string(),
                    },
                )),
            }
        }
    }
}

async fn reconcile_request(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let request = state
        .repository
        .funding_request(&id)
        .await?
        .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
    let reconciled = match request.status.as_str() {
        "processing" => submit_and_observe_funding(&state, request).await?,
        "submitted" => observe_funding(&state, request).await?,
        "confirmed" => request,
        status => {
            return Err(FundingHttpError::from(
                FundingStoreError::RequestAlreadyDecided {
                    status: status.to_string(),
                },
            ))
        }
    };
    Ok(response::data_from_source(
        &state.network,
        reconciled.into(),
        "funding-reconciliation",
    ))
}

async fn list_funding_history(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> FundingResult<Json<DataEnvelope<Vec<FundingTransferView>>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let funding_transfers = state
        .repository
        .list_funding_transfers(limit)
        .await?
        .into_iter()
        .map(FundingTransferView::from)
        .collect();
    Ok(response::data_from_source(
        &state.network,
        funding_transfers,
        "funding-ledger",
    ))
}

async fn send_funding(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<DirectFundingBody>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let address = validate_address(&body.address)?;
    let settings = state
        .repository
        .funding_settings()
        .await
        .map_err(FundingHttpError::internal)?;
    let cap = settings
        .max_admin_funding_aeko
        .min(state.faucet_per_request_cap_aeko);
    validate_direct_amount(body.amount_aeko, cap, "Admin funding")?;
    let request = state
        .repository
        .create_immediate_funding_request(&address, body.amount_aeko)
        .await?;
    let settled = submit_and_observe_funding(&state, request).await?;
    Ok(response::data_from_source(
        &state.network,
        settled.into(),
        "funding-settlement",
    ))
}

async fn list_airdrops(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> FundingResult<Json<DataEnvelope<Vec<FundingAirdropView>>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_funding_available(&state)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let airdrops = state
        .repository
        .list_funding_airdrops(limit)
        .await?
        .into_iter()
        .map(FundingAirdropView::from)
        .collect();
    Ok(response::data_from_source(
        &state.network,
        airdrops,
        "developer-airdrop-ledger",
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        guards::{amount_to_lamports, constant_time_equal},
        FundingSettingsPatch,
    };

    #[test]
    fn aeko_amount_conversion_uses_native_token_precision() {
        assert_eq!(amount_to_lamports(1.0).unwrap(), 1_000_000_000);
        assert_eq!(amount_to_lamports(0.5).unwrap(), 500_000_000);
        assert!(amount_to_lamports(0.0).is_err());
    }

    #[test]
    fn settings_patch_respects_faucet_hard_cap() {
        let valid = FundingSettingsPatch {
            expected_revision: 1,
            enabled: Some(true),
            amount_aeko: Some(5.0),
            cooldown_hours: Some(24.0),
            daily_budget_aeko: Some(5_000.0),
            max_admin_funding_aeko: Some(100.0),
            console_airdrop_cap_aeko: Some(25.0),
        };
        assert!(valid.validate(100.0).is_ok());

        let too_large = FundingSettingsPatch {
            console_airdrop_cap_aeko: Some(101.0),
            ..valid
        };
        assert!(too_large.validate(100.0).is_err());
    }

    #[test]
    fn admin_token_comparison_checks_length_and_content() {
        assert!(constant_time_equal(b"same", b"same"));
        assert!(!constant_time_equal(b"same", b"diff"));
        assert!(!constant_time_equal(b"short", b"longer"));
    }
}
