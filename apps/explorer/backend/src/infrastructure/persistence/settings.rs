use {
    super::PostgresRepository,
    anyhow::{Context, Result},
    chrono::{DateTime, Utc},
    sqlx::FromRow,
};

#[derive(Clone, Debug, FromRow, PartialEq, Eq)]
pub struct PersistedAppSettings {
    pub revision: i64,
    pub network_tools_enabled: bool,
    pub network_console_enabled: bool,
    pub docs_enabled: bool,
    pub developers_enabled: bool,
    pub bridge_enabled: bool,
    pub nft_demo_enabled: bool,
    pub nft_live_flow_enabled: bool,
    pub nft_advanced_tools_enabled: bool,
    pub explorer_list_size: i32,
    pub explorer_search_result_limit: i32,
    pub explorer_auto_refresh_seconds: i32,
    pub settings_refresh_seconds: i32,
    pub max_ready_lag_slots_override: Option<i64>,
    pub social_readiness_required_override: Option<bool>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AppSettingsUpdate {
    pub network_tools_enabled: Option<bool>,
    pub network_console_enabled: Option<bool>,
    pub docs_enabled: Option<bool>,
    pub developers_enabled: Option<bool>,
    pub bridge_enabled: Option<bool>,
    pub nft_demo_enabled: Option<bool>,
    pub nft_live_flow_enabled: Option<bool>,
    pub nft_advanced_tools_enabled: Option<bool>,
    pub explorer_list_size: Option<i32>,
    pub explorer_search_result_limit: Option<i32>,
    pub explorer_auto_refresh_seconds: Option<i32>,
    pub settings_refresh_seconds: Option<i32>,
    pub max_ready_lag_slots_override: Option<i64>,
    pub social_readiness_required_override: Option<bool>,
}

impl PostgresRepository {
    pub async fn app_settings(&self) -> Result<PersistedAppSettings> {
        sqlx::query_as::<_, PersistedAppSettings>(
            r#"
            SELECT
                revision,
                network_tools_enabled,
                network_console_enabled,
                docs_enabled,
                developers_enabled,
                bridge_enabled,
                nft_demo_enabled,
                nft_live_flow_enabled,
                nft_advanced_tools_enabled,
                explorer_list_size,
                explorer_search_result_limit,
                explorer_auto_refresh_seconds,
                settings_refresh_seconds,
                max_ready_lag_slots_override,
                social_readiness_required_override,
                updated_at
            FROM explorer_app_settings
            WHERE singleton = TRUE
            "#,
        )
        .fetch_one(&self.pool)
        .await
        .context("reading Explorer application settings")
    }

    pub async fn update_app_settings(
        &self,
        expected_revision: i64,
        update: &AppSettingsUpdate,
    ) -> Result<Option<PersistedAppSettings>> {
        sqlx::query_as::<_, PersistedAppSettings>(
            r#"
            UPDATE explorer_app_settings
            SET
                network_tools_enabled = COALESCE($1, network_tools_enabled),
                network_console_enabled = COALESCE($2, network_console_enabled),
                docs_enabled = COALESCE($3, docs_enabled),
                developers_enabled = COALESCE($4, developers_enabled),
                bridge_enabled = COALESCE($5, bridge_enabled),
                nft_demo_enabled = COALESCE($6, nft_demo_enabled),
                nft_live_flow_enabled = COALESCE($7, nft_live_flow_enabled),
                nft_advanced_tools_enabled = COALESCE($8, nft_advanced_tools_enabled),
                explorer_list_size = COALESCE($9, explorer_list_size),
                explorer_search_result_limit = COALESCE($10, explorer_search_result_limit),
                explorer_auto_refresh_seconds = COALESCE($11, explorer_auto_refresh_seconds),
                settings_refresh_seconds = COALESCE($12, settings_refresh_seconds),
                max_ready_lag_slots_override = COALESCE($13, max_ready_lag_slots_override),
                social_readiness_required_override = COALESCE($14, social_readiness_required_override),
                revision = revision + 1,
                updated_at = NOW()
            WHERE singleton = TRUE AND revision = $15
            RETURNING
                revision,
                network_tools_enabled,
                network_console_enabled,
                docs_enabled,
                developers_enabled,
                bridge_enabled,
                nft_demo_enabled,
                nft_live_flow_enabled,
                nft_advanced_tools_enabled,
                explorer_list_size,
                explorer_search_result_limit,
                explorer_auto_refresh_seconds,
                settings_refresh_seconds,
                max_ready_lag_slots_override,
                social_readiness_required_override,
                updated_at
            "#,
        )
        .bind(update.network_tools_enabled)
        .bind(update.network_console_enabled)
        .bind(update.docs_enabled)
        .bind(update.developers_enabled)
        .bind(update.bridge_enabled)
        .bind(update.nft_demo_enabled)
        .bind(update.nft_live_flow_enabled)
        .bind(update.nft_advanced_tools_enabled)
        .bind(update.explorer_list_size)
        .bind(update.explorer_search_result_limit)
        .bind(update.explorer_auto_refresh_seconds)
        .bind(update.settings_refresh_seconds)
        .bind(update.max_ready_lag_slots_override)
        .bind(update.social_readiness_required_override)
        .bind(expected_revision)
        .fetch_optional(&self.pool)
        .await
        .context("updating Explorer application settings")
    }
}
