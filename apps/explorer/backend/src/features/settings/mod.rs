use {
    crate::{
        error::{ApiError, ApiResult},
        infrastructure::persistence::settings::{AppSettingsUpdate, PersistedAppSettings},
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::anyhow,
    axum::{extract::State, http::HeaderMap, routing::get, Json, Router},
    serde::{Deserialize, Serialize},
};

const SETTINGS_ADMIN_HEADER: &str = "x-aeko-settings-token";
const MIN_LIST_SIZE: u16 = 3;
const MAX_LIST_SIZE: u16 = 12;
const MIN_SEARCH_RESULT_LIMIT: u16 = 5;
const MAX_SEARCH_RESULT_LIMIT: u16 = 50;
const MIN_AUTO_REFRESH_SECONDS: u64 = 5;
const MAX_AUTO_REFRESH_SECONDS: u64 = 300;
const MIN_SETTINGS_REFRESH_SECONDS: u64 = 10;
const MAX_SETTINGS_REFRESH_SECONDS: u64 = 300;
const MIN_READY_LAG_SLOTS: u64 = 16;
const MAX_READY_LAG_SLOTS: u64 = 4096;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationSettingsView {
    network_tools_enabled: bool,
    network_console_enabled: bool,
    docs_enabled: bool,
    developers_enabled: bool,
    bridge_enabled: bool,
    nft_demo_enabled: bool,
    nft_live_flow_enabled: bool,
    nft_advanced_tools_enabled: bool,
    explorer_list_size: u16,
    explorer_search_result_limit: u16,
    explorer_auto_refresh_seconds: u64,
    settings_refresh_seconds: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockchainSettingsView {
    network: String,
    genesis_hash: String,
    social_indexing_enabled: bool,
    social_readiness_required: bool,
    max_ready_lag_slots: u64,
    readiness_policy_source: &'static str,
    configuration_source: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsSnapshot {
    revision: u64,
    updated_at: String,
    application: ApplicationSettingsView,
    blockchain: BlockchainSettingsView,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SettingsPatch {
    expected_revision: u64,
    network_tools_enabled: Option<bool>,
    network_console_enabled: Option<bool>,
    docs_enabled: Option<bool>,
    developers_enabled: Option<bool>,
    bridge_enabled: Option<bool>,
    nft_demo_enabled: Option<bool>,
    nft_live_flow_enabled: Option<bool>,
    nft_advanced_tools_enabled: Option<bool>,
    explorer_list_size: Option<u16>,
    explorer_search_result_limit: Option<u16>,
    explorer_auto_refresh_seconds: Option<u64>,
    settings_refresh_seconds: Option<u64>,
    max_ready_lag_slots: Option<u64>,
    social_readiness_required: Option<bool>,
}

impl SettingsPatch {
    fn validate(&self) -> ApiResult<()> {
        if self.expected_revision == 0 {
            return Err(ApiError::BadRequest(
                "expectedRevision must be greater than zero".to_string(),
            ));
        }

        let has_change = self.network_tools_enabled.is_some()
            || self.network_console_enabled.is_some()
            || self.docs_enabled.is_some()
            || self.developers_enabled.is_some()
            || self.bridge_enabled.is_some()
            || self.nft_demo_enabled.is_some()
            || self.nft_live_flow_enabled.is_some()
            || self.nft_advanced_tools_enabled.is_some()
            || self.explorer_list_size.is_some()
            || self.explorer_search_result_limit.is_some()
            || self.explorer_auto_refresh_seconds.is_some()
            || self.settings_refresh_seconds.is_some()
            || self.max_ready_lag_slots.is_some()
            || self.social_readiness_required.is_some();
        if !has_change {
            return Err(ApiError::BadRequest(
                "at least one setting must be supplied".to_string(),
            ));
        }

        if let Some(value) = self.explorer_list_size {
            if !(MIN_LIST_SIZE..=MAX_LIST_SIZE).contains(&value) {
                return Err(ApiError::BadRequest(format!(
                    "explorerListSize must be between {MIN_LIST_SIZE} and {MAX_LIST_SIZE}"
                )));
            }
        }

        if let Some(value) = self.explorer_search_result_limit {
            if !(MIN_SEARCH_RESULT_LIMIT..=MAX_SEARCH_RESULT_LIMIT).contains(&value) {
                return Err(ApiError::BadRequest(format!(
                    "explorerSearchResultLimit must be between {MIN_SEARCH_RESULT_LIMIT} and {MAX_SEARCH_RESULT_LIMIT}"
                )));
            }
        }

        if let Some(value) = self.explorer_auto_refresh_seconds {
            if !(MIN_AUTO_REFRESH_SECONDS..=MAX_AUTO_REFRESH_SECONDS).contains(&value) {
                return Err(ApiError::BadRequest(format!(
                    "explorerAutoRefreshSeconds must be between {MIN_AUTO_REFRESH_SECONDS} and {MAX_AUTO_REFRESH_SECONDS}"
                )));
            }
        }

        if let Some(value) = self.settings_refresh_seconds {
            if !(MIN_SETTINGS_REFRESH_SECONDS..=MAX_SETTINGS_REFRESH_SECONDS).contains(&value) {
                return Err(ApiError::BadRequest(format!(
                    "settingsRefreshSeconds must be between {MIN_SETTINGS_REFRESH_SECONDS} and {MAX_SETTINGS_REFRESH_SECONDS}"
                )));
            }
        }

        if let Some(value) = self.max_ready_lag_slots {
            if !(MIN_READY_LAG_SLOTS..=MAX_READY_LAG_SLOTS).contains(&value) {
                return Err(ApiError::BadRequest(format!(
                    "maxReadyLagSlots must be between {MIN_READY_LAG_SLOTS} and {MAX_READY_LAG_SLOTS}"
                )));
            }
        }

        Ok(())
    }

    fn into_update(self) -> AppSettingsUpdate {
        AppSettingsUpdate {
            network_tools_enabled: self.network_tools_enabled,
            network_console_enabled: self.network_console_enabled,
            docs_enabled: self.docs_enabled,
            developers_enabled: self.developers_enabled,
            bridge_enabled: self.bridge_enabled,
            nft_demo_enabled: self.nft_demo_enabled,
            nft_live_flow_enabled: self.nft_live_flow_enabled,
            nft_advanced_tools_enabled: self.nft_advanced_tools_enabled,
            explorer_list_size: self.explorer_list_size.map(i32::from),
            explorer_search_result_limit: self.explorer_search_result_limit.map(i32::from),
            explorer_auto_refresh_seconds: self
                .explorer_auto_refresh_seconds
                .map(|value| value as i32),
            settings_refresh_seconds: self.settings_refresh_seconds.map(|value| value as i32),
            max_ready_lag_slots_override: self.max_ready_lag_slots.map(|value| value as i64),
            social_readiness_required_override: self.social_readiness_required,
        }
    }
}

pub fn router() -> Router<SharedState> {
    Router::new().route("/settings", get(read_settings).patch(update_settings))
}

async fn read_settings(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SettingsSnapshot>>> {
    let persisted = state.repository.app_settings().await?;
    let snapshot = build_snapshot(&state, persisted)?;
    Ok(response::data_from_source(
        &state.network,
        snapshot,
        "settings+process",
    ))
}

async fn update_settings(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(patch): Json<SettingsPatch>,
) -> ApiResult<Json<DataEnvelope<SettingsSnapshot>>> {
    authorize(&headers, &state.settings_admin_token)?;
    patch.validate()?;

    let expected_revision = i64::try_from(patch.expected_revision)
        .map_err(|_| ApiError::BadRequest("expectedRevision is too large".to_string()))?;
    let update = patch.into_update();
    let persisted = state
        .repository
        .update_app_settings(expected_revision, &update)
        .await?
        .ok_or_else(|| {
            ApiError::Conflict(
                "application settings changed since they were loaded; reload and retry".to_string(),
            )
        })?;

    let snapshot = build_snapshot(&state, persisted)?;
    Ok(response::data_from_source(
        &state.network,
        snapshot,
        "settings+process",
    ))
}

fn build_snapshot(
    state: &SharedState,
    persisted: PersistedAppSettings,
) -> ApiResult<SettingsSnapshot> {
    let revision = u64::try_from(persisted.revision)
        .map_err(|_| ApiError::Internal(anyhow!("persisted settings revision is negative")))?;
    let explorer_list_size = u16::try_from(persisted.explorer_list_size)
        .map_err(|_| ApiError::Internal(anyhow!("persisted Explorer list size is invalid")))?;
    let explorer_search_result_limit =
        u16::try_from(persisted.explorer_search_result_limit).map_err(|_| {
            ApiError::Internal(anyhow!("persisted Explorer search result limit is invalid"))
        })?;
    let explorer_auto_refresh_seconds =
        u64::try_from(persisted.explorer_auto_refresh_seconds).map_err(|_| {
            ApiError::Internal(anyhow!("persisted Explorer auto refresh interval is invalid"))
        })?;
    let settings_refresh_seconds =
        u64::try_from(persisted.settings_refresh_seconds).map_err(|_| {
            ApiError::Internal(anyhow!("persisted settings refresh interval is invalid"))
        })?;

    let max_ready_lag_slots_override = persisted
        .max_ready_lag_slots_override
        .map(u64::try_from)
        .transpose()
        .map_err(|_| ApiError::Internal(anyhow!("persisted readiness lag override is invalid")))?;
    let max_ready_lag_slots = max_ready_lag_slots_override.unwrap_or(state.max_ready_lag_slots);
    let social_readiness_required = persisted
        .social_readiness_required_override
        .unwrap_or(state.social_enabled);
    let readiness_policy_source = if max_ready_lag_slots_override.is_some()
        || persisted.social_readiness_required_override.is_some()
    {
        "settings"
    } else {
        "process-environment"
    };

    Ok(SettingsSnapshot {
        revision,
        updated_at: persisted.updated_at.to_rfc3339(),
        application: ApplicationSettingsView {
            network_tools_enabled: persisted.network_tools_enabled,
            network_console_enabled: persisted.network_console_enabled,
            docs_enabled: persisted.docs_enabled,
            developers_enabled: persisted.developers_enabled,
            bridge_enabled: persisted.bridge_enabled,
            nft_demo_enabled: persisted.nft_demo_enabled,
            nft_live_flow_enabled: persisted.nft_live_flow_enabled,
            nft_advanced_tools_enabled: persisted.nft_advanced_tools_enabled,
            explorer_list_size,
            explorer_search_result_limit,
            explorer_auto_refresh_seconds,
            settings_refresh_seconds,
        },
        blockchain: BlockchainSettingsView {
            network: state.network.clone(),
            genesis_hash: state.genesis_hash.clone(),
            social_indexing_enabled: state.social_enabled,
            social_readiness_required,
            max_ready_lag_slots,
            readiness_policy_source,
            configuration_source: "process-environment",
        },
    })
}

fn authorize(headers: &HeaderMap, expected: &str) -> ApiResult<()> {
    let supplied = headers
        .get(SETTINGS_ADMIN_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if constant_time_equal(supplied.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
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

#[cfg(test)]
mod tests {
    use super::{constant_time_equal, SettingsPatch};

    fn base_patch() -> SettingsPatch {
        SettingsPatch {
            expected_revision: 1,
            network_tools_enabled: None,
            network_console_enabled: None,
            docs_enabled: None,
            developers_enabled: None,
            bridge_enabled: None,
            nft_demo_enabled: None,
            nft_live_flow_enabled: None,
            nft_advanced_tools_enabled: None,
            explorer_list_size: None,
            explorer_search_result_limit: None,
            explorer_auto_refresh_seconds: None,
            settings_refresh_seconds: None,
            max_ready_lag_slots: None,
            social_readiness_required: None,
        }
    }

    #[test]
    fn patch_requires_a_change_and_valid_numeric_bounds() {
        assert!(base_patch().validate().is_err());

        let mut valid = base_patch();
        valid.explorer_list_size = Some(6);
        valid.explorer_search_result_limit = Some(12);
        valid.explorer_auto_refresh_seconds = Some(15);
        valid.settings_refresh_seconds = Some(30);
        assert!(valid.validate().is_ok());

        let mut bad_list = base_patch();
        bad_list.explorer_list_size = Some(13);
        assert!(bad_list.validate().is_err());

        let mut bad_search = base_patch();
        bad_search.explorer_search_result_limit = Some(4);
        assert!(bad_search.validate().is_err());

        let mut bad_auto_refresh = base_patch();
        bad_auto_refresh.explorer_auto_refresh_seconds = Some(4);
        assert!(bad_auto_refresh.validate().is_err());

        let mut bad_refresh = base_patch();
        bad_refresh.settings_refresh_seconds = Some(9);
        assert!(bad_refresh.validate().is_err());

        let mut bad_lag = base_patch();
        bad_lag.max_ready_lag_slots = Some(4);
        assert!(bad_lag.validate().is_err());
    }

    #[test]
    fn settings_token_comparison_rejects_length_and_content_mismatches() {
        assert!(constant_time_equal(b"same-token", b"same-token"));
        assert!(!constant_time_equal(b"same-token", b"other-token"));
        assert!(!constant_time_equal(b"short", b"longer-token"));
    }
}
