use {
    super::PostgresRepository,
    chrono::{DateTime, Utc},
    sqlx::FromRow,
};

#[derive(Clone, Debug, FromRow)]
pub struct PersistedFundingSettings {
    pub enabled: bool,
    pub amount_aeko: f64,
    pub cooldown_hours: f64,
    pub daily_budget_aeko: f64,
    pub max_manual_grant_aeko: f64,
    pub console_airdrop_cap_aeko: f64,
    pub revision: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Default)]
pub struct FundingSettingsUpdate {
    pub enabled: Option<bool>,
    pub amount_aeko: Option<f64>,
    pub cooldown_hours: Option<f64>,
    pub daily_budget_aeko: Option<f64>,
    pub max_manual_grant_aeko: Option<f64>,
    pub console_airdrop_cap_aeko: Option<f64>,
}

#[derive(Clone, Debug, FromRow)]
pub struct FundingRequestRecord {
    pub id: String,
    pub address: String,
    pub amount_aeko: f64,
    pub requested_at: DateTime<Utc>,
    pub source: String,
    pub status: String,
    pub decided_at: Option<DateTime<Utc>>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub signature: Option<String>,
    pub confirmed: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug, FromRow)]
pub struct FundingGrantRecord {
    pub id: String,
    pub request_id: Option<String>,
    pub address: String,
    pub amount_aeko: f64,
    pub signature: Option<String>,
    pub granted_at: DateTime<Utc>,
    pub source: String,
    pub confirmed: bool,
}

#[derive(Clone, Debug, FromRow)]
pub struct FundingAirdropRecord {
    pub id: String,
    pub address: String,
    pub amount_aeko: f64,
    pub signature: Option<String>,
    pub status: String,
    pub requested_at: DateTime<Utc>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug)]
pub struct FundingPolicySnapshot {
    pub settings: PersistedFundingSettings,
    pub public_spent_aeko: f64,
    pub public_reserved_aeko: f64,
}

impl FundingPolicySnapshot {
    pub fn daily_remaining_aeko(&self) -> f64 {
        (self.settings.daily_budget_aeko - self.public_spent_aeko - self.public_reserved_aeko)
            .max(0.0)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FundingStoreError {
    #[error("test funding is paused")]
    Disabled,
    #[error("wallet is still in funding cooldown")]
    Cooldown { retry_after_seconds: u64 },
    #[error("wallet already has an active funding request")]
    RequestPending { request_id: String },
    #[error("the public funding budget is exhausted")]
    BudgetExhausted,
    #[error("funding request not found")]
    RequestNotFound,
    #[error("funding airdrop not found")]
    AirdropNotFound,
    #[error("funding request is already {status}")]
    RequestAlreadyDecided { status: String },
    #[error("funding settings revision conflict")]
    RevisionConflict,
    #[error("funding request rate limit exceeded")]
    RateLimited { retry_after_seconds: u64 },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

const SETTINGS_COLUMNS: &str = r#"
    enabled,
    amount_aeko::double precision AS amount_aeko,
    cooldown_hours::double precision AS cooldown_hours,
    daily_budget_aeko::double precision AS daily_budget_aeko,
    max_manual_grant_aeko::double precision AS max_manual_grant_aeko,
    console_airdrop_cap_aeko::double precision AS console_airdrop_cap_aeko,
    revision,
    updated_at
"#;

const REQUEST_COLUMNS: &str = r#"
    id::text AS id,
    address,
    amount_aeko::double precision AS amount_aeko,
    requested_at,
    source,
    status,
    decided_at,
    submitted_at,
    confirmed_at,
    signature,
    confirmed,
    error_code,
    error_message
"#;

const GRANT_COLUMNS: &str = r#"
    id::text AS id,
    request_id::text AS request_id,
    address,
    amount_aeko::double precision AS amount_aeko,
    signature,
    granted_at,
    source,
    confirmed
"#;

const AIRDROP_COLUMNS: &str = r#"
    id::text AS id,
    address,
    amount_aeko::double precision AS amount_aeko,
    signature,
    status,
    requested_at,
    submitted_at,
    confirmed_at,
    error_code,
    error_message
"#;

impl PostgresRepository {
    pub async fn funding_policy_snapshot(&self) -> Result<FundingPolicySnapshot, sqlx::Error> {
        let settings = self.funding_settings().await?;
        let public_spent_aeko: f64 = sqlx::query_scalar(
            r#"
            SELECT COALESCE(SUM(amount_aeko), 0)::double precision
            FROM funding_grants
            WHERE source = 'public'
              AND confirmed = TRUE
              AND granted_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
            "#,
        )
        .fetch_one(&self.pool)
        .await?;
        let public_reserved_aeko: f64 = sqlx::query_scalar(
            r#"
            SELECT COALESCE(SUM(amount_aeko), 0)::double precision
            FROM funding_requests
            WHERE source = 'public'
              AND status IN ('processing', 'submitted')
              AND decided_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
            "#,
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(FundingPolicySnapshot {
            settings,
            public_spent_aeko,
            public_reserved_aeko,
        })
    }

    pub async fn funding_settings(&self) -> Result<PersistedFundingSettings, sqlx::Error> {
        let sql = format!("SELECT {SETTINGS_COLUMNS} FROM funding_settings WHERE singleton = TRUE");
        sqlx::query_as::<_, PersistedFundingSettings>(&sql)
            .fetch_one(&self.pool)
            .await
    }

    pub async fn update_funding_settings(
        &self,
        expected_revision: i64,
        update: &FundingSettingsUpdate,
    ) -> Result<PersistedFundingSettings, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_settings
            SET
                enabled = COALESCE($1, enabled),
                amount_aeko = CASE WHEN $2::double precision IS NULL THEN amount_aeko ELSE $2::double precision::numeric END,
                cooldown_hours = CASE WHEN $3::double precision IS NULL THEN cooldown_hours ELSE $3::double precision::numeric END,
                daily_budget_aeko = CASE WHEN $4::double precision IS NULL THEN daily_budget_aeko ELSE $4::double precision::numeric END,
                max_manual_grant_aeko = CASE WHEN $5::double precision IS NULL THEN max_manual_grant_aeko ELSE $5::double precision::numeric END,
                console_airdrop_cap_aeko = CASE WHEN $6::double precision IS NULL THEN console_airdrop_cap_aeko ELSE $6::double precision::numeric END,
                revision = revision + 1,
                updated_at = NOW()
            WHERE singleton = TRUE AND revision = $7
            RETURNING {SETTINGS_COLUMNS}
            "#
        );
        sqlx::query_as::<_, PersistedFundingSettings>(&sql)
            .bind(update.enabled)
            .bind(update.amount_aeko)
            .bind(update.cooldown_hours)
            .bind(update.daily_budget_aeko)
            .bind(update.max_manual_grant_aeko)
            .bind(update.console_airdrop_cap_aeko)
            .bind(expected_revision)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::RevisionConflict)
    }

    pub async fn record_funding_rate_event(
        &self,
        scope: &str,
        subject: &str,
        max_requests: i64,
        window_seconds: i32,
    ) -> Result<(), FundingStoreError> {
        let mut tx = self.pool.begin().await?;
        let lock_key = format!("{scope}:{subject}");
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(&lock_key)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM funding_rate_events WHERE occurred_at < NOW() - INTERVAL '1 day'")
            .execute(&mut *tx)
            .await?;
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)::bigint
            FROM funding_rate_events
            WHERE scope = $1
              AND subject = $2
              AND occurred_at >= NOW() - make_interval(secs => $3)
            "#,
        )
        .bind(scope)
        .bind(subject)
        .bind(window_seconds)
        .fetch_one(&mut *tx)
        .await?;
        if count >= max_requests {
            return Err(FundingStoreError::RateLimited {
                retry_after_seconds: u64::try_from(window_seconds).unwrap_or(600),
            });
        }
        sqlx::query("INSERT INTO funding_rate_events (scope, subject) VALUES ($1, $2)")
            .bind(scope)
            .bind(subject)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn create_public_funding_request(
        &self,
        address: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let mut tx = self.pool.begin().await?;
        let settings_sql = format!(
            "SELECT {SETTINGS_COLUMNS} FROM funding_settings WHERE singleton = TRUE FOR UPDATE"
        );
        let settings = sqlx::query_as::<_, PersistedFundingSettings>(&settings_sql)
            .fetch_one(&mut *tx)
            .await?;
        if !settings.enabled {
            return Err(FundingStoreError::Disabled);
        }

        let pending: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id::text
            FROM funding_requests
            WHERE address = $1
              AND source = 'public'
              AND status IN ('pending', 'processing', 'submitted')
            ORDER BY requested_at DESC
            LIMIT 1
            "#,
        )
        .bind(address)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(request_id) = pending {
            return Err(FundingStoreError::RequestPending { request_id });
        }

        self.ensure_public_cooldown(&mut tx, address, settings.cooldown_hours)
            .await?;

        let spent = public_spent_today(&mut tx).await?;
        let reserved = public_reserved_today(&mut tx).await?;
        if spent + reserved + settings.amount_aeko > settings.daily_budget_aeko {
            return Err(FundingStoreError::BudgetExhausted);
        }

        let sql = format!(
            r#"
            INSERT INTO funding_requests (address, amount_aeko, source, status)
            VALUES ($1, $2::double precision::numeric, 'public', 'pending')
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        let request = sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(address)
            .bind(settings.amount_aeko)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(request)
    }

    pub async fn create_immediate_grant_request(
        &self,
        address: &str,
        amount_aeko: f64,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            INSERT INTO funding_requests (address, amount_aeko, source, status, decided_at)
            VALUES ($1, $2::double precision::numeric, 'admin', 'processing', NOW())
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        Ok(sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(address)
            .bind(amount_aeko)
            .fetch_one(&self.pool)
            .await?)
    }

    pub async fn reserve_public_funding_request(
        &self,
        id: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let mut tx = self.pool.begin().await?;
        let request_sql = format!(
            "SELECT {REQUEST_COLUMNS} FROM funding_requests WHERE id = $1::uuid FOR UPDATE"
        );
        let request = sqlx::query_as::<_, FundingRequestRecord>(&request_sql)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)?;
        if request.status != "pending" || request.source != "public" {
            return Err(FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            });
        }

        let settings_sql = format!(
            "SELECT {SETTINGS_COLUMNS} FROM funding_settings WHERE singleton = TRUE FOR UPDATE"
        );
        let settings = sqlx::query_as::<_, PersistedFundingSettings>(&settings_sql)
            .fetch_one(&mut *tx)
            .await?;
        if !settings.enabled {
            return Err(FundingStoreError::Disabled);
        }

        self.ensure_public_cooldown(&mut tx, &request.address, settings.cooldown_hours)
            .await?;

        let spent = public_spent_today(&mut tx).await?;
        let reserved = public_reserved_today(&mut tx).await?;
        if spent + reserved + request.amount_aeko > settings.daily_budget_aeko {
            return Err(FundingStoreError::BudgetExhausted);
        }

        let update_sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'processing',
                decided_at = NOW(),
                submitted_at = NULL,
                confirmed_at = NULL,
                signature = NULL,
                confirmed = FALSE,
                error_code = NULL,
                error_message = NULL
            WHERE id = $1::uuid
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        let reserved_request = sqlx::query_as::<_, FundingRequestRecord>(&update_sql)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(reserved_request)
    }

    pub async fn set_funding_request_signature(
        &self,
        id: &str,
        signature: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'submitted',
                signature = $2,
                submitted_at = COALESCE(submitted_at, NOW()),
                confirmed = FALSE,
                error_code = NULL,
                error_message = NULL
            WHERE id = $1::uuid AND status = 'processing'
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        if let Some(request) = sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(signature)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(request);
        }
        let existing = self
            .funding_request(id)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)?;
        if existing.status == "submitted" && existing.signature.as_deref() == Some(signature) {
            return Ok(existing);
        }
        Err(FundingStoreError::RequestAlreadyDecided {
            status: existing.status,
        })
    }

    pub async fn mark_funding_request_submission_error(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET error_code = $2, error_message = $3
            WHERE id = $1::uuid AND status = 'processing' AND signature IS NULL
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)
    }

    pub async fn reset_public_request_after_explicit_submit_rejection(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'pending',
                decided_at = NULL,
                submitted_at = NULL,
                confirmed_at = NULL,
                signature = NULL,
                confirmed = FALSE,
                error_code = $2,
                error_message = $3
            WHERE id = $1::uuid
              AND source = 'public'
              AND status = 'processing'
              AND signature IS NULL
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)
    }

    pub async fn mark_funding_request_observation_error(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET error_code = $2, error_message = $3
            WHERE id = $1::uuid AND status = 'submitted' AND signature IS NOT NULL
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)
    }

    pub async fn mark_funding_request_failed(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'failed',
                confirmed = FALSE,
                error_code = $2,
                error_message = $3
            WHERE id = $1::uuid AND status IN ('processing', 'submitted')
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        if let Some(request) = sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(request);
        }
        let existing = self
            .funding_request(id)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)?;
        Err(FundingStoreError::RequestAlreadyDecided {
            status: existing.status,
        })
    }

    pub async fn reject_funding_request(
        &self,
        id: &str,
        code: Option<&str>,
        message: Option<&str>,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'rejected',
                decided_at = NOW(),
                confirmed = FALSE,
                error_code = $2,
                error_message = $3
            WHERE id = $1::uuid AND status = 'pending'
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        if let Some(request) = sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(request);
        }
        let existing = self.funding_request(id).await?;
        match existing {
            Some(request) => Err(FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            }),
            None => Err(FundingStoreError::RequestNotFound),
        }
    }

    pub async fn confirm_funding_request(
        &self,
        id: &str,
    ) -> Result<FundingRequestRecord, FundingStoreError> {
        let mut tx = self.pool.begin().await?;
        let request_sql = format!(
            "SELECT {REQUEST_COLUMNS} FROM funding_requests WHERE id = $1::uuid FOR UPDATE"
        );
        let request = sqlx::query_as::<_, FundingRequestRecord>(&request_sql)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(FundingStoreError::RequestNotFound)?;

        if request.status == "confirmed" {
            return Ok(request);
        }
        if request.status != "submitted" {
            return Err(FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            });
        }
        let signature =
            request
                .signature
                .as_deref()
                .ok_or(FundingStoreError::RequestAlreadyDecided {
                    status: "submitted-without-signature".to_string(),
                })?;

        // Pre-0012 rows already have a grant keyed by signature but no
        // request_id. Adopt that row inside the same transaction before the
        // request-id upsert so an upgraded database remains idempotent.
        sqlx::query(
            r#"
            UPDATE funding_grants
            SET request_id = $1::uuid, confirmed = TRUE
            WHERE request_id IS NULL
              AND signature = $2
              AND source = $3
              AND address = $4
            "#,
        )
        .bind(id)
        .bind(signature)
        .bind(&request.source)
        .bind(&request.address)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO funding_grants (
                request_id,
                address,
                amount_aeko,
                signature,
                granted_at,
                source,
                confirmed
            )
            VALUES ($1::uuid, $2, $3::double precision::numeric, $4, NOW(), $5, TRUE)
            ON CONFLICT (request_id) WHERE request_id IS NOT NULL
            DO UPDATE SET
                signature = EXCLUDED.signature,
                confirmed = TRUE
            "#,
        )
        .bind(id)
        .bind(&request.address)
        .bind(request.amount_aeko)
        .bind(signature)
        .bind(&request.source)
        .execute(&mut *tx)
        .await?;

        let update_sql = format!(
            r#"
            UPDATE funding_requests
            SET
                status = 'confirmed',
                confirmed = TRUE,
                confirmed_at = NOW(),
                error_code = NULL,
                error_message = NULL
            WHERE id = $1::uuid
            RETURNING {REQUEST_COLUMNS}
            "#
        );
        let confirmed = sqlx::query_as::<_, FundingRequestRecord>(&update_sql)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(confirmed)
    }

    pub async fn funding_request(
        &self,
        id: &str,
    ) -> Result<Option<FundingRequestRecord>, FundingStoreError> {
        let sql = format!("SELECT {REQUEST_COLUMNS} FROM funding_requests WHERE id = $1::uuid");
        Ok(sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn list_funding_requests(
        &self,
        limit: i64,
    ) -> Result<Vec<FundingRequestRecord>, FundingStoreError> {
        let sql = format!(
            r#"
            SELECT {REQUEST_COLUMNS}
            FROM funding_requests
            WHERE source IN ('public', 'admin')
            ORDER BY requested_at DESC
            LIMIT $1
            "#
        );
        Ok(sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn list_submitted_funding_requests(
        &self,
        limit: i64,
    ) -> Result<Vec<FundingRequestRecord>, FundingStoreError> {
        let sql = format!(
            r#"
            SELECT {REQUEST_COLUMNS}
            FROM funding_requests
            WHERE status = 'submitted'
              AND signature IS NOT NULL
            ORDER BY submitted_at ASC NULLS FIRST, requested_at ASC
            LIMIT $1
            "#
        );
        Ok(sqlx::query_as::<_, FundingRequestRecord>(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn list_funding_grants(
        &self,
        limit: i64,
    ) -> Result<Vec<FundingGrantRecord>, FundingStoreError> {
        let sql = format!(
            r#"
            SELECT {GRANT_COLUMNS}
            FROM funding_grants
            WHERE source IN ('public', 'admin')
            ORDER BY granted_at DESC
            LIMIT $1
            "#
        );
        Ok(sqlx::query_as::<_, FundingGrantRecord>(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn create_funding_airdrop(
        &self,
        address: &str,
        amount_aeko: f64,
    ) -> Result<FundingAirdropRecord, FundingStoreError> {
        let sql = format!(
            r#"
            INSERT INTO funding_airdrops (address, amount_aeko, status)
            VALUES ($1, $2::double precision::numeric, 'processing')
            RETURNING {AIRDROP_COLUMNS}
            "#
        );
        Ok(sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(address)
            .bind(amount_aeko)
            .fetch_one(&self.pool)
            .await?)
    }

    pub async fn set_funding_airdrop_signature(
        &self,
        id: &str,
        signature: &str,
    ) -> Result<FundingAirdropRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_airdrops
            SET
                status = 'submitted',
                signature = $2,
                submitted_at = COALESCE(submitted_at, NOW()),
                error_code = NULL,
                error_message = NULL
            WHERE id = $1::uuid AND status = 'processing'
            RETURNING {AIRDROP_COLUMNS}
            "#
        );
        if let Some(airdrop) = sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(id)
            .bind(signature)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(airdrop);
        }
        let existing = self
            .funding_airdrop(id)
            .await?
            .ok_or(FundingStoreError::AirdropNotFound)?;
        if existing.status == "submitted" && existing.signature.as_deref() == Some(signature) {
            return Ok(existing);
        }
        Err(FundingStoreError::RequestAlreadyDecided {
            status: existing.status,
        })
    }

    pub async fn mark_funding_airdrop_error(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingAirdropRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_airdrops
            SET error_code = $2, error_message = $3
            WHERE id = $1::uuid AND status IN ('processing', 'submitted')
            RETURNING {AIRDROP_COLUMNS}
            "#
        );
        sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::AirdropNotFound)
    }

    pub async fn mark_funding_airdrop_failed(
        &self,
        id: &str,
        code: &str,
        message: &str,
    ) -> Result<FundingAirdropRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_airdrops
            SET status = 'failed', error_code = $2, error_message = $3
            WHERE id = $1::uuid AND status IN ('processing', 'submitted')
            RETURNING {AIRDROP_COLUMNS}
            "#
        );
        sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(id)
            .bind(code)
            .bind(message)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(FundingStoreError::AirdropNotFound)
    }

    pub async fn confirm_funding_airdrop(
        &self,
        id: &str,
    ) -> Result<FundingAirdropRecord, FundingStoreError> {
        let sql = format!(
            r#"
            UPDATE funding_airdrops
            SET
                status = 'confirmed',
                confirmed_at = NOW(),
                error_code = NULL,
                error_message = NULL
            WHERE id = $1::uuid AND status = 'submitted' AND signature IS NOT NULL
            RETURNING {AIRDROP_COLUMNS}
            "#
        );
        if let Some(airdrop) = sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(airdrop);
        }
        let existing = self
            .funding_airdrop(id)
            .await?
            .ok_or(FundingStoreError::AirdropNotFound)?;
        if existing.status == "confirmed" {
            return Ok(existing);
        }
        Err(FundingStoreError::RequestAlreadyDecided {
            status: existing.status,
        })
    }

    pub async fn funding_airdrop(
        &self,
        id: &str,
    ) -> Result<Option<FundingAirdropRecord>, FundingStoreError> {
        let sql = format!("SELECT {AIRDROP_COLUMNS} FROM funding_airdrops WHERE id = $1::uuid");
        Ok(sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn list_funding_airdrops(
        &self,
        limit: i64,
    ) -> Result<Vec<FundingAirdropRecord>, FundingStoreError> {
        let sql = format!(
            r#"
            SELECT {AIRDROP_COLUMNS}
            FROM funding_airdrops
            ORDER BY requested_at DESC
            LIMIT $1
            "#
        );
        Ok(sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn list_submitted_funding_airdrops(
        &self,
        limit: i64,
    ) -> Result<Vec<FundingAirdropRecord>, FundingStoreError> {
        let sql = format!(
            r#"
            SELECT {AIRDROP_COLUMNS}
            FROM funding_airdrops
            WHERE status = 'submitted'
              AND signature IS NOT NULL
            ORDER BY submitted_at ASC NULLS FIRST, requested_at ASC
            LIMIT $1
            "#
        );
        Ok(sqlx::query_as::<_, FundingAirdropRecord>(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    async fn ensure_public_cooldown(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        address: &str,
        cooldown_hours: f64,
    ) -> Result<(), FundingStoreError> {
        let seconds_since_last: Option<f64> = sqlx::query_scalar(
            r#"
            SELECT EXTRACT(EPOCH FROM (NOW() - MAX(granted_at)))::double precision
            FROM funding_grants
            WHERE address = $1 AND source = 'public' AND confirmed = TRUE
            "#,
        )
        .bind(address)
        .fetch_one(&mut **tx)
        .await?;
        if let Some(elapsed) = seconds_since_last {
            let cooldown_seconds = cooldown_hours * 3600.0;
            if elapsed < cooldown_seconds {
                return Err(FundingStoreError::Cooldown {
                    retry_after_seconds: (cooldown_seconds - elapsed).ceil().max(1.0) as u64,
                });
            }
        }
        Ok(())
    }
}

async fn public_spent_today(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<f64, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(amount_aeko), 0)::double precision
        FROM funding_grants
        WHERE source = 'public'
          AND confirmed = TRUE
          AND granted_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        "#,
    )
    .fetch_one(&mut **tx)
    .await
}

async fn public_reserved_today(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<f64, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(amount_aeko), 0)::double precision
        FROM funding_requests
        WHERE source = 'public'
          AND status IN ('processing', 'submitted')
          AND decided_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        "#,
    )
    .fetch_one(&mut **tx)
    .await
}
