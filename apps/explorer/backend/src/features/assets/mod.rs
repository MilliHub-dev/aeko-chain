use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::persistence::assets::{NftQuery, TokenTransferQuery},
        models::{CollectionSummaryRecord, NftRecord, TokenSummaryRecord, TokenTransferRecord},
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/tokens/transfers", get(list_token_transfers))
        .route("/tokens/:mint", get(get_token))
        .route("/nfts", get(list_nfts))
        .route("/nfts/:token_id", get(get_nft))
        .route("/collections/:collection_id", get(get_collection))
}

#[derive(Debug, Deserialize)]
struct TransferParams {
    mint: Option<String>,
    address: Option<String>,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct NftParams {
    collection: Option<String>,
    owner: Option<String>,
    creator: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct LimitParams {
    limit: Option<usize>,
}

async fn list_token_transfers(
    State(state): State<SharedState>,
    Query(params): Query<TransferParams>,
) -> ApiResult<Json<DataEnvelope<Vec<TokenTransferRecord>>>> {
    let items = state
        .repository
        .list_token_transfers(&TokenTransferQuery {
            mint: params.mint,
            address: params.address,
            before: params.before,
            after: params.after,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_token(
    State(state): State<SharedState>,
    Path(mint): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<TokenSummaryRecord>>> {
    state
        .repository
        .get_token_summary(&mint, clamp_limit(params.limit))
        .await?
        .map(|token| response::data(&state.network, token))
        .ok_or(ApiError::NotFound("token"))
}

async fn list_nfts(
    State(state): State<SharedState>,
    Query(params): Query<NftParams>,
) -> ApiResult<Json<DataEnvelope<Vec<NftRecord>>>> {
    let items = state
        .repository
        .list_nfts(&NftQuery {
            collection: params.collection,
            owner: params.owner,
            creator: params.creator,
            limit: clamp_limit(params.limit),
        })
        .await?;
    Ok(response::data(&state.network, items))
}

async fn get_nft(
    State(state): State<SharedState>,
    Path(token_id): Path<String>,
) -> ApiResult<Json<DataEnvelope<NftRecord>>> {
    state
        .repository
        .get_nft(&token_id)
        .await?
        .map(|nft| response::data(&state.network, nft))
        .ok_or(ApiError::NotFound("nft"))
}

async fn get_collection(
    State(state): State<SharedState>,
    Path(collection_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> ApiResult<Json<DataEnvelope<CollectionSummaryRecord>>> {
    state
        .repository
        .get_collection_summary(&collection_id, clamp_limit(params.limit))
        .await?
        .map(|collection| response::data(&state.network, collection))
        .ok_or(ApiError::NotFound("collection"))
}
