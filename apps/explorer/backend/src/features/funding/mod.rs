use {
    crate::{
        infrastructure::{
            chain::FundingTransferStatus,
            persistence::funding::{
                FundingAirdropRecord, FundingRequestRecord, FundingSettingsUpdate,
                FundingStoreError, FundingTransferRecord, PersistedFundingSettings,
            },
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::{native_token::LAMPORTS_PER_AEKO, pubkey::Pubkey},
    axum::{
        extract::{Path, Query, State},
        http::{header, HeaderMap, HeaderValue, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
        Json, Router,
    },
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    std::time::Duration,
    tower_http::set_header::SetResponseHeaderLayer,
};

const ADMIN_HEADER: &str = "x-aeko-settings-token";
const FUNDING_RATE_WINDOW_SECONDS: i32 = 600;
const CONFIRMATION_ATTEMPTS: u32 = 12;
const CONFIRMATION_INTERVAL_MS: u64 = 500;

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

async fn prepare_funding_submission_intent(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    if request.status != "processing" || request.signature.is_some() {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            },
        ));
    }
    if request.submission_blockhash.is_some() {
        return Ok(request);
    }

    let rpc = state.rpc.clone();
    let blockhash = match tokio::task::spawn_blocking(move || rpc.latest_funding_blockhash()).await
    {
        Ok(Ok(blockhash)) => blockhash,
        Ok(Err(error)) => {
            if request.source == "public" {
                state
                    .repository
                    .reset_public_request_before_submission(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            } else {
                state
                    .repository
                    .mark_funding_request_failed(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            }
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_BLOCKHASH_UNAVAILABLE",
                "A chain blockhash could not be obtained before funding submission; no transfer was attempted.",
            ));
        }
        Err(error) => {
            if request.source == "public" {
                state
                    .repository
                    .reset_public_request_before_submission(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            } else {
                state
                    .repository
                    .mark_funding_request_failed(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            }
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_BLOCKHASH_UNAVAILABLE",
                "The blockhash worker ended before funding submission; no transfer was attempted.",
            ));
        }
    };

    Ok(state
        .repository
        .set_funding_request_submission_blockhash(&request.id, &blockhash)
        .await?)
}

async fn submit_and_observe_funding(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    let request = prepare_funding_submission_intent(state, request).await?;
    let blockhash = request.submission_blockhash.clone().ok_or_else(|| {
        FundingHttpError::internal("processing funding request has no durable submission blockhash")
    })?;
    let lamports = amount_to_lamports(request.amount_aeko)?;
    let rpc = state.rpc.clone();
    let address = request.address.clone();
    let authorization = state.funding_authorization_key.clone();
    let submit_blockhash = blockhash.clone();
    let submit = tokio::task::spawn_blocking(move || {
        rpc.request_funding_transfer(
            &address,
            lamports,
            authorization.as_deref(),
            Some(&submit_blockhash),
        )
    })
    .await;

    let signature = match submit {
        Ok(Ok(signature)) => signature,
        Ok(Err(error)) => {
            tracing::warn!(
                request_id = %request.id,
                error = %error,
                "funding submission produced no durable transaction signature; persisted intent remains recoverable"
            );
            state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_SUBMISSION_RETRY_PENDING",
                format!(
                    "The funding submission response was not obtained ({error}). The persisted transaction intent was kept and will be safely replayed with the same blockhash; no duplicate funding transfer will be created. Wait a few seconds then call reconcile, or wait for the background reconciler."
                ),
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_SUBMISSION_RETRY_PENDING",
                format!(
                    "The funding submission worker ended unexpectedly ({error}). The persisted transaction intent was kept and will be safely replayed; no duplicate funding transfer will be created. Reconcile the request to resume."
                ),
            ));
        }
    };

    let submitted = state
        .repository
        .set_funding_request_signature(&request.id, &signature)
        .await?;
    tracing::info!(
        request_id = %request.id,
        signature = %signature,
        "submission returned a durable signature; confirmation continues in the reconciler"
    );
    Ok(submitted)
}

async fn observe_funding(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    if request.status == "confirmed" {
        return Ok(request);
    }
    if request.status != "submitted" {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            },
        ));
    }
    let signature = request.signature.clone().ok_or_else(|| {
        FundingHttpError::internal("submitted funding request has no durable transaction signature")
    })?;

    let rpc = state.rpc.clone();
    let signature_for_wait = signature.clone();
    let blockhash_for_wait = request.submission_blockhash.clone();
    let observation = tokio::task::spawn_blocking(move || {
        rpc.wait_for_funding_transfer_with_blockhash(
            &signature_for_wait,
            blockhash_for_wait.as_deref(),
            CONFIRMATION_ATTEMPTS,
            Duration::from_millis(CONFIRMATION_INTERVAL_MS),
        )
    })
    .await;

    match observation {
        Ok(Ok(FundingTransferStatus::Confirmed)) => Ok(state
            .repository
            .confirm_funding_request(&request.id)
            .await?),
        Ok(Ok(FundingTransferStatus::Failed(error))) => {
            state
                .repository
                .mark_funding_request_failed(&request.id, "FUNDING_TRANSACTION_FAILED", &error)
                .await?;
            Err(FundingHttpError::new(
                StatusCode::BAD_GATEWAY,
                "FUNDING_TRANSACTION_FAILED",
                format!("Funding transaction {signature} failed on-chain"),
            ))
        }
        Ok(Ok(FundingTransferStatus::Pending)) => Ok(state
            .repository
            .mark_funding_request_observation_error(
                &request.id,
                "FUNDING_CONFIRMATION_PENDING",
                "Transaction was submitted and is still awaiting chain confirmation",
            )
            .await?),
        Ok(Err(error)) => {
            tracing::warn!(
                request_id = %request.id,
                signature = %signature,
                error = %error,
                "funding transaction was submitted but confirmation polling failed"
            );
            Ok(state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?)
        }
        Err(error) => {
            tracing::warn!(
                request_id = %request.id,
                signature = %signature,
                error = %error,
                "funding confirmation worker ended unexpectedly"
            );
            Ok(state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?)
        }
    }
}

async fn prepare_airdrop_submission_intent(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    if airdrop.status != "processing" || airdrop.signature.is_some() {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: airdrop.status,
            },
        ));
    }
    if airdrop.submission_blockhash.is_some() {
        return Ok(airdrop);
    }

    let rpc = state.rpc.clone();
    let blockhash = match tokio::task::spawn_blocking(move || rpc.latest_funding_blockhash()).await
    {
        Ok(Ok(blockhash)) => blockhash,
        Ok(Err(error)) => {
            state
                .repository
                .mark_funding_airdrop_failed(
                    &airdrop.id,
                    "AIRDROP_BLOCKHASH_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_BLOCKHASH_UNAVAILABLE",
                "A chain blockhash could not be obtained before the developer airdrop; no transfer was attempted.",
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_airdrop_failed(
                    &airdrop.id,
                    "AIRDROP_BLOCKHASH_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_BLOCKHASH_UNAVAILABLE",
                "The blockhash worker ended before the developer airdrop; no transfer was attempted.",
            ));
        }
    };

    Ok(state
        .repository
        .set_funding_airdrop_submission_blockhash(&airdrop.id, &blockhash)
        .await?)
}

async fn submit_and_observe_airdrop(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    let airdrop = prepare_airdrop_submission_intent(state, airdrop).await?;
    let blockhash = airdrop.submission_blockhash.clone().ok_or_else(|| {
        FundingHttpError::internal(
            "processing developer airdrop has no durable submission blockhash",
        )
    })?;
    let lamports = amount_to_lamports(airdrop.amount_aeko)?;
    let rpc = state.rpc.clone();
    let address = airdrop.address.clone();
    let submit_blockhash = blockhash.clone();
    let submit = tokio::task::spawn_blocking(move || {
        rpc.request_funding_airdrop(&address, lamports, Some(&submit_blockhash))
    })
    .await;

    let signature = match submit {
        Ok(Ok(signature)) => signature,
        Ok(Err(error)) => {
            tracing::warn!(
                airdrop_id = %airdrop.id,
                error = %error,
                "developer airdrop produced no durable transaction signature; persisted intent remains recoverable"
            );
            state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_SUBMISSION_RETRY_PENDING",
                "The developer airdrop did not produce a durable transaction signature. The backend will safely replay the same persisted transaction intent.",
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_SUBMISSION_RETRY_PENDING",
                "The developer airdrop worker ended unexpectedly. The backend will safely replay the same persisted transaction intent.",
            ));
        }
    };

    let submitted = state
        .repository
        .set_funding_airdrop_signature(&airdrop.id, &signature)
        .await?;
    tracing::info!(
        airdrop_id = %airdrop.id,
        signature = %signature,
        "developer airdrop returned a durable signature; confirmation continues in the reconciler"
    );
    Ok(submitted)
}

async fn observe_airdrop(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    if airdrop.status == "confirmed" {
        return Ok(airdrop);
    }
    if airdrop.status != "submitted" {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: airdrop.status,
            },
        ));
    }
    let signature = airdrop.signature.clone().ok_or_else(|| {
        FundingHttpError::internal("submitted developer airdrop has no transaction signature")
    })?;

    let rpc = state.rpc.clone();
    let signature_for_wait = signature.clone();
    let blockhash_for_wait = airdrop.submission_blockhash.clone();
    let observation = tokio::task::spawn_blocking(move || {
        rpc.wait_for_funding_transfer_with_blockhash(
            &signature_for_wait,
            blockhash_for_wait.as_deref(),
            CONFIRMATION_ATTEMPTS,
            Duration::from_millis(CONFIRMATION_INTERVAL_MS),
        )
    })
    .await;

    match observation {
        Ok(Ok(FundingTransferStatus::Confirmed)) => Ok(state
            .repository
            .confirm_funding_airdrop(&airdrop.id)
            .await?),
        Ok(Ok(FundingTransferStatus::Failed(error))) => {
            state
                .repository
                .mark_funding_airdrop_failed(&airdrop.id, "AIRDROP_TRANSACTION_FAILED", &error)
                .await?;
            Err(FundingHttpError::new(
                StatusCode::BAD_GATEWAY,
                "AIRDROP_TRANSACTION_FAILED",
                format!("Developer airdrop transaction {signature} failed on-chain"),
            ))
        }
        Ok(Ok(FundingTransferStatus::Pending)) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_PENDING",
                "Transaction was submitted and is still awaiting chain confirmation",
            )
            .await?),
        Ok(Err(error)) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_UNAVAILABLE",
                &error.to_string(),
            )
            .await?),
        Err(error) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_UNAVAILABLE",
                &error.to_string(),
            )
            .await?),
    }
}

pub async fn run_settlement_reconciler(state: SharedState, interval: Duration) {
    if !state.is_funding_available() {
        return;
    }

    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        let transitioned = reconcile_submitted_settlements_once(&state).await;
        if transitioned > 0 {
            tracing::info!(
                transitioned,
                network = %state.network,
                "reconciled submitted funding settlements"
            );
        }
    }
}

pub async fn reconcile_submitted_settlements_once(state: &SharedState) -> usize {
    if !state.is_funding_available() {
        return 0;
    }

    let mut transitioned = 0usize;

    let processing_requests = match state
        .repository
        .list_recoverable_processing_funding_requests(500)
        .await
    {
        Ok(requests) => requests,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load recoverable processing funding submissions"
            );
            Vec::new()
        }
    };

    for request in processing_requests {
        if recover_processing_funding_submission(state, request).await {
            transitioned += 1;
        }
    }

    let processing_airdrops = match state
        .repository
        .list_recoverable_processing_funding_airdrops(500)
        .await
    {
        Ok(airdrops) => airdrops,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load recoverable processing developer airdrops"
            );
            Vec::new()
        }
    };

    for airdrop in processing_airdrops {
        if recover_processing_airdrop_submission(state, airdrop).await {
            transitioned += 1;
        }
    }

    let requests = match state.repository.list_submitted_funding_requests(500).await {
        Ok(requests) => requests,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load submitted funding settlements for reconciliation"
            );
            Vec::new()
        }
    };

    for request in requests {
        if reconcile_submitted_funding(state, request).await {
            transitioned += 1;
        }
    }

    let airdrops = match state.repository.list_submitted_funding_airdrops(500).await {
        Ok(airdrops) => airdrops,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load submitted developer airdrops for reconciliation"
            );
            Vec::new()
        }
    };

    for airdrop in airdrops {
        if reconcile_submitted_airdrop(state, airdrop).await {
            transitioned += 1;
        }
    }

    transitioned
}

async fn recover_processing_funding_submission(
    state: &SharedState,
    request: FundingRequestRecord,
) -> bool {
    let Some(blockhash) = request.submission_blockhash.clone() else {
        return false;
    };
    let lamports = match amount_to_lamports(request.amount_aeko) {
        Ok(lamports) => lamports,
        Err(error) => {
            tracing::error!(
                request_id = %request.id,
                error = %error.message,
                "recoverable funding request contains an invalid persisted amount"
            );
            return false;
        }
    };

    let rpc = state.rpc.clone();
    let address = request.address.clone();
    let authorization = state.funding_authorization_key.clone();
    let submit_blockhash = blockhash.clone();
    let result = tokio::task::spawn_blocking(move || {
        rpc.request_funding_transfer(
            &address,
            lamports,
            authorization.as_deref(),
            Some(&submit_blockhash),
        )
    })
    .await;

    match result {
        Ok(Ok(signature)) => match state
            .repository
            .set_funding_request_signature(&request.id, &signature)
            .await
        {
            Ok(_) => true,
            Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
            Err(error) => {
                tracing::error!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %error,
                    "failed to persist recovered funding signature"
                );
                false
            }
        },
        Ok(Err(error)) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist funding safe-replay error"
                );
            }
            false
        }
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist funding replay worker error"
                );
            }
            false
        }
    }
}

async fn recover_processing_airdrop_submission(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> bool {
    let Some(blockhash) = airdrop.submission_blockhash.clone() else {
        return false;
    };
    let lamports = match amount_to_lamports(airdrop.amount_aeko) {
        Ok(lamports) => lamports,
        Err(error) => {
            tracing::error!(
                airdrop_id = %airdrop.id,
                error = %error.message,
                "recoverable developer airdrop contains an invalid persisted amount"
            );
            return false;
        }
    };

    let rpc = state.rpc.clone();
    let address = airdrop.address.clone();
    let submit_blockhash = blockhash.clone();
    let result = tokio::task::spawn_blocking(move || {
        rpc.request_funding_airdrop(&address, lamports, Some(&submit_blockhash))
    })
    .await;

    match result {
        Ok(Ok(signature)) => match state
            .repository
            .set_funding_airdrop_signature(&airdrop.id, &signature)
            .await
        {
            Ok(_) => true,
            Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
            Err(error) => {
                tracing::error!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %error,
                    "failed to persist recovered developer-airdrop signature"
                );
                false
            }
        },
        Ok(Err(error)) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist developer-airdrop safe-replay error"
                );
            }
            false
        }
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist developer-airdrop replay worker error"
                );
            }
            false
        }
    }
}

async fn reconcile_submitted_funding(state: &SharedState, request: FundingRequestRecord) -> bool {
    let Some(signature) = request.signature.clone() else {
        tracing::error!(
            request_id = %request.id,
            "submitted funding request has no signature and cannot be reconciled"
        );
        return false;
    };

    match funding_transfer_status_once(state, &signature, request.submission_blockhash.as_deref())
        .await
    {
        Ok(FundingTransferStatus::Confirmed) => {
            match state.repository.confirm_funding_request(&request.id).await {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(error) => {
                    tracing::error!(
                        request_id = %request.id,
                        signature = %signature,
                        error = %error,
                        "failed to persist confirmed funding settlement"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Failed(error)) => {
            match state
                .repository
                .mark_funding_request_failed(&request.id, "FUNDING_TRANSACTION_FAILED", &error)
                .await
            {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(store_error) => {
                    tracing::error!(
                        request_id = %request.id,
                        signature = %signature,
                        error = %store_error,
                        "failed to persist failed funding settlement"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Pending) => false,
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error,
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    signature = %signature,
                    error = %store_error,
                    "failed to persist funding reconciliation observation error"
                );
            }
            false
        }
    }
}

async fn reconcile_submitted_airdrop(state: &SharedState, airdrop: FundingAirdropRecord) -> bool {
    let Some(signature) = airdrop.signature.clone() else {
        tracing::error!(
            airdrop_id = %airdrop.id,
            "submitted developer airdrop has no signature and cannot be reconciled"
        );
        return false;
    };

    match funding_transfer_status_once(state, &signature, airdrop.submission_blockhash.as_deref())
        .await
    {
        Ok(FundingTransferStatus::Confirmed) => {
            match state.repository.confirm_funding_airdrop(&airdrop.id).await {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(error) => {
                    tracing::error!(
                        airdrop_id = %airdrop.id,
                        signature = %signature,
                        error = %error,
                        "failed to persist confirmed developer airdrop"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Failed(error)) => {
            match state
                .repository
                .mark_funding_airdrop_failed(&airdrop.id, "AIRDROP_TRANSACTION_FAILED", &error)
                .await
            {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(store_error) => {
                    tracing::error!(
                        airdrop_id = %airdrop.id,
                        signature = %signature,
                        error = %store_error,
                        "failed to persist failed developer airdrop"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Pending) => false,
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(&airdrop.id, "AIRDROP_CONFIRMATION_UNAVAILABLE", &error)
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    signature = %signature,
                    error = %store_error,
                    "failed to persist developer-airdrop reconciliation observation error"
                );
            }
            false
        }
    }
}

async fn funding_transfer_status_once(
    state: &SharedState,
    signature: &str,
    recent_blockhash: Option<&str>,
) -> Result<FundingTransferStatus, String> {
    let rpc = state.rpc.clone();
    let signature = signature.to_string();
    let recent_blockhash = recent_blockhash.map(str::to_owned);
    match tokio::task::spawn_blocking(move || {
        rpc.funding_transfer_status_with_blockhash(&signature, recent_blockhash.as_deref())
    })
    .await
    {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => Err(error.to_string()),
        Err(error) => Err(error.to_string()),
    }
}

async fn apply_rate_limit(
    state: &SharedState,
    headers: &HeaderMap,
    scope: &str,
) -> FundingResult<()> {
    let subject = requester_subject(headers);
    state
        .repository
        .record_funding_rate_event(
            scope,
            &subject,
            i64::from(state.funding_requests_per_10_min),
            FUNDING_RATE_WINDOW_SECONDS,
        )
        .await?;
    Ok(())
}

async fn apply_subject_rate_limit(
    state: &SharedState,
    scope: &str,
    subject: &str,
) -> FundingResult<()> {
    state
        .repository
        .record_funding_rate_event(
            scope,
            subject,
            i64::from(state.funding_requests_per_10_min),
            FUNDING_RATE_WINDOW_SECONDS,
        )
        .await?;
    Ok(())
}

fn requester_subject(headers: &HeaderMap) -> String {
    for name in ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] {
        if let Some(value) = headers.get(name).and_then(|value| value.to_str().ok()) {
            let first = value.split(',').next().unwrap_or_default().trim();
            if !first.is_empty() {
                return first.chars().take(128).collect();
            }
        }
    }
    "unknown".to_string()
}

fn ensure_funding_available(_state: &SharedState) -> FundingResult<()> {
    // Funding, funding transfers, and airdrops unconditionally work on every deployment.
    // The flow never branches on the network name; each deployment constrains
    // itself through its own faucet balance, authorization credential, caps,
    // budgets, and approval queue.
    Ok(())
}

fn ensure_developer_airdrop_available(state: &SharedState) -> FundingResult<()> {
    if state.is_test_environment() {
        return Ok(());
    }
    Err(FundingHttpError::new(
        StatusCode::FORBIDDEN,
        "AIRDROP_DISABLED_ON_MAINNET",
        "Developer airdrop is disabled on mainnet",
    ))
}

fn authorize_admin(headers: &HeaderMap, expected: &str) -> FundingResult<()> {
    let supplied = headers
        .get(ADMIN_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if constant_time_equal(supplied.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err(FundingHttpError::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Unauthorized",
        ))
    }
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

fn validate_address(value: &str) -> FundingResult<String> {
    let trimmed = value.trim();
    trimmed.parse::<Pubkey>().map_err(|_| {
        FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_ADDRESS",
            "Enter a valid AEKO wallet address",
        )
    })?;
    Ok(trimmed.to_string())
}

fn validate_positive(value: Option<f64>, name: &str) -> FundingResult<()> {
    if let Some(value) = value {
        if !value.is_finite() || value <= 0.0 {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                format!("{name} must be a positive finite number"),
            ));
        }
    }
    Ok(())
}

fn validate_non_negative(value: Option<f64>, name: &str) -> FundingResult<()> {
    if let Some(value) = value {
        if !value.is_finite() || value < 0.0 {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                format!("{name} must be a non-negative finite number"),
            ));
        }
    }
    Ok(())
}

fn validate_direct_amount(amount: f64, cap: f64, label: &str) -> FundingResult<()> {
    if !amount.is_finite() || amount <= 0.0 {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_AMOUNT",
            "Amount must be greater than zero",
        ));
    }
    if amount > cap {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "AMOUNT_TOO_LARGE",
            format!("{label} cannot exceed {cap} AEKO per request"),
        ));
    }
    Ok(())
}

fn amount_to_lamports(amount_aeko: f64) -> FundingResult<u64> {
    let lamports = amount_aeko * LAMPORTS_PER_AEKO as f64;
    if !lamports.is_finite() || lamports < 1.0 || lamports > u64::MAX as f64 {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_AMOUNT",
            "Funding amount cannot be represented in lamports",
        ));
    }
    Ok(lamports.round() as u64)
}

#[cfg(test)]
mod tests {
    use super::{amount_to_lamports, constant_time_equal, FundingSettingsPatch};

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
