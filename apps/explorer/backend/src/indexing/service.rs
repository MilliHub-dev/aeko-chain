use {
    super::ChainDataSource,
    crate::{
        config::ExplorerBackendConfig,
        infrastructure::{persistence::PostgresRepository, rpc_error::RpcRequestError},
        models::CoreSlotRecord,
    },
    aeko_rpc_client_api::custom_error::{
        JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED, JSON_RPC_SERVER_ERROR_SLOT_SKIPPED,
    },
    anyhow::{bail, Context, Result},
    std::{
        collections::HashMap,
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    },
};

const PROJECTION_FAILURE_WARN_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug)]
struct ProjectionFailure {
    fingerprint: String,
    suppressed: u64,
    last_warn: Instant,
}

#[derive(Default, Debug)]
struct ProjectionFailureTracker {
    failures: HashMap<&'static str, ProjectionFailure>,
}

#[derive(Debug, PartialEq, Eq)]
enum ProjectionFailureLog {
    First,
    Suppressed,
    Repeated { suppressed: u64 },
}

impl ProjectionFailureTracker {
    fn record_failure(
        &mut self,
        stream: &'static str,
        fingerprint: &str,
        now: Instant,
    ) -> ProjectionFailureLog {
        if let Some(existing) = self.failures.get_mut(stream) {
            if existing.fingerprint == fingerprint {
                if now.duration_since(existing.last_warn) < PROJECTION_FAILURE_WARN_INTERVAL {
                    existing.suppressed = existing.suppressed.saturating_add(1);
                    return ProjectionFailureLog::Suppressed;
                }
                let suppressed = existing.suppressed;
                existing.suppressed = 0;
                existing.last_warn = now;
                return ProjectionFailureLog::Repeated { suppressed };
            }
        }

        self.failures.insert(
            stream,
            ProjectionFailure {
                fingerprint: fingerprint.to_string(),
                suppressed: 0,
                last_warn: now,
            },
        );
        ProjectionFailureLog::First
    }

    fn recover(&mut self, stream: &'static str) -> Option<u64> {
        self.failures.remove(stream).map(|state| state.suppressed)
    }
}

#[derive(Clone)]
pub struct IndexerService {
    source: Arc<dyn ChainDataSource>,
    repository: PostgresRepository,
    config: ExplorerBackendConfig,
    projection_failures: Arc<Mutex<ProjectionFailureTracker>>,
}

impl IndexerService {
    pub fn new(
        source: Arc<dyn ChainDataSource>,
        repository: PostgresRepository,
        config: ExplorerBackendConfig,
    ) -> Self {
        Self {
            source,
            repository,
            config,
            projection_failures: Arc::new(Mutex::new(ProjectionFailureTracker::default())),
        }
    }

    pub async fn run(self, interval: Duration) {
        loop {
            if let Err(error) = self.sync_batch().await {
                tracing::error!(
                    error = ?error,
                    "Explorer indexer batch failed; durable cursor remains at the first uncommitted core slot"
                );
            }
            tokio::time::sleep(interval).await;
        }
    }

    pub async fn sync_batch(&self) -> Result<()> {
        let next_slot = self
            .repository
            .next_core_slot(self.config.start_slot)
            .await
            .context("reading durable core cursor")?;
        let source = Arc::clone(&self.source);
        let latest_slot = tokio::task::spawn_blocking(move || source.latest_slot())
            .await
            .context("latest-slot worker panicked")??;
        if core_cursor_is_ahead(next_slot, latest_slot) {
            bail!(
                "durable Explorer cursor next_slot {next_slot} is ahead of finalized chain tip {latest_slot}; refusing a reset or mismatched network"
            );
        }
        if next_slot > latest_slot {
            tracing::debug!(next_slot, latest_slot, "Explorer indexer is caught up");
            return Ok(());
        }

        let batch_span = u64::try_from(self.config.max_batch_size.saturating_sub(1))
            .context("max batch size does not fit u64")?;
        let end_slot = next_slot.saturating_add(batch_span).min(latest_slot);
        tracing::info!(
            next_slot,
            end_slot,
            latest_slot,
            "starting Explorer index batch"
        );

        for slot in next_slot..=end_slot {
            let source = Arc::clone(&self.source);
            let fetched = tokio::task::spawn_blocking(move || source.fetch_core_slot(slot))
                .await
                .with_context(|| format!("core-slot worker panicked at slot {slot}"))?;
            let core = match fetched {
                Ok(record) => record,
                Err(error) if is_proven_skipped_slot(&error) => {
                    let rpc = error.downcast_ref::<RpcRequestError>();
                    tracing::info!(
                        slot,
                        rpc_code = rpc.map(|value| value.code),
                        "advancing durable cursor across RPC-proven skipped slot"
                    );
                    CoreSlotRecord {
                        slot,
                        ..CoreSlotRecord::default()
                    }
                }
                Err(error) => {
                    return Err(error).with_context(|| format!("fetching core slot {slot}"))
                }
            };
            self.repository
                .persist_core_slot(core)
                .await
                .with_context(|| format!("persisting core slot {slot}"))?;

            if self
                .projection_refresh_due("assets", slot, self.config.asset_refresh_slots)
                .await?
            {
                self.refresh_assets(slot).await;
            }
            if self.config.persist_socialfi_views
                && self
                    .projection_refresh_due("social", slot, self.config.social_refresh_slots)
                    .await?
            {
                self.refresh_social(slot).await;
            }
        }
        tracing::info!(next_slot, end_slot, "completed Explorer index batch");
        Ok(())
    }

    async fn projection_refresh_due(
        &self,
        stream: &str,
        trigger_slot: u64,
        cadence: u64,
    ) -> Result<bool> {
        let last = self
            .repository
            .latest_projection_slot(stream)
            .await
            .with_context(|| format!("reading {stream} projection freshness"))?;
        Ok(last.is_none_or(|last| trigger_slot.saturating_sub(last) >= cadence))
    }

    fn record_projection_failure(&self, stream: &'static str, trigger_slot: u64, error: &str) {
        let action = self
            .projection_failures
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .record_failure(stream, error, Instant::now());
        match action {
            ProjectionFailureLog::First => tracing::warn!(
                stream,
                trigger_slot,
                error,
                "projection refresh failed; core cursor remains valid"
            ),
            ProjectionFailureLog::Suppressed => {}
            ProjectionFailureLog::Repeated { suppressed } => tracing::warn!(
                stream,
                trigger_slot,
                suppressed,
                error,
                "projection refresh is still failing; repeated identical failures were suppressed"
            ),
        }
    }

    fn record_projection_recovery(
        &self,
        stream: &'static str,
        trigger_slot: u64,
        snapshot_slot: u64,
    ) {
        let suppressed = self
            .projection_failures
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .recover(stream);
        if let Some(suppressed) = suppressed {
            tracing::info!(
                stream,
                trigger_slot,
                snapshot_slot,
                suppressed,
                "projection refresh recovered"
            );
        }
    }

    async fn refresh_assets(&self, trigger_slot: u64) {
        let source = Arc::clone(&self.source);
        let snapshot = tokio::task::spawn_blocking(move || {
            let snapshot_slot = source
                .latest_slot()
                .context("reading finalized asset snapshot watermark")?;
            source.fetch_asset_snapshot(snapshot_slot)
        })
        .await;
        match snapshot {
            Ok(Ok(snapshot)) => {
                let snapshot_slot = snapshot.slot;
                match self.repository.persist_asset_snapshot(snapshot).await {
                    Ok(()) => {
                        if let Err(error) = self
                            .repository
                            .mark_projection_slot("assets", snapshot_slot)
                            .await
                        {
                            self.record_projection_failure(
                                "assets",
                                trigger_slot,
                                &format!(
                                    "asset data persisted but freshness cursor update failed: {error:#}"
                                ),
                            );
                        } else {
                            self.record_projection_recovery("assets", trigger_slot, snapshot_slot);
                            tracing::info!(trigger_slot, snapshot_slot, "asset snapshot refreshed");
                        }
                    }
                    Err(error) => self.record_projection_failure(
                        "assets",
                        trigger_slot,
                        &format!(
                            "asset snapshot persistence failed at snapshot {snapshot_slot}: {error:#}"
                        ),
                    ),
                }
            }
            Ok(Err(error)) => self.record_projection_failure(
                "assets",
                trigger_slot,
                &format!("asset snapshot RPC refresh failed: {error:#}"),
            ),
            Err(error) => {
                tracing::error!(trigger_slot, error = %error, "asset snapshot worker panicked")
            }
        }
    }

    async fn refresh_social(&self, trigger_slot: u64) {
        let source = Arc::clone(&self.source);
        let snapshot = tokio::task::spawn_blocking(move || {
            let snapshot_slot = source
                .latest_slot()
                .context("reading finalized Social snapshot watermark")?;
            source.fetch_social_snapshot(snapshot_slot)
        })
        .await;

        match snapshot {
            Ok(Ok(snapshot)) => {
                let snapshot_slot = snapshot.slot;
                let snapshot_epoch = snapshot.epoch;
                if let Err(error) = self.repository.persist_social_snapshot(snapshot).await {
                    self.record_projection_failure(
                        "social",
                        trigger_slot,
                        &format!(
                            "canonical Social snapshot persistence failed at snapshot {snapshot_slot} epoch {snapshot_epoch}: {error:#}"
                        ),
                    );
                } else {
                    self.record_projection_recovery("social", trigger_slot, snapshot_slot);
                    tracing::info!(
                        trigger_slot,
                        snapshot_slot,
                        snapshot_epoch,
                        "canonical five-domain Social snapshot refreshed"
                    );
                }
            }
            Ok(Err(error)) => self.record_projection_failure(
                "social",
                trigger_slot,
                &format!("canonical Social snapshot RPC refresh failed: {error:#}"),
            ),
            Err(error) => {
                tracing::error!(trigger_slot, error = %error, "Social snapshot worker panicked")
            }
        }
    }
}

fn core_cursor_is_ahead(next_slot: u64, latest_slot: u64) -> bool {
    latest_slot
        .checked_add(1)
        .is_some_and(|expected_next| next_slot > expected_next)
}

fn is_proven_skipped_slot(error: &anyhow::Error) -> bool {
    error.downcast_ref::<RpcRequestError>().is_some_and(|rpc| {
        rpc.method == "getBlock"
            && matches!(
                rpc.code,
                JSON_RPC_SERVER_ERROR_SLOT_SKIPPED
                    | JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED
            )
    })
}

#[cfg(test)]
mod tests {
    use {
        super::{
            core_cursor_is_ahead, is_proven_skipped_slot, ProjectionFailureLog,
            ProjectionFailureTracker, PROJECTION_FAILURE_WARN_INTERVAL,
        },
        crate::infrastructure::rpc_error::RpcRequestError,
        aeko_rpc_client_api::custom_error::{
            JSON_RPC_SERVER_ERROR_BLOCK_NOT_AVAILABLE,
            JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
            JSON_RPC_SERVER_ERROR_SLOT_SKIPPED,
        },
        anyhow::Error,
    };

    #[test]
    fn typed_skipped_slot_codes_advance_cursor_including_production_incident() {
        let production = Error::new(RpcRequestError::new(
            "getBlock",
            JSON_RPC_SERVER_ERROR_SLOT_SKIPPED,
            "Slot 104369 was skipped, or missing due to ledger jump to recent snapshot",
            None,
        ));
        assert!(is_proven_skipped_slot(&production));
        assert!(is_proven_skipped_slot(&Error::new(RpcRequestError::new(
            "getBlock",
            JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
            "Slot 104369 was skipped, or missing in long-term storage",
            None,
        ))));
        assert!(!is_proven_skipped_slot(&Error::new(RpcRequestError::new(
            "getBlock",
            JSON_RPC_SERVER_ERROR_BLOCK_NOT_AVAILABLE,
            "Block not available",
            None,
        ))));
        assert!(!is_proven_skipped_slot(&Error::new(RpcRequestError::new(
            "getSlot",
            JSON_RPC_SERVER_ERROR_SLOT_SKIPPED,
            "not a getBlock response",
            None,
        ))));
    }

    #[test]
    fn cursor_may_be_exactly_one_past_tip_but_never_further() {
        assert!(!core_cursor_is_ahead(101, 100));
        assert!(!core_cursor_is_ahead(100, 100));
        assert!(core_cursor_is_ahead(102, 100));
    }
    #[test]
    fn repeated_projection_failures_are_suppressed_until_interval_and_recovery_resets_state() {
        let mut tracker = ProjectionFailureTracker::default();
        let now = std::time::Instant::now();

        assert_eq!(
            tracker.record_failure("social", "missing canonical state", now),
            ProjectionFailureLog::First
        );
        assert_eq!(
            tracker.record_failure(
                "social",
                "missing canonical state",
                now + std::time::Duration::from_secs(1)
            ),
            ProjectionFailureLog::Suppressed
        );
        assert_eq!(
            tracker.record_failure(
                "social",
                "missing canonical state",
                now + PROJECTION_FAILURE_WARN_INTERVAL
            ),
            ProjectionFailureLog::Repeated { suppressed: 1 }
        );
        assert_eq!(tracker.recover("social"), Some(0));
        assert_eq!(tracker.recover("social"), None);
    }

    #[test]
    fn a_changed_projection_failure_fingerprint_warns_immediately() {
        let mut tracker = ProjectionFailureTracker::default();
        let now = std::time::Instant::now();
        assert_eq!(
            tracker.record_failure("social", "missing state", now),
            ProjectionFailureLog::First
        );
        assert_eq!(
            tracker.record_failure(
                "social",
                "rpc unavailable",
                now + std::time::Duration::from_secs(1)
            ),
            ProjectionFailureLog::First
        );
    }
}
