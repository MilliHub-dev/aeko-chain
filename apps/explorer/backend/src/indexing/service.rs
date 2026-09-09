use {
    super::ChainDataSource,
    crate::{
        config::ExplorerBackendConfig,
        infrastructure::{persistence::PostgresRepository, rpc_error::RpcRequestError},
        models::CoreSlotRecord,
    },
    aeko_rpc_client_api::custom_error::{
        JSON_RPC_SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
        JSON_RPC_SERVER_ERROR_SLOT_SKIPPED,
    },
    anyhow::{bail, Context, Result},
    std::{sync::Arc, time::Duration},
};

#[derive(Clone)]
pub struct IndexerService {
    source: Arc<dyn ChainDataSource>,
    repository: PostgresRepository,
    config: ExplorerBackendConfig,
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
        tracing::info!(next_slot, end_slot, latest_slot, "starting Explorer index batch");

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
                Err(error) => return Err(error).with_context(|| format!("fetching core slot {slot}")),
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
        Ok(last.map_or(true, |last| trigger_slot.saturating_sub(last) >= cadence))
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
                            tracing::warn!(
                                trigger_slot,
                                snapshot_slot,
                                error = ?error,
                                "asset data persisted but freshness cursor update failed"
                            );
                        } else {
                            tracing::info!(trigger_slot, snapshot_slot, "asset snapshot refreshed");
                        }
                    }
                    Err(error) => tracing::warn!(
                        trigger_slot,
                        snapshot_slot,
                        error = ?error,
                        "asset snapshot persistence failed; core cursor remains valid"
                    ),
                }
            }
            Ok(Err(error)) => tracing::warn!(
                trigger_slot,
                error = ?error,
                "asset snapshot RPC refresh failed; core cursor remains valid"
            ),
            Err(error) => tracing::error!(trigger_slot, error = %error, "asset snapshot worker panicked"),
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
                    tracing::warn!(
                        trigger_slot,
                        snapshot_slot,
                        snapshot_epoch,
                        error = ?error,
                        "canonical Social snapshot persistence failed; core cursor remains valid"
                    );
                } else {
                    tracing::info!(
                        trigger_slot,
                        snapshot_slot,
                        snapshot_epoch,
                        "canonical five-domain Social snapshot refreshed"
                    );
                }
            }
            Ok(Err(error)) => tracing::warn!(
                trigger_slot,
                error = ?error,
                "canonical Social snapshot RPC refresh failed; core cursor remains valid"
            ),
            Err(error) => tracing::error!(trigger_slot, error = %error, "Social snapshot worker panicked"),
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
        super::{core_cursor_is_ahead, is_proven_skipped_slot},
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
}
