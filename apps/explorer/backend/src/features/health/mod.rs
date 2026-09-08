use {
    crate::{response, state::SharedState},
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
    lag_slots: Option<u64>,
    chain_behind_indexer: bool,
    max_ready_lag_slots: u64,
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/", get(liveness))
        .route("/health", get(readiness))
}

async fn liveness(
    State(state): State<SharedState>,
) -> Json<response::DataEnvelope<serde_json::Value>> {
    response::data_from_source(&state.network, json!({ "ok": true }), "process")
}

async fn readiness(State(state): State<SharedState>) -> Response {
    let database_result = state.repository.ping().await;
    if let Err(error) = &database_result {
        tracing::warn!(error = ?error, "readiness PostgreSQL check failed");
    }

    let latest_indexed_slot = if database_result.is_ok() {
        match state.repository.latest_indexed_slot().await {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(error = ?error, "readiness cursor check failed");
                None
            }
        }
    } else {
        None
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

    let chain_behind_indexer = latest_chain_slot
        .zip(latest_indexed_slot)
        .is_some_and(|(chain, indexed)| chain < indexed);
    if chain_behind_indexer {
        tracing::error!(
            latest_chain_slot = ?latest_chain_slot,
            latest_indexed_slot = ?latest_indexed_slot,
            "readiness rejected because validator chain is behind durable Explorer history"
        );
    }
    let lag_slots = readiness_lag(latest_chain_slot, latest_indexed_slot);
    let ready = database_result.is_ok()
        && latest_chain_slot.is_some()
        && latest_indexed_slot.is_some()
        && !chain_behind_indexer
        && lag_slots.is_some_and(|lag| lag <= state.max_ready_lag_slots);
    let status = ReadinessStatus {
        ok: ready,
        database: if database_result.is_ok() { "ready" } else { "unavailable" },
        rpc: if latest_chain_slot.is_some() { "ready" } else { "unavailable" },
        latest_chain_slot,
        latest_indexed_slot,
        lag_slots,
        chain_behind_indexer,
        max_ready_lag_slots: state.max_ready_lag_slots,
    };
    let body = response::data_from_source(&state.network, status, "readiness");
    (
        if ready { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE },
        body,
    )
        .into_response()
}

fn readiness_lag(latest_chain_slot: Option<u64>, latest_indexed_slot: Option<u64>) -> Option<u64> {
    latest_chain_slot
        .zip(latest_indexed_slot)
        .and_then(|(chain, indexed)| chain.checked_sub(indexed))
}

#[cfg(test)]
mod tests {
    use super::readiness_lag;

    #[test]
    fn readiness_lag_rejects_a_chain_behind_the_indexer() {
        assert_eq!(readiness_lag(Some(99), Some(100)), None);
        assert_eq!(readiness_lag(Some(100), Some(100)), Some(0));
        assert_eq!(readiness_lag(Some(105), Some(100)), Some(5));
    }
}
