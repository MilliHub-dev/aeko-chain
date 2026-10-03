use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::persistence::ledger::{BlockQuery, TransactionQuery},
        models::{
            BlockRecord, TransactionAccountDetailRecord, TransactionDetailRecord, TransactionRecord,
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::signature::Signature,
    anyhow::Context,
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/blocks", get(list_blocks))
        .route("/blocks/:slot", get(get_block))
        .route("/transactions", get(list_transactions))
        .route("/transactions/:signature", get(get_transaction))
}

#[derive(Debug, Deserialize)]
struct BlockParams {
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct TransactionParams {
    before: Option<u64>,
    after: Option<u64>,
    address: Option<String>,
    #[serde(rename = "type")]
    primary_program: Option<String>,
    status: Option<String>,
    limit: Option<usize>,
}

async fn list_blocks(
    State(state): State<SharedState>,
    Query(params): Query<BlockParams>,
) -> ApiResult<Json<DataEnvelope<Vec<BlockRecord>>>> {
    let items = state
        .repository
        .list_blocks(&BlockQuery {
            before: params.before,
            after: params.after,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_block(
    State(state): State<SharedState>,
    Path(slot): Path<u64>,
) -> ApiResult<Json<DataEnvelope<BlockRecord>>> {
    state
        .repository
        .get_block(slot)
        .await?
        .map(|block| response::data(&state.network, block))
        .ok_or(ApiError::NotFound("block"))
}

async fn list_transactions(
    State(state): State<SharedState>,
    Query(params): Query<TransactionParams>,
) -> ApiResult<Json<DataEnvelope<Vec<TransactionRecord>>>> {
    let success = match params.status.as_deref() {
        None => None,
        Some("success" | "confirmed" | "ok") => Some(true),
        Some("failed" | "error") => Some(false),
        Some(value) => {
            return Err(ApiError::BadRequest(format!(
                "unsupported transaction status {value:?}"
            )))
        }
    };
    let items = state
        .repository
        .list_transactions(&TransactionQuery {
            before: params.before,
            after: params.after,
            address: params.address,
            primary_program: params.primary_program,
            success,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_transaction(
    State(state): State<SharedState>,
    Path(signature): Path<String>,
) -> ApiResult<Json<DataEnvelope<TransactionDetailRecord>>> {
    signature
        .parse::<Signature>()
        .map_err(|_| ApiError::BadRequest("invalid AEKO transaction signature".to_string()))?;

    let indexed = state.repository.get_transaction(&signature).await?;
    let commitment = if indexed.is_some() {
        "finalized"
    } else {
        "confirmed"
    };
    let rpc = state.rpc.clone();
    let requested = signature.clone();
    let rpc_detail =
        tokio::task::spawn_blocking(move || rpc.fetch_transaction_detail(&requested, commitment))
        .await
        .context("live transaction detail RPC worker panicked")?;

    match rpc_detail {
        Ok(Some(mut detail)) => {
            if let Some(summary) = indexed.as_ref() {
                // Finalized PostgreSQL remains authoritative for the compact
                // transaction identity/status fields. RPC adds trace detail.
                detail.apply_summary(summary);
            }
            apply_indexed_transaction_context(&state, &mut detail).await?;
            let source = if indexed.is_some() {
                "indexer+rpc-live"
            } else {
                "rpc-live"
            };
            Ok(response::data_from_source(&state.network, detail, source))
        }
        Ok(None) => {
            let Some(summary) = indexed else {
                return Err(ApiError::NotFound("transaction"));
            };
            let mut detail = TransactionDetailRecord::from_summary(summary);
            apply_indexed_transaction_context(&state, &mut detail).await?;
            Ok(response::data(&state.network, detail))
        }
        Err(error) => {
            let Some(summary) = indexed else {
                return Err(error.into());
            };
            tracing::warn!(
                signature = %signature,
                error = %error,
                "live transaction detail enrichment failed; returning finalized indexed detail"
            );
            let mut detail = TransactionDetailRecord::from_summary(summary);
            apply_indexed_transaction_context(&state, &mut detail).await?;
            Ok(response::data(&state.network, detail))
        }
    }
}

async fn apply_indexed_transaction_context(
    state: &SharedState,
    detail: &mut TransactionDetailRecord,
) -> ApiResult<()> {
    if detail.block_time.is_none() {
        detail.block_time = state
            .repository
            .get_block(detail.slot)
            .await?
            .and_then(|block| block.unix_timestamp);
    }

    if detail.accounts.is_empty() {
        let signer = detail.signer.as_deref();
        detail.accounts = state
            .repository
            .list_transaction_accounts(&detail.signature)
            .await?
            .into_iter()
            .map(|account| {
                let is_signer = signer.map(|value| value == account.address.as_str());
                TransactionAccountDetailRecord {
                    index: account.account_index,
                    signer: is_signer,
                    address: account.address,
                    writable: None,
                    source: Some("indexer".to_string()),
                    pre_balance: None,
                    post_balance: None,
                }
            })
            .collect();
    }

    let indexed_transfers = state
        .repository
        .list_transaction_transfers(&detail.signature)
        .await?;
    if !indexed_transfers.is_empty() {
        detail.token_transfers = indexed_transfers;
    }

    Ok(())
}
