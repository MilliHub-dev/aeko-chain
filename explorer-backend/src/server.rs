use {
    crate::{api::ExplorerReadStore, ExplorerApiService},
    anyhow::Result,
    hyper::{
        body::Body,
        header::CONTENT_TYPE,
        service::{make_service_fn, service_fn},
        Method, Request, Response, Server, StatusCode,
    },
    serde::Serialize,
    serde_json::{json, Value},
    std::{collections::HashMap, convert::Infallible, net::SocketAddr, sync::Arc},
    url::form_urlencoded,
};

pub async fn serve_explorer_api<S>(
    store: S,
    bind_addr: SocketAddr,
    network: impl Into<String>,
) -> Result<()>
where
    S: ExplorerReadStore + Send + Sync + 'static,
{
    let state = Arc::new(HttpServerState {
        api: ExplorerApiService::new(store),
        network: network.into(),
    });

    let make_service = make_service_fn(move |_| {
        let state = Arc::clone(&state);
        async move {
            Ok::<_, Infallible>(service_fn(move |request| {
                let state = Arc::clone(&state);
                async move { handle_request(state, request).await }
            }))
        }
    });

    Server::bind(&bind_addr).serve(make_service).await?;
    Ok(())
}

struct HttpServerState<S> {
    api: ExplorerApiService<S>,
    network: String,
}

async fn handle_request<S>(
    state: Arc<HttpServerState<S>>,
    request: Request<Body>,
) -> Result<Response<Body>, Infallible>
where
    S: ExplorerReadStore + Send + Sync + 'static,
{
    let response = route_request(&state, request).unwrap_or_else(error_response);
    Ok(response)
}

fn route_request<S>(state: &HttpServerState<S>, request: Request<Body>) -> Result<Response<Body>>
where
    S: ExplorerReadStore + Send + Sync + 'static,
{
    let method = request.method().clone();
    let path = request.uri().path().trim_end_matches('/').to_string();
    let query = parse_query(request.uri().query());

    match (method, path.as_str()) {
        (Method::GET, "") | (Method::GET, "/") | (Method::GET, "/health") => {
            Ok(json_response(StatusCode::OK, json!({
                "data": { "ok": true },
                "meta": base_meta(&state.network),
            })))
        }
        (Method::GET, "/blocks") => Ok(data_response(
            &state.network,
            filter_blocks(
                state.api.list_blocks(query_limit(&query, 100))?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/transactions") => Ok(data_response(
            &state.network,
            filter_transactions(
                state.api.list_transactions(query_limit(&query, 100))?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/tokens/transfers") => Ok(data_response(
            &state.network,
            filter_token_transfers(
                state
                    .api
                    .list_token_transfers(query.get("mint").map(String::as_str), query_limit(&query, 100))?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/nfts") => Ok(data_response(
            &state.network,
            filter_nfts(
                state
                    .api
                    .list_nfts(query.get("collection").map(String::as_str), query_limit(&query, 100))?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/posts") => Ok(data_response(
            &state.network,
            filter_posts(
                state
                    .api
                    .list_posts(query.get("creator").map(String::as_str), query_limit(&query, 100))?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/engagement") => Ok(data_response(
            &state.network,
            filter_engagement_events(
                state.api.list_engagement_events(
                    query.get("creator").map(String::as_str),
                    query_limit(&query, 100),
                )?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/stakes") => Ok(data_response(
            &state.network,
            filter_social_stakes(
                state.api.list_social_stakes(
                    query.get("wallet").map(String::as_str),
                    query_limit(&query, 100),
                )?,
                &query,
                query_limit(&query, 25),
            ),
        )),
        (Method::GET, "/search") => {
            let query_text = query.get("q").map(String::as_str).unwrap_or_default();
            Ok(data_response(
                &state.network,
                json!({ "matches": state.api.search(query_text, query_limit(&query, 25))? }),
            ))
        }
        _ if request.uri().path().starts_with("/transactions/") && request.method() == Method::GET => {
            let signature = request.uri().path().trim_start_matches("/transactions/");
            match state.api.get_transaction(signature)? {
                Some(transaction) => Ok(data_response(&state.network, transaction)),
                None => Ok(not_found_response("transaction not found")),
            }
        }
        _ if request.uri().path().starts_with("/blocks/") && request.method() == Method::GET => {
            let slot = request
                .uri()
                .path()
                .trim_start_matches("/blocks/")
                .parse::<u64>()
                .ok();
            match slot {
                Some(slot) => match state.api.get_block(slot)? {
                    Some(block) => Ok(data_response(&state.network, block)),
                    None => Ok(not_found_response("block not found")),
                },
                None => Ok(bad_request_response("invalid block slot")),
            }
        }
        _ if request.uri().path().starts_with("/nfts/") && request.method() == Method::GET => {
            let token_id = request.uri().path().trim_start_matches("/nfts/");
            match state.api.get_nft(token_id)? {
                Some(nft) => Ok(data_response(&state.network, nft)),
                None => Ok(not_found_response("nft not found")),
            }
        }
        _ if request.uri().path().starts_with("/collections/") && request.method() == Method::GET => {
            let collection_id = request.uri().path().trim_start_matches("/collections/");
            match state
                .api
                .get_collection_summary(collection_id, query_limit(&query, 50))?
            {
                Some(collection) => Ok(data_response(&state.network, collection)),
                None => Ok(not_found_response("collection not found")),
            }
        }
        _ if request.uri().path().starts_with("/tokens/") && request.method() == Method::GET => {
            let mint = request.uri().path().trim_start_matches("/tokens/");
            match state.api.get_token_summary(mint, query_limit(&query, 25))? {
                Some(token) => Ok(data_response(&state.network, token)),
                None => Ok(not_found_response("token not found")),
            }
        }
        _ if request.uri().path().starts_with("/posts/") && request.method() == Method::GET => {
            let post_id = request.uri().path().trim_start_matches("/posts/");
            match state.api.get_post(post_id)? {
                Some(post) => Ok(data_response(&state.network, post)),
                None => Ok(not_found_response("post not found")),
            }
        }
        _ if request.uri().path().starts_with("/creators/") && request.method() == Method::GET => {
            route_creator_request(state, request.uri().path(), &query)
        }
        _ if request.uri().path().starts_with("/accounts/") && request.method() == Method::GET => {
            let address = request.uri().path().trim_start_matches("/accounts/");
            match state
                .api
                .get_account_detail(address, query_limit(&query, 10))?
            {
                Some(profile) => Ok(data_response(&state.network, profile)),
                None => Ok(not_found_response("account profile not found")),
            }
        }
        _ => Ok(not_found_response("endpoint not found")),
    }
}

fn route_creator_request<S>(
    state: &HttpServerState<S>,
    path: &str,
    query: &HashMap<String, String>,
) -> Result<Response<Body>>
where
    S: ExplorerReadStore + Send + Sync + 'static,
{
    let trimmed = path.trim_start_matches("/creators/");
    if let Some(address) = trimmed.strip_suffix("/rewards") {
        return Ok(data_response(
            &state.network,
            state.api.list_creator_rewards(Some(address), 100)?,
        ));
    }
    if let Some(address) = trimmed.strip_suffix("/stake") {
        return Ok(data_response(
            &state.network,
            state.api.list_social_stakes(Some(address), 100)?,
        ));
    }

    match state
        .api
        .get_creator_profile(trimmed, query_limit(query, 10))?
    {
        Some(profile) => Ok(data_response(&state.network, profile)),
        None => Ok(not_found_response("creator profile not found")),
    }
}

fn parse_query(query: Option<&str>) -> HashMap<String, String> {
    query
        .map(|value| form_urlencoded::parse(value.as_bytes()).into_owned().collect())
        .unwrap_or_default()
}

fn query_limit(query: &HashMap<String, String>, default: usize) -> usize {
    query
        .get("limit")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
}

fn query_u64(query: &HashMap<String, String>, key: &str) -> Option<u64> {
    query.get(key).and_then(|value| value.parse::<u64>().ok())
}

fn filter_blocks(
    mut items: Vec<crate::models::BlockRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::BlockRecord> {
    if let Some(before) = query_u64(query, "before") {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = query_u64(query, "after") {
        items.retain(|item| item.slot > after);
    }
    items.truncate(limit);
    items
}

fn filter_transactions(
    mut items: Vec<crate::models::TransactionRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::TransactionRecord> {
    if let Some(before) = query_u64(query, "before") {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = query_u64(query, "after") {
        items.retain(|item| item.slot > after);
    }
    if let Some(address) = query.get("address") {
        items.retain(|item| item.signer.as_deref() == Some(address));
    }
    if let Some(kind) = query.get("type") {
        items.retain(|item| item.primary_program.as_deref() == Some(kind));
    }
    if let Some(status) = query.get("status") {
        let want_success = matches!(status.as_str(), "success" | "confirmed" | "ok");
        let want_failed = matches!(status.as_str(), "failed" | "error");
        if want_success || want_failed {
            items.retain(|item| item.success == want_success);
        }
    }
    items.truncate(limit);
    items
}

fn filter_token_transfers(
    mut items: Vec<crate::models::TokenTransferRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::TokenTransferRecord> {
    if let Some(address) = query.get("address") {
        items.retain(|item| item.source == *address || item.destination == *address);
    }
    if let Some(before) = query_u64(query, "before") {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = query_u64(query, "after") {
        items.retain(|item| item.slot > after);
    }
    items.truncate(limit);
    items
}

fn filter_nfts(
    mut items: Vec<crate::models::NftRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::NftRecord> {
    if let Some(owner) = query.get("owner") {
        items.retain(|item| item.owner == *owner);
    }
    if let Some(creator) = query.get("creator") {
        items.retain(|item| item.creator == *creator);
    }
    items.truncate(limit);
    items
}

fn filter_posts(
    mut items: Vec<crate::models::SocialPostRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::SocialPostRecord> {
    if let Some(before) = query
        .get("before")
        .and_then(|value| value.parse::<i64>().ok())
    {
        items.retain(|item| item.created_at_unix < before);
    }
    if let Some(after) = query
        .get("after")
        .and_then(|value| value.parse::<i64>().ok())
    {
        items.retain(|item| item.created_at_unix > after);
    }
    if let Some(post_kind) = query.get("postKind") {
        items.retain(|item| item.post_kind == *post_kind);
    }
    if let Some(visibility) = query.get("visibility") {
        items.retain(|item| item.visibility == *visibility);
    }
    items.truncate(limit);
    items
}

fn filter_engagement_events(
    mut items: Vec<crate::models::EngagementRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::EngagementRecord> {
    if let Some(actor) = query.get("actor") {
        items.retain(|item| item.actor == *actor);
    }
    if let Some(post_id) = query.get("postId") {
        items.retain(|item| item.target_post_id.as_deref() == Some(post_id));
    }
    if let Some(action_kind) = query.get("actionKind") {
        items.retain(|item| item.action_kind == *action_kind);
    }
    if let Some(before) = query_u64(query, "before") {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = query_u64(query, "after") {
        items.retain(|item| item.slot > after);
    }
    items.truncate(limit);
    items
}

fn filter_social_stakes(
    mut items: Vec<crate::models::SocialStakeRecord>,
    query: &HashMap<String, String>,
    limit: usize,
) -> Vec<crate::models::SocialStakeRecord> {
    if let Some(creator) = query.get("creator") {
        items.retain(|item| item.creator == *creator);
    }
    if let Some(staker) = query.get("staker") {
        items.retain(|item| item.staker == *staker);
    }
    if let Some(state) = query.get("state") {
        items.retain(|item| item.state == *state);
    }
    items.truncate(limit);
    items
}

fn base_meta(network: &str) -> Value {
    json!({
        "cursor": Value::Null,
        "nextCursor": Value::Null,
        "network": network,
        "source": "indexer",
    })
}

fn data_response<T: Serialize>(network: &str, data: T) -> Response<Body> {
    json_response(
        StatusCode::OK,
        json!({
            "data": data,
            "meta": base_meta(network),
        }),
    )
}

fn bad_request_response(message: &str) -> Response<Body> {
    json_response(
        StatusCode::BAD_REQUEST,
        json!({
            "error": {
                "code": "bad_request",
                "message": message,
            }
        }),
    )
}

fn not_found_response(message: &str) -> Response<Body> {
    json_response(
        StatusCode::NOT_FOUND,
        json!({
            "error": {
                "code": "not_found",
                "message": message,
            }
        }),
    )
}

fn error_response(error: anyhow::Error) -> Response<Body> {
    json_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        json!({
            "error": {
                "code": "internal_error",
                "message": error.to_string(),
            }
        }),
    )
}

fn json_response(status: StatusCode, body: Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap_or_else(|_| Response::new(Body::from("{\"error\":{\"code\":\"internal_error\",\"message\":\"failed to build response\"}}")))
}
