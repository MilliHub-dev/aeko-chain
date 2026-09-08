use {
    super::ChainDataSource,
    crate::{
        config::ExplorerBackendConfig,
        infrastructure::persistence::PostgresRepository,
        models::CoreSlotRecord,
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
                tracing::error!(error = ?error, "Explorer indexer batch failed; durable cursor remains at the first uncommitted core slot");
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
                "durable Explorer cursor next_slot {next_slot} is ahead of finalized chain tip {latest_slot}; refusing to serve stale history from a reset or mismatched network"
            );
        }
        if next_slot > latest_slot {
            return Ok(());
        }

        let batch_span = u64::try_from(self.config.max_batch_size.saturating_sub(1))
            .context("max batch size does not fit u64")?;
        let end_slot = next_slot.saturating_add(batch_span).min(latest_slot);
        for slot in next_slot..=end_slot {
            let source = Arc::clone(&self.source);
            let fetched = tokio::task::spawn_blocking(move || source.fetch_core_slot(slot))
                .await
                .with_context(|| format!("core-slot worker panicked at slot {slot}"))?;
            let core = match fetched {
                Ok(record) => record,
                Err(error) if is_proven_skipped_slot(&error) => {
                    tracing::info!(slot, error = %error, "advancing durable cursor across RPC-proven skipped slot");
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

            if slot % self.config.asset_refresh_slots == 0 {
                self.refresh_assets(slot).await;
            }
            if self.config.persist_socialfi_views && slot % self.config.social_refresh_slots == 0 {
                self.refresh_social(slot).await;
            }
        }
        Ok(())
    }

    async fn refresh_assets(&self, trigger_slot: u64) {
        let source = Arc::clone(&self.source);
        let snapshot = tokio::task::spawn_blocking(move || {
            // Asset RPC scans return current finalized state, not historical
            // state for the core slot that happened to trigger the refresh.
            // Read a current finalized watermark first so cursor rewinds never
            // regress last_seen_slot or keep stale holdings alive.
            let snapshot_slot = source
                .latest_slot()
                .context("reading finalized asset snapshot watermark")?;
            source.fetch_asset_snapshot(snapshot_slot)
        })
        .await;
        match snapshot {
            Ok(Ok(snapshot)) => {
                let snapshot_slot = snapshot.slot;
                if let Err(error) = self.repository.persist_asset_snapshot(snapshot).await {
                    tracing::warn!(trigger_slot, snapshot_slot, error = ?error, "asset snapshot persistence failed; core cursor remains valid");
                }
            }
            Ok(Err(error)) => tracing::warn!(trigger_slot, error = ?error, "asset snapshot RPC refresh failed; core cursor remains valid"),
            Err(error) => tracing::error!(trigger_slot, error = %error, "asset snapshot worker panicked"),
        }
    }

    async fn refresh_social(&self, slot: u64) {
        let source = Arc::clone(&self.source);
        let projection = tokio::task::spawn_blocking(move || {
            Ok::<_, anyhow::Error>((
                source.fetch_social_posts()?,
                source.fetch_creator_rewards()?,
                source.fetch_engagement_events()?,
                source.fetch_social_stakes()?,
            ))
        })
        .await;

        let (posts, rewards, engagement, stakes) = match projection {
            Ok(Ok(values)) => values,
            Ok(Err(error)) => {
                tracing::warn!(slot, error = ?error, "canonical SocialFi refresh failed; core cursor remains valid");
                return;
            }
            Err(error) => {
                tracing::error!(slot, error = %error, "SocialFi refresh worker panicked");
                return;
            }
        };

        if let Err(error) = self.repository.persist_social_posts(posts).await {
            tracing::warn!(slot, error = ?error, "social-post projection persistence failed");
        }
        if let Err(error) = self.repository.persist_creator_rewards(rewards).await {
            tracing::warn!(slot, error = ?error, "creator-reward projection persistence failed");
        }
        if let Err(error) = self.repository.persist_engagement_events(engagement).await {
            tracing::warn!(slot, error = ?error, "engagement projection persistence failed");
        }
        if let Err(error) = self.repository.persist_social_stakes(stakes).await {
            tracing::warn!(slot, error = ?error, "social-stake projection persistence failed");
        }
    }
}

fn core_cursor_is_ahead(next_slot: u64, latest_slot: u64) -> bool {
    latest_slot
        .checked_add(1)
        .is_some_and(|expected_next| next_slot > expected_next)
}

fn is_proven_skipped_slot(error: &anyhow::Error) -> bool {
    let message = error.to_string();
    // AEKO rpc-client-api reserves -32007 for SlotSkipped and -32009 for
    // LongTermStorageSlotSkipped. Those responses prove there is no block to
    // index. Other availability/history errors are retried and never advance
    // the cursor.
    message.contains("RPC getBlock failed (-32007)")
        || message.contains("RPC getBlock failed (-32009)")
}

#[cfg(test)]
mod tests {
    use super::{core_cursor_is_ahead, is_proven_skipped_slot};

    #[test]
    fn only_explicit_skipped_slot_rpc_codes_advance_cursor() {
        assert!(is_proven_skipped_slot(&anyhow::anyhow!(
            "RPC getBlock failed (-32007): Slot skipped"
        )));
        assert!(is_proven_skipped_slot(&anyhow::anyhow!(
            "RPC getBlock failed (-32009): long-term storage slot skipped"
        )));
        assert!(!is_proven_skipped_slot(&anyhow::anyhow!(
            "RPC getBlock failed (-32004): block not available"
        )));
    }

    #[test]
    fn cursor_may_be_exactly_one_past_tip_but_never_further() {
        assert!(!core_cursor_is_ahead(101, 100));
        assert!(!core_cursor_is_ahead(100, 100));
        assert!(core_cursor_is_ahead(102, 100));
    }
}
