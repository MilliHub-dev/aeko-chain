use {
    crate::{
        error::ApiResult,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::State,
        http::StatusCode,
        response::{IntoResponse, Response},
        routing::get,
        Json, Router,
    },
    serde::Serialize,
    serde_json::json,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadinessStatus {
    ok: bool,
    database: &'static str,
    rpc: &'static str,
    latest_chain_slot: Option<u64>,
    latest_indexed_slot: Option<u64>,
    index_lag_slots: Option<u64>,
    chain_behind_indexer: bool,
    latest_asset_slot: Option<u64>,
    asset_lag_slots: Option<u64>,
    chain_behind_assets: bool,
    latest_social_slot: Option<u64>,
    social_lag_slots: Option<u64>,
    chain_behind_social: bool,
    social_required: bool,
    max_ready_lag_slots: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplorerOverviewStatus {
    rpc_available: bool,
    latest_chain_slot: Option<u64>,
    latest_indexed_slot: Option<u64>,
    index_lag_slots: Option<u64>,
    latest_asset_slot: Option<u64>,
    asset_lag_slots: Option<u64>,
    latest_social_slot: Option<u64>,
    social_lag_slots: Option<u64>,
    indexed_blocks: u64,
    indexed_transactions: u64,
    indexed_tokens: u64,
    indexed_nfts: u64,
    indexed_posts: u64,
    indexed_stakes: u64,
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/", get(liveness))
        .route("/health", get(readiness))
        .route("/overview", get(overview))
}

async fn liveness(
    State(state): State<SharedState>,
) -> Json<response::DataEnvelope<serde_json::Value>> {
    response::data_from_source(
        &state.network,
        json!({
            "ok": true,
            "network": &state.network,
            "genesisHash": &state.genesis_hash,
        }),
        "process",
    )
}

async fn overview(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<ExplorerOverviewStatus>>> {
    let counts = state.repository.explorer_overview_counts().await?;
    let latest_indexed_slot = state.repository.latest_indexed_slot().await?;
    let latest_asset_slot = state.repository.latest_projection_slot("assets").await?;
    let latest_social_slot = state.repository.latest_projection_slot("social").await?;

    let rpc = state.rpc.clone();
    let latest_chain_slot = match tokio::task::spawn_blocking(move || {
        rpc.health()?;
        rpc.latest_slot()
    })
    .await
    {
        Ok(Ok(slot)) => Some(slot),
        Ok(Err(error)) => {
            tracing::warn!(error = ?error, "Explorer overview validator RPC check failed");
            None
        }
        Err(error) => {
            tracing::error!(error = %error, "Explorer overview validator RPC worker panicked");
            None
        }
    };

    let core = projection_readiness(latest_chain_slot, latest_indexed_slot, state.max_ready_lag_slots);
    let assets = projection_readiness(latest_chain_slot, latest_asset_slot, state.max_ready_lag_slots);
    let social = projection_readiness(latest_chain_slot, latest_social_slot, state.max_ready_lag_slots);
    let source = if latest_chain_slot.is_some() {
        "rpc+indexer"
    } else {
        "indexer-degraded"
    };

    Ok(response::data_from_source(
        &state.network,
        ExplorerOverviewStatus {
            rpc_available: latest_chain_slot.is_some(),
            latest_chain_slot,
            latest_indexed_slot,
            index_lag_slots: core.lag,
            latest_asset_slot,
            asset_lag_slots: assets.lag,
            latest_social_slot,
            social_lag_slots: social.lag,
            indexed_blocks: counts.indexed_blocks,
            indexed_transactions: counts.indexed_transactions,
            indexed_tokens: counts.indexed_tokens,
            indexed_nfts: counts.indexed_nfts,
            indexed_posts: counts.indexed_posts,
            indexed_stakes: counts.indexed_stakes,
        },
        source,
    ))
}

async fn readiness(State(state): State<SharedState>) -> Response {
    let database_result = state.repository.ping().await;
    if let Err(error) = &database_result {
        tracing::warn!(error = ?error, "readiness PostgreSQL check failed");
    }

    let (latest_indexed_slot, latest_asset_slot, latest_social_slot) = if database_result.is_ok() {
        let core = state.repository.latest_indexed_slot().await;
        let assets = state.repository.latest_projection_slot("assets").await;
        let social = state.repository.latest_projection_slot("social").await;
        (
            log_cursor_result("core", core),
            log_cursor_result("assets", assets),
            log_cursor_result("social", social),
        )
    } else {
        (None, None, None)
    };

    let rpc = state.rpc.clone();
    let rpc_result = tokio::task::spawn_blocking(move || {
        rpc.health()?;
        rpc.latest_slot()
    })
    .await;
    let latest_chain_slot = match rpc_result {
        Ok(Ok(slot)) => Some(slot),
        Ok(Err(error)) => {
            tracing::warn!(error = ?error, "readiness validator RPC check failed");
            None
        }
        Err(error) => {
            tracing::error!(error = %error, "readiness validator RPC worker panicked");
            None
        }
    };

    let core = projection_readiness(latest_chain_slot, latest_indexed_slot, state.max_ready_lag_slots);
    let assets = projection_readiness(latest_chain_slot, latest_asset_slot, state.max_ready_lag_slots);
    let social = projection_readiness(latest_chain_slot, latest_social_slot, state.max_ready_lag_slots);

    let ready = database_result.is_ok()
        && latest_chain_slot.is_some()
        && core.ready
        && assets.ready
        && (!state.social_enabled || social.ready);
    let status = ReadinessStatus {
        ok: ready,
        database: if database_result.is_ok() { "ready" } else { "unavailable" },
        rpc: if latest_chain_slot.is_some() { "ready" } else { "unavailable" },
        latest_chain_slot,
        latest_indexed_slot,
        index_lag_slots: core.lag,
        chain_behind_indexer: core.chain_behind,
        latest_asset_slot,
        asset_lag_slots: assets.lag,
        chain_behind_assets: assets.chain_behind,
        latest_social_slot,
        social_lag_slots: social.lag,
        chain_behind_social: social.chain_behind,
        social_required: state.social_enabled,
        max_ready_lag_slots: state.max_ready_lag_slots,
    };
    let body = response::data_from_source(&state.network, status, "readiness");
    (
        if ready { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE },
        body,
    )
        .into_response()
}

fn log_cursor_result(stream: &str, result: anyhow::Result<Option<u64>>) -> Option<u64> {
    match result {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(stream, error = ?error, "readiness projection cursor check failed");
            None
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ProjectionReadiness {
    lag: Option<u64>,
    chain_behind: bool,
    ready: bool,
}

fn projection_readiness(
    latest_chain_slot: Option<u64>,
    latest_projection_slot: Option<u64>,
    max_ready_lag_slots: u64,
) -> ProjectionReadiness {
    match (latest_chain_slot, latest_projection_slot) {
        (Some(chain), Some(projection)) if projection > chain => ProjectionReadiness {
            lag: None,
            chain_behind: true,
            ready: false,
        },
        (Some(chain), Some(projection)) => {
            let lag = chain - projection;
            ProjectionReadiness {
                lag: Some(lag),
                chain_behind: false,
                ready: lag <= max_ready_lag_slots,
            }
        }
        _ => ProjectionReadiness {
            lag: None,
            chain_behind: false,
            ready: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::projection_readiness;

    #[test]
    fn projection_readiness_fails_closed_for_missing_stale_and_regressed_state() {
        assert!(!projection_readiness(Some(100), None, 10).ready);
        let fresh = projection_readiness(Some(100), Some(95), 10);
        assert!(fresh.ready);
        assert_eq!(fresh.lag, Some(5));
        let stale = projection_readiness(Some(100), Some(80), 10);
        assert!(!stale.ready);
        assert_eq!(stale.lag, Some(20));
        let regression = projection_readiness(Some(100), Some(101), 10);
        assert!(!regression.ready);
        assert!(regression.chain_behind);
    }
}
