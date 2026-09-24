use {
    crate::{
        error::ApiResult,
        features::clamp_limit,
        models::SearchResultRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::{pubkey::Pubkey, signature::Signature},
    axum::{
        extract::{Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new().route("/search", get(search))
}

#[derive(Debug, Deserialize)]
struct SearchParams {
    #[serde(rename = "q")]
    query: String,
    limit: Option<usize>,
}

async fn search(
    State(state): State<SharedState>,
    Query(params): Query<SearchParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SearchResultRecord>>>> {
    let limit = clamp_limit(params.limit);
    let query = params.query.trim().to_string();
    let mut items = state.repository.search(&query, limit).await?;
    let mut used_rpc = false;

    let has_exact_transaction = items.iter().any(|item| {
        matches!(
            item,
            SearchResultRecord::Transaction(transaction) if transaction.signature == query
        )
    });

    if !has_exact_transaction && query.parse::<Signature>().is_ok() {
        let rpc = state.rpc.clone();
        let signature = query.clone();
        match tokio::task::spawn_blocking(move || rpc.fetch_transaction(&signature)).await {
            Ok(Ok(Some(transaction))) => {
                items.insert(0, SearchResultRecord::Transaction(transaction));
                used_rpc = true;
            }
            Ok(Ok(None)) => {}
            Ok(Err(error)) => {
                tracing::warn!(
                    signature = %query,
                    error = %error,
                    "live transaction search fallback failed; returning indexed matches"
                );
            }
            Err(error) => {
                tracing::error!(
                    signature = %query,
                    error = %error,
                    "live transaction search worker panicked; returning indexed matches"
                );
            }
        }
    }

    if query.parse::<Pubkey>().is_ok() {
        let rpc = state.rpc.clone();
        let address = query.clone();
        match tokio::task::spawn_blocking(move || rpc.fetch_account(&address)).await {
            Ok(Ok(Some(account))) => {
                let profile = state
                    .repository
                    .build_wallet_profile(&account.address, Some(account.lamports))
                    .await?;
                items.retain(|item| {
                    !matches!(
                        item,
                        SearchResultRecord::Wallet(existing)
                            if existing.address == profile.address
                    )
                });
                items.insert(0, SearchResultRecord::Wallet(profile));
                used_rpc = true;
            }
            Ok(Ok(None)) => {}
            Ok(Err(error)) => {
                tracing::warn!(
                    address = %query,
                    error = %error,
                    "live account search fallback failed; returning indexed matches"
                );
            }
            Err(error) => {
                tracing::error!(
                    address = %query,
                    error = %error,
                    "live account search worker panicked; returning indexed matches"
                );
            }
        }
    }

    items.truncate(limit);
    let source = if used_rpc { "rpc+indexer" } else { "indexer" };
    Ok(response::data_from_source(&state.network, items, source))
}
