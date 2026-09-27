use {
    crate::{
        infrastructure::{
            chain::FundingTransferStatus,
            persistence::funding::{
                FundingGrantRecord, FundingRequestRecord, FundingSettingsUpdate, FundingStoreError,
                PersistedFundingSettings,
            },
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::{native_token::LAMPORTS_PER_AEKO, pubkey::Pubkey},
    axum::{
        extract::{Path, Query, State},
        http::{HeaderMap, HeaderValue, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
        Json, Router,
    },
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    std::{str::FromStr, time::Duration},
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
                "Test funding is paused by the operator",
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
                "Today's public testnet funding allocation is exhausted",
            ),
            FundingStoreError::RequestNotFound => Self::new(
                StatusCode::NOT_FOUND,
                "REQUEST_NOT_FOUND",
                "Funding request was not found",
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
    max_manual_grant_aeko: f64,
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
            max_manual_grant_aeko: value.max_manual_grant_aeko,
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
    console_airdrop_aggregate_unlimited: bool,
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
    signature: Option<String>,
    confirmed: bool,
    submitted_at: Option<String>,
    confirmed_at: Option<String>,
    last_checked_at: Option<String>,
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
            signature: value.signature,
            confirmed: value.confirmed,
            submitted_at: value.submitted_at.map(|value| value.to_rfc3339()),
            confirmed_at: value.confirmed_at.map(|value| value.to_rfc3339()),
            last_checked_at: value.last_checked_at.map(|value| value.to_rfc3339()),
            error_code: value.error_code,
            error_message: value.error_message,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FundingGrantView {
    id: String,
    address: String,
    amount_aeko: f64,
    signature: Option<String>,
    granted_at: String,
    source: String,
    confirmed: bool,
}

impl From<FundingGrantRecord> for FundingGrantView {
    fn from(value: FundingGrantRecord) -> Self {
        Self {
            id: value.id,
            address: value.address,
            amount_aeko: value.amount_aeko,
            signature: value.signature,
            granted_at: value.granted_at.to_rfc3339(),
            source: value.source,
            confirmed: value.confirmed,
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
    faucet_per_request_cap_aeko: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FundingRequestBody {
    address: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DirectGrantBody {
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
    max_manual_grant_aeko: Option<f64>,
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
            || self.max_manual_grant_aeko.is_some()
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
        validate_positive(self.max_manual_grant_aeko, "maxManualGrantAeko")?;
        validate_positive(self.console_airdrop_cap_aeko, "consoleAirdropCapAeko")?;
        for (name, value) in [
            ("amountAeko", self.amount_aeko),
            ("maxManualGrantAeko", self.max_manual_grant_aeko),
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
            max_manual_grant_aeko: self.max_manual_grant_aeko,
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
        .route("/funding/requests/:id/status", get(get_public_request_status))
        .route("/funding/airdrop", post(create_airdrop))
        .route(
            "/admin/funding/settings",
            get(get_admin_settings).patch(update_admin_settings),
        )
        .route("/admin/funding/requests", get(list_requests))
        .route("/admin/funding/requests/:id", get(get_request))
        .route(
            "/admin/funding/requests/:id/decide",
            post(decide_request),
        )
        .route("/admin/funding/grants", get(list_grants))
        .route("/admin/funding/grant", post(create_grant))
}

async fn get_policy(
    State(state): State<SharedState>,
) -> FundingResult<Json<DataEnvelope<FundingPolicyView>>> {
    ensure_test_environment(&state)?;
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
        console_airdrop_aggregate_unlimited: true,
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
    ensure_test_environment(&state)?;
    let address = validate_address(&body.address)?;
    apply_rate_limit(&state, &headers, "public-request").await?;
    let request = state
        .repository
        .create_public_funding_request(&address)
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        response::data_from_source(&state.network, request.into(), "funding-queue"),
    ))
}

async fn create_airdrop(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<DirectGrantBody>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    ensure_test_environment(&state)?;
    let address = validate_address(&body.address)?;
    apply_rate_limit(&state, &headers, "console-airdrop").await?;
    let settings = state
        .repository
        .funding_settings()
        .await
        .map_err(FundingHttpError::internal)?;
    let cap = settings
        .console_airdrop_cap_aeko
        .min(state.faucet_per_request_cap_aeko);
    validate_direct_amount(body.amount_aeko, cap, "Test Console airdrop")?;
    let request = state
        .repository
        .create_immediate_funding_request(&address, body.amount_aeko, "console")
        .await?;
    let settled = settle_request(&state, request, false).await?;
    Ok(response::data_from_source(
        &state.network,
        settled.into(),
        "funding-settlement",
    ))
}

async fn get_public_request_status(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    ensure_test_environment(&state)?;
    let request = state
        .repository
        .funding_request(&id)
        .await?
        .filter(|request| request.source == "public")
        .ok_or_else(|| FundingHttpError::from(FundingStoreError::RequestNotFound))?;
    Ok(response::data_from_source(
        &state.network,
        request.into(),
        "funding-status",
    ))
}

async fn get_admin_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> FundingResult<Json<DataEnvelope<AdminFundingSnapshot>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    if !state.is_test_environment() {
        return Ok(response::data_from_source(
            &state.network,
            AdminFundingSnapshot {
                network: state.network.clone(),
                mode: "mainnet-disabled",
                settings: None,
                daily_remaining_aeko: None,
                public_spent_aeko: None,
                public_reserved_aeko: None,
                console_airdrop_aggregate_unlimited: false,
                faucet_per_request_cap_aeko: None,
            },
            "funding-policy",
        ));
    }
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
            mode: "test-funding",
            settings: Some(settings),
            daily_remaining_aeko: Some(daily_remaining_aeko),
            public_spent_aeko: Some(public_spent_aeko),
            public_reserved_aeko: Some(public_reserved_aeko),
            console_airdrop_aggregate_unlimited: true,
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
    ensure_test_environment(&state)?;
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
    ensure_test_environment(&state)?;
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
    ensure_test_environment(&state)?;
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
    ensure_test_environment(&state)?;

    if !body.approved {
        let request = state
            .repository
            .reject_funding_request(
                &id,
                Some("OPERATOR_REJECTED"),
                Some("Rejected by operator"),
            )
            .await?;
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
        "confirmed" => existing,
        "submitted" => settle_request(&state, existing, true).await?,
        "pending" => {
            let request = state.repository.reserve_public_funding_request(&id).await?;
            settle_request(&state, request, true).await?
        }
        "processing" => {
            return Err(FundingHttpError::new(
                StatusCode::CONFLICT,
                "SETTLEMENT_IN_PROGRESS",
                "This funding request is already being submitted",
            ))
        }
        "reconciliation_required" => {
            return Err(FundingHttpError::new(
                StatusCode::CONFLICT,
                "RECONCILIATION_REQUIRED",
                "Settlement was interrupted before its signature was durably recorded; automatic resubmission is disabled",
            ))
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

async fn list_grants(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> FundingResult<Json<DataEnvelope<Vec<FundingGrantView>>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_test_environment(&state)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let grants = state
        .repository
        .list_funding_grants(limit)
        .await?
        .into_iter()
        .map(FundingGrantView::from)
        .collect();
    Ok(response::data_from_source(
        &state.network,
        grants,
        "funding-ledger",
    ))
}

async fn create_grant(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<DirectGrantBody>,
) -> FundingResult<Json<DataEnvelope<FundingRequestView>>> {
    authorize_admin(&headers, &state.settings_admin_token)?;
    ensure_test_environment(&state)?;
    let address = validate_address(&body.address)?;
    let settings = state
        .repository
        .funding_settings()
        .await
        .map_err(FundingHttpError::internal)?;
    let cap = settings
        .max_manual_grant_aeko
        .min(state.faucet_per_request_cap_aeko);
    validate_direct_amount(body.amount_aeko, cap, "Manual grant")?;
    let request = state
        .repository
        .create_immediate_funding_request(&address, body.amount_aeko, "admin")
        .await?;
    let settled = settle_request(&state, request, false).await?;
    Ok(response::data_from_source(
        &state.network,
        settled.into(),
        "funding-settlement",
    ))
}

async fn settle_request(
    state: &SharedState,
    mut request: FundingRequestRecord,
    retry_public_on_submit_failure: bool,
) -> FundingResult<FundingRequestRecord> {
    if request.signature.is_none() {
        let lamports = amount_to_lamports(request.amount_aeko)?;
        let rpc = state.rpc.clone();
        let address = request.address.clone();
        let authorization = state.funding_authorization_key.clone();
        let submit = tokio::task::spawn_blocking(move || {
            rpc.request_funding_airdrop(&address, lamports, authorization.as_deref())
        })
        .await
        .map_err(FundingHttpError::internal)?;

        let signature = match submit {
            Ok(signature) => signature,
            Err(error) => {
                if retry_public_on_submit_failure && request.source == "public" {
                    state
                        .repository
                        .reset_funding_request_after_transfer_failure(
                            &request.id,
                            "FUNDING_TRANSFER_FAILED",
                            &error.to_string(),
                        )
                        .await?;
                } else {
                    let _ = state
                        .repository
                        .fail_funding_request(
                            &request.id,
                            "FUNDING_TRANSFER_FAILED",
                            &error.to_string(),
                        )
                        .await;
                }
                return Err(FundingHttpError::new(
                    StatusCode::BAD_GATEWAY,
                    "FUNDING_TRANSFER_FAILED",
                    "Validator/Faucet rejected the funding transfer",
                ));
            }
        };
        request = state
            .repository
            .set_funding_request_signature(&request.id, &signature)
            .await?;
    }

    let signature = request.signature.clone().ok_or_else(|| {
        FundingHttpError::internal("funding request has no signature after settlement submission")
    })?;
    let rpc = state.rpc.clone();
    let signature_for_wait = signature.clone();
    let status = tokio::task::spawn_blocking(move || {
        rpc.wait_for_funding_transfer(
            &signature_for_wait,
            CONFIRMATION_ATTEMPTS,
            Duration::from_millis(CONFIRMATION_INTERVAL_MS),
        )
    })
    .await
    .map_err(FundingHttpError::internal)?;

    match status {
        Ok(FundingTransferStatus::Confirmed) => Ok(state
            .repository
            .confirm_funding_request(&request.id)
            .await?),
        Ok(FundingTransferStatus::Failed(error)) => {
            let failed = state
                .repository
                .fail_funding_request(
                    &request.id,
                    "FUNDING_TRANSACTION_FAILED",
                    &error,
                )
                .await?;
            Err(FundingHttpError::new(
                StatusCode::BAD_GATEWAY,
                "FUNDING_TRANSACTION_FAILED",
                format!(
                    "Funding transaction {} failed on-chain; request {} is {}",
                    signature, failed.id, failed.status
                ),
            ))
        }
        Ok(FundingTransferStatus::Pending) => Ok(state
            .repository
            .note_funding_request_pending(&request.id, None, None)
            .await?),
        Err(error) => {
            tracing::warn!(
                request_id = %request.id,
                signature = %signature,
                error = %error,
                "funding transaction was submitted but confirmation polling failed"
            );
            Ok(state
                .repository
                .note_funding_request_pending(
                    &request.id,
                    Some("CONFIRMATION_CHECK_FAILED"),
                    Some(&error.to_string()),
                )
                .await?)
        }
    }
}

pub fn spawn_reconciler(state: SharedState) {
    if !state.is_test_environment() {
        return;
    }
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(state.funding_reconcile_interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            let requests = match state.repository.list_submitted_funding_requests(100).await {
                Ok(requests) => requests,
                Err(error) => {
                    tracing::error!(error = %error, "funding reconciliation query failed");
                    continue;
                }
            };
            for request in requests {
                let request_id = request.id.clone();
                if let Err(error) = settle_request(&state, request, false).await {
                    tracing::warn!(
                        request_id = %request_id,
                        code = error.code,
                        error = %error.message,
                        "funding reconciliation attempt did not complete"
                    );
                }
            }
        }
    });
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

fn ensure_test_environment(state: &SharedState) -> FundingResult<()> {
    if state.is_test_environment() {
        Ok(())
    } else {
        Err(FundingHttpError::new(
            StatusCode::NOT_FOUND,
            "FUNDING_NOT_AVAILABLE",
            "Faucet funding is not available on mainnet; mainnet distributions use governed treasury/grant allocation",
        ))
    }
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
            max_manual_grant_aeko: Some(100.0),
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
