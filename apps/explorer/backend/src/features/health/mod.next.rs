use {
    crate::{
        error::ApiResult,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::Context,
    axum::{
        extract::State,
        http::StatusCode,
        routing::get,
        Json, Router,
    },
    serde::Serialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/", get(liveness))
        .route("/health", get(readiness))
}

async fn liveness(
    State(state): State<SharedState>,
) -> Json<DataEnvelope<serde_json::Value>> {
    response::data_from_source(
        &state.network,
        serde_json::json!({"service": "aeko-explorer-backend", "status": "up"}),
        "process",
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadinessPayload {
    status: &'static str,
    database: &'static str,
    rpc: &'static str,
    latest_chain_slot: u64,
    latest_indexed_slot: Option<u64>,
    index_lag_slots: Option<u64>,
    chain_behind_index: bool,
    latest_asset_slot: Option<u64>,
    asset_lag_slots: Option<u64>,
    chain_behind_assets: bool,
    latest_social_slot: Option<u64>,
    social_lag_slots: Option<u64>,
    chain_behind_social: bool,
    social_required: bool,
    max_ready_lag_slots: u64,
}

async fn readiness(
    State(state): State<SharedState>,
) -> ApiResult<(StatusCode, Json<DataEnvelope<ReadinessPayload>>)> {
    state.repository.ping().await?;
    let latest_indexed_slot = state.repository.latest_indexed_slot().await?;
    let latest_asset_slot = state.repository.latest_projection_slot("assets").await?;
    let latest_social_slot = state.repository.latest_projection_slot("social").await?;

    let rpc = state.rpc.clone();
    let (rpc_ok, latest_chain_slot) = tokio::task::spawn_blocking(move || {
        rpc.health()?;
        let slot = rpc.latest_slot()?;
        Ok::<_, anyhow::Error>((true, slot))
    })
    .await
    .context("readiness RPC worker panicked")??;

    let core = projection_readiness(
        latest_chain_slot,
        latest_indexed_slot,
        state.max_ready_lag_slots,
    );
    let assets = projection_readiness(
        latest_chain_slot,
        latest_asset_slot,
        state.max_ready_lag_slots,
    );
    let social = projection_readiness(
        latest_chain_slot,
        latest_social_slot,
        state.max_ready_lag_slots,
    );

    let ready = rpc_ok
        && core.ready
        && assets.ready
        && (!state.social_enabled || social.ready);
    let payload = ReadinessPayload {
        status: if ready { "ready" } else { "not-ready" },
        database: "ok",
        rpc: "ok",
        latest_chain_slot,
        latest_indexed_slot,
        index_lag_slots: core.lag,
        chain_behind_index: core.chain_behind,
        latest_asset_slot,
        asset_lag_slots: assets.lag,
        chain_behind_assets: assets.chain_behind,
        latest_social_slot,
        social_lag_slots: social.lag,
        chain_behind_social: social.chain_behind,
        social_required: state.social_enabled,
        max_ready_lag_slots: state.max_ready_lag_slots,
    };
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    Ok((status, response::data_from_source(&state.network, payload, "readiness")))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ProjectionReadiness {
    lag: Option<u64>,
    chain_behind: bool,
    ready: bool,
}

fn projection_readiness(
    latest_chain_slot: u64,
    latest_projection_slot: Option<u64>,
    max_ready_lag_slots: u64,
) -> ProjectionReadiness {
    match latest_projection_slot {
        None => ProjectionReadiness {
            lag: None,
            chain_behind: false,
            ready: false,
        },
        Some(slot) if slot > latest_chain_slot => ProjectionReadiness {
            lag: None,
            chain_behind: true,
            ready: false,
        },
        Some(slot) => {
            let lag = latest_chain_slot - slot;
            ProjectionReadiness {
                lag: Some(lag),
                chain_behind: false,
                ready: lag <= max_ready_lag_slots,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::projection_readiness;

    #[test]
    fn missing_projection_is_not_ready() {
        let status = projection_readiness(100, None, 10);
        assert!(!status.ready);
        assert_eq!(status.lag, None);
        assert!(!status.chain_behind);
    }

    #[test]
    fn projection_lag_and_chain_regression_are_fail_closed() {
        let fresh = projection_readiness(100, Some(95), 10);
        assert!(fresh.ready);
        assert_eq!(fresh.lag, Some(5));

        let stale = projection_readiness(100, Some(80), 10);
        assert!(!stale.ready);
        assert_eq!(stale.lag, Some(20));

        let regression = projection_readiness(100, Some(101), 10);
        assert!(!regression.ready);
        assert!(regression.chain_behind);
        assert_eq!(regression.lag, None);
    }
}
