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
pub mod overview;
pub mod search;
pub mod social;
pub mod social_feed;

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
        tracing::info!(max_connections = config.db_max_connections, min_connections = config.db_min_connections, "Explorer PostgreSQL repository ready");
        Ok(repository)
    }

    pub async fn ping(&self) -> Result<()> {
        let value: i32 = sqlx::query_scalar("SELECT 1").fetch_one(&self.pool).await.context("Explorer PostgreSQL readiness query failed")?;
        if value != 1 { return Err(anyhow!("Explorer PostgreSQL readiness query returned {value}")); }
        Ok(())
    }

    pub async fn bind_chain_identity(&self, network: &str, genesis_hash: &str) -> Result<()> {
        if network.trim().is_empty() {
            return Err(anyhow!("Explorer network identity cannot be empty"));
        }
        if genesis_hash.trim().is_empty() {
            return Err(anyhow!("Explorer genesis hash cannot be empty"));
        }

        let mut transaction = self
            .pool
            .begin()
            .await
            .context("starting Explorer chain-identity transaction")?;
        sqlx::query("LOCK TABLE explorer_chain_identity IN EXCLUSIVE MODE")
            .execute(&mut *transaction)
            .await
            .context("locking Explorer chain-identity table")?;

        let existing: Option<(String, String)> = sqlx::query_as(
            "SELECT network, genesis_hash FROM explorer_chain_identity WHERE singleton = TRUE",
        )
        .fetch_optional(&mut *transaction)
        .await
        .context("reading Explorer chain identity")?;

        match existing {
            Some((bound_network, bound_genesis_hash)) => {
                if bound_network != network || bound_genesis_hash != genesis_hash {
                    return Err(anyhow!(
                        "Explorer PostgreSQL chain mismatch: database is bound to network {bound_network:?} genesis {bound_genesis_hash}, but this process is configured for network {network:?} genesis {genesis_hash}. Refusing to mix histories"
                    ));
                }
                sqlx::query(
                    "UPDATE explorer_chain_identity SET last_verified_at = NOW() WHERE singleton = TRUE",
                )
                .execute(&mut *transaction)
                .await
                .context("refreshing Explorer chain-identity verification timestamp")?;
            }
            None => {
                sqlx::query(
                    "INSERT INTO explorer_chain_identity (singleton, network, genesis_hash) VALUES (TRUE, $1, $2)",
                )
                .bind(network)
                .bind(genesis_hash)
                .execute(&mut *transaction)
                .await
                .context("binding Explorer PostgreSQL to validator chain identity")?;
            }
        }

        transaction
            .commit()
            .await
            .context("committing Explorer chain-identity transaction")?;
        Ok(())
    }

    pub async fn chain_identity(&self) -> Result<Option<(String, String)>> {
        sqlx::query_as(
            "SELECT network, genesis_hash FROM explorer_chain_identity WHERE singleton = TRUE",
        )
        .fetch_optional(&self.pool)
        .await
        .context("reading Explorer chain identity")
    }

    pub async fn latest_persisted_block_identity(&self) -> Result<Option<(u64, String)>> {
        let row: Option<(i64, String)> = sqlx::query_as(
            "SELECT slot, blockhash FROM blocks ORDER BY slot DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .context("reading latest persisted block identity")?;
        match row {
            Some((slot, blockhash)) if slot >= 0 && !blockhash.is_empty() => {
                Ok(Some((slot as u64, blockhash)))
            }
            Some((slot, _)) if slot < 0 => Err(anyhow!("persisted block slot is negative: {slot}")),
            Some((slot, _)) => Err(anyhow!("persisted block {slot} has an empty blockhash")),
            None => Ok(None),
        }
    }

    pub async fn next_core_slot(&self, configured_start_slot: u64) -> Result<u64> {
        let row: Option<i64> = sqlx::query_scalar("SELECT next_slot FROM indexer_cursors WHERE stream = 'core'").fetch_optional(&self.pool).await.context("reading core indexer cursor")?;
        match row {
            Some(value) if value >= 0 => Ok(value as u64),
            Some(value) => Err(anyhow!("persisted core cursor is negative: {value}")),
            None => Ok(configured_start_slot),
        }
    }

    pub async fn latest_indexed_slot(&self) -> Result<Option<u64>> {
        let next: Option<i64> = sqlx::query_scalar("SELECT next_slot FROM indexer_cursors WHERE stream = 'core'").fetch_optional(&self.pool).await.context("reading latest indexed slot")?;
        match next {
            Some(value) if value > 0 => Ok(Some((value - 1) as u64)),
            Some(0) | None => Ok(None),
            Some(value) => Err(anyhow!("persisted core cursor is negative: {value}")),
        }
    }

    pub async fn latest_projection_slot(&self, stream: &str) -> Result<Option<u64>> {
        let next: Option<i64> = sqlx::query_scalar("SELECT next_slot FROM indexer_cursors WHERE stream = $1")
            .bind(stream).fetch_optional(&self.pool).await.with_context(|| format!("reading {stream} projection cursor"))?;
        match next {
            Some(value) if value > 0 => Ok(Some((value - 1) as u64)),
            Some(0) | None => Ok(None),
            Some(value) => Err(anyhow!("persisted {stream} projection cursor is negative: {value}")),
        }
    }

    pub async fn mark_projection_slot(&self, stream: &str, slot: u64) -> Result<()> {
        let next_slot = slot.checked_add(1).context("projection slot overflow")?;
        sqlx::query(r#"
            INSERT INTO indexer_cursors (stream, next_slot)
            VALUES ($1, $2)
            ON CONFLICT (stream) DO UPDATE SET next_slot = EXCLUDED.next_slot, updated_at = NOW()
            "#)
            .bind(stream)
            .bind(i64::try_from(next_slot).context("projection next slot exceeds BIGINT")?)
            .execute(&self.pool).await.with_context(|| format!("marking {stream} projection cursor"))?;
        Ok(())
    }
}

pub(crate) fn parse_u64_text(value: &str, column: &'static str) -> Result<u64> {
    value.parse::<u64>().with_context(|| format!("invalid u64 persisted in {column}: {value:?}"))
}
