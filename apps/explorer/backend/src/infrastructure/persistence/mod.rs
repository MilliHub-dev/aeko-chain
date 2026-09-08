use {
    crate::config::ExplorerBackendConfig,
    anyhow::{anyhow, Context, Result},
    sqlx::{
        postgres::{PgConnectOptions, PgPoolOptions},
        ConnectOptions, PgPool,
    },
    std::str::FromStr,
};

pub mod accounts;
pub mod assets;
pub mod ledger;
pub mod search;
pub mod social;

#[derive(Clone)]
pub struct PostgresRepository {
    pub(crate) pool: PgPool,
}

impl PostgresRepository {
    pub async fn connect(config: &ExplorerBackendConfig) -> Result<Self> {
        let connect_options = PgConnectOptions::from_str(&config.database_url)
            .context("parsing Explorer PostgreSQL URL")?
            .log_statements(tracing::log::LevelFilter::Trace);
        let pool = PgPoolOptions::new()
            .max_connections(config.db_max_connections)
            .min_connections(config.db_min_connections)
            .acquire_timeout(config.db_acquire_timeout)
            .connect_with(connect_options)
            .await
            .context("connecting Explorer PostgreSQL")?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .context("running Explorer PostgreSQL migrations")?;

        let repository = Self { pool };
        repository.ping().await?;
        tracing::info!(
            max_connections = config.db_max_connections,
            min_connections = config.db_min_connections,
            "Explorer PostgreSQL repository ready"
        );
        Ok(repository)
    }

    pub async fn ping(&self) -> Result<()> {
        let value: i32 = sqlx::query_scalar("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .context("Explorer PostgreSQL readiness query failed")?;
        if value != 1 {
            return Err(anyhow!("Explorer PostgreSQL readiness query returned {value}"));
        }
        Ok(())
    }

    pub async fn next_core_slot(&self, configured_start_slot: u64) -> Result<u64> {
        let row: Option<i64> = sqlx::query_scalar(
            "SELECT next_slot FROM indexer_cursors WHERE stream = 'core'",
        )
        .fetch_optional(&self.pool)
        .await
        .context("reading core indexer cursor")?;
        match row {
            Some(value) if value >= 0 => Ok(value as u64),
            Some(value) => Err(anyhow!("persisted core cursor is negative: {value}")),
            None => Ok(configured_start_slot),
        }
    }

    pub async fn latest_indexed_slot(&self) -> Result<Option<u64>> {
        let next: Option<i64> = sqlx::query_scalar(
            "SELECT next_slot FROM indexer_cursors WHERE stream = 'core'",
        )
        .fetch_optional(&self.pool)
        .await
        .context("reading latest indexed slot")?;
        match next {
            Some(value) if value > 0 => Ok(Some((value - 1) as u64)),
            Some(0) | None => Ok(None),
            Some(value) => Err(anyhow!("persisted core cursor is negative: {value}")),
        }
    }
}

pub(crate) fn parse_u64_text(value: &str, column: &'static str) -> Result<u64> {
    value
        .parse::<u64>()
        .with_context(|| format!("invalid u64 persisted in {column}: {value:?}"))
}
