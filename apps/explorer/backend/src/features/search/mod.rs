use {
    crate::{
        error::ApiResult,
        features::clamp_limit,
        models::SearchResultRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::Context,
    aeko_sdk::pubkey::Pubkey,
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

    items.retain(|item| !matches!(item, SearchResultRecord::Wallet(_)));

    if query.parse::<Pubkey>().is_ok() {
        let rpc = state.rpc.clone();
        let address = query.clone();
        let account = tokio::task::spawn_blocking(move || rpc.fetch_account(&address))
            .await
            .context("search account RPC worker panicked")??;
        if let Some(account) = account {
            let profile = state
                .repository
                .build_wallet_profile(&account.address, Some(account.lamports))
                .await?;
            items.insert(0, SearchResultRecord::Wallet(profile));
        }
    }
    items.truncate(limit);
    Ok(response::data_from_source(&state.network, items, "rpc+indexer"))
}
