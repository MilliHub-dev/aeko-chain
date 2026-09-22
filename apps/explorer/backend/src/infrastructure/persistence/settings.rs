use {
    super::PostgresRepository,
    anyhow::{Context, Result},
    chrono::{DateTime, Utc},
    sqlx::FromRow,
};

#[derive(Clone, Debug, FromRow, PartialEq, Eq)]
pub struct PersistedAppSettings {
    pub revision: i64,
    pub network_console_enabled: bool,
    pub nft_demo_enabled: bool,
    pub nft_live_flow_enabled: bool,
    pub nft_advanced_tools_enabled: bool,
    pub explorer_list_size: i32,
    pub settings_refresh_seconds: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AppSettingsUpdate {
    pub network_console_enabled: Option<bool>,
    pub nft_demo_enabled: Option<bool>,
    pub nft_live_flow_enabled: Option<bool>,
    pub nft_advanced_tools_enabled: Option<bool>,
    pub explorer_list_size: Option<i32>,
    pub settings_refresh_seconds: Option<i32>,
}

impl PostgresRepository {
    pub async fn app_settings(&self) -> Result<PersistedAppSettings> {
        sqlx::query_as::<_, PersistedAppSettings>(
            r#"
            SELECT
                revision,
                network_console_enabled,
                nft_demo_enabled,
                nft_live_flow_enabled,
                nft_advanced_tools_enabled,
                explorer_list_size,
                settings_refresh_seconds,
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
                network_console_enabled = COALESCE($1, network_console_enabled),
                nft_demo_enabled = COALESCE($2, nft_demo_enabled),
                nft_live_flow_enabled = COALESCE($3, nft_live_flow_enabled),
                nft_advanced_tools_enabled = COALESCE($4, nft_advanced_tools_enabled),
                explorer_list_size = COALESCE($5, explorer_list_size),
                settings_refresh_seconds = COALESCE($6, settings_refresh_seconds),
                revision = revision + 1,
                updated_at = NOW()
            WHERE singleton = TRUE AND revision = $7
            RETURNING
                revision,
                network_console_enabled,
                nft_demo_enabled,
                nft_live_flow_enabled,
                nft_advanced_tools_enabled,
                explorer_list_size,
                settings_refresh_seconds,
                updated_at
            "#,
        )
        .bind(update.network_console_enabled)
        .bind(update.nft_demo_enabled)
        .bind(update.nft_live_flow_enabled)
        .bind(update.nft_advanced_tools_enabled)
        .bind(update.explorer_list_size)
        .bind(update.settings_refresh_seconds)
        .bind(expected_revision)
        .fetch_optional(&self.pool)
        .await
        .context("updating Explorer application settings")
    }
}
