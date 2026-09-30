use {
    aeko_explorer_backend::{
        features::funding,
        http::{build_router, state::AppState},
        ExplorerBackendConfig, PostgresRepository, RpcChainClient, ServerConfig,
    },
    aeko_sdk::pubkey::Pubkey,
    anyhow::{Context, Result},
    axum::{
        body::{to_bytes, Body},
        extract::State,
        http::{header, Method, Request, StatusCode},
        routing::post,
        Json, Router,
    },
    serde_json::{json, Value},
    std::{
        env,
        net::SocketAddr,
        sync::{
            atomic::{AtomicBool, AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    },
    tokio::{net::TcpListener, sync::Mutex},
    tower::ServiceExt,
};

static TEST_DB_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Clone)]
struct FakeRpcState {
    authorization: String,
    saw_authorized_funding: Arc<AtomicBool>,
    transfer_calls: Arc<AtomicUsize>,
    transfer_failures: Arc<AtomicUsize>,
    blockhash_calls: Arc<AtomicUsize>,
    blockhash_valid: Arc<AtomicBool>,
    pending_signature_statuses: Arc<AtomicUsize>,
    blockhash: String,
}

/// Deterministic stand-in for Faucet signing: the same submission intent
/// (destination, amount, blockhash) recovers the same signature so
/// response-loss replay tests can prove idempotency, while distinct intents
/// settle as distinct transfers — mirroring the real Faucet/RPC behavior and
/// the `funding_transfers_signature_unique` ledger constraint.
fn intent_signature(address: &str, lamports: u64, blockhash: &str) -> String {
    let mut bytes = [0u8; 64];
    for (i, chunk) in bytes.chunks_mut(8).enumerate() {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        std::hash::Hash::hash(&(address, lamports, blockhash, i), &mut hasher);
        chunk.copy_from_slice(&std::hash::Hasher::finish(&hasher).to_le_bytes());
    }
    bs58::encode(bytes).into_string()
}

async fn fake_rpc(State(state): State<FakeRpcState>, Json(request): Json<Value>) -> Json<Value> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let id = request.get("id").cloned().unwrap_or(json!(1));

    match method {
        "getLatestBlockhash" => {
            state.blockhash_calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "context": {"slot": 42},
                    "value": {
                        "blockhash": state.blockhash,
                        "lastValidBlockHeight": 500
                    }
                }
            }))
        }
        "isBlockhashValid" => {
            let supplied = request
                .pointer("/params/0")
                .and_then(Value::as_str)
                .unwrap_or_default();
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "context": {"slot": 42},
                    "value": supplied == state.blockhash
                        && state.blockhash_valid.load(Ordering::SeqCst)
                }
            }))
        }
        "requestFunding" | "requestAirdrop" => {
            let recent_blockhash = request
                .pointer("/params/2/recentBlockhash")
                .and_then(Value::as_str);
            if recent_blockhash != Some(state.blockhash.as_str()) {
                return Json(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {"code": -32600, "message": "Invalid request"}
                }));
            }
            if method == "requestFunding" {
                let authorization = request
                    .pointer("/params/2/fundingAuthorization")
                    .and_then(Value::as_str);
                if authorization != Some(state.authorization.as_str()) {
                    return Json(json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {"code": -32600, "message": "Invalid request"}
                    }));
                }
                state.saw_authorized_funding.store(true, Ordering::SeqCst);
            } else if request.pointer("/params/2/fundingAuthorization").is_some() {
                return Json(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {"code": -32602, "message": "Developer airdrop must not carry funding authorization"}
                }));
            }

            state.transfer_calls.fetch_add(1, Ordering::SeqCst);
            if state.transfer_failures.load(Ordering::SeqCst) > 0 {
                state.transfer_failures.fetch_sub(1, Ordering::SeqCst);
                return Json(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32603,
                        "message": "simulated submission response failure"
                    }
                }));
            }
            let address = request
                .pointer("/params/0")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let lamports = request
                .pointer("/params/1")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let intent_blockhash = recent_blockhash.unwrap_or_default();
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": intent_signature(address, lamports, intent_blockhash)
            }))
        }
        "getSignatureStatuses" => {
            let remaining = state.pending_signature_statuses.load(Ordering::SeqCst);
            if remaining > 0 {
                state
                    .pending_signature_statuses
                    .fetch_sub(1, Ordering::SeqCst);
                return Json(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "context": {"slot": 42},
                        "value": [null]
                    }
                }));
            }
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "context": {"slot": 42},
                    "value": [{
                        "err": null,
                        "confirmationStatus": "confirmed"
                    }]
                }
            }))
        }
        _ => Json(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": -32601, "message": "Method not found"}
        })),
    }
}

fn backend_config(database_url: String, rpc_url: String) -> ExplorerBackendConfig {
    ExplorerBackendConfig {
        rpc_url,
        websocket_url: None,
        network: "testnet".to_string(),
        start_slot: 0,
        max_batch_size: 32,
        persist_socialfi_views: true,
        database_url,
        db_max_connections: 4,
        db_min_connections: 1,
        db_acquire_timeout: Duration::from_secs(5),
        rpc_timeout: Duration::from_secs(5),
        asset_refresh_slots: 64,
        social_refresh_slots: 16,
        max_ready_lag_slots: 128,
        reset_chain_on_start: false,
    }
}

fn server_config() -> ServerConfig {
    ServerConfig {
        bind_addr: SocketAddr::from(([127, 0, 0, 1], 0)),
        request_timeout: Duration::from_secs(30),
        max_body_bytes: 1024 * 1024,
        sync_interval: Duration::from_secs(1),
        cors_origins: vec!["https://scan.aeko.online".parse().unwrap()],
    }
}

async fn build_rpc_owner(config: ExplorerBackendConfig) -> Result<Arc<RpcChainClient>> {
    let client = tokio::task::spawn_blocking(move || RpcChainClient::new(config))
        .await
        .context("RPC client construction worker panicked")??;
    Ok(Arc::new(client))
}

async fn drop_rpc_owner(owner: Arc<RpcChainClient>) -> Result<()> {
    tokio::task::spawn_blocking(move || drop(owner))
        .await
        .context("RPC client shutdown worker panicked")?;
    Ok(())
}

async fn request_json(
    app: &Router,
    method: Method,
    uri: &str,
    body: Option<Value>,
    admin_token: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    if let Some(token) = admin_token {
        builder = builder.header("x-aeko-settings-token", token);
    }
    let request = builder
        .body(match body {
            Some(value) => Body::from(serde_json::to_vec(&value).unwrap()),
            None => Body::empty(),
        })
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    let payload = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"raw": String::from_utf8_lossy(&bytes).to_string()}));
    (status, payload)
}

#[tokio::test]
async fn scan_request_requires_admin_decision_and_airdrops_stay_separate() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-0001".to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(0)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(true)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
        blockhash: Pubkey::new_unique().to_string(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;

    let admin_token = "test-settings-admin-token-0000000001";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "testnet",
        "test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let preflight = Request::builder()
        .method(Method::OPTIONS)
        .uri("/funding/request")
        .header("origin", "https://scan.aeko.online")
        .header("access-control-request-method", "POST")
        .header(
            "access-control-request-headers",
            "content-type,x-request-id",
        )
        .body(Body::empty())
        .unwrap();
    let preflight_response = app.clone().oneshot(preflight).await.unwrap();
    assert_eq!(preflight_response.status(), StatusCode::OK);
    assert_eq!(
        preflight_response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|value| value.to_str().ok()),
        Some("https://scan.aeko.online")
    );
    assert!(
        preflight_response
            .headers()
            .get("access-control-allow-methods")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.split(',').any(|method| method.trim() == "POST")),
        "funding CORS preflight must allow POST"
    );
    assert!(
        preflight_response
            .headers()
            .get("access-control-allow-headers")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                let lower = value.to_ascii_lowercase();
                lower.contains("content-type") && lower.contains("x-request-id")
            }),
        "funding CORS preflight must allow content-type and x-request-id"
    );

    let policy_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/funding/policy")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(policy_response.status(), StatusCode::OK);
    assert_eq!(
        policy_response
            .headers()
            .get(header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok()),
        Some("no-store"),
        "funding state must never be served from a stale browser/edge cache"
    );

    let address = Pubkey::new_unique().to_string();
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    assert_eq!(created["data"]["status"], "pending");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    // The same backend route exists for Operations Web, but without the
    // server-side Admin token a Scan/user request cannot decide a funding.
    let (status, unauthorized) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{unauthorized}");
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 0);

    let (status, approved) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{approved}");
    assert_eq!(approved["data"]["status"], "confirmed");
    assert_eq!(approved["data"]["confirmed"], true);
    let funding_signature = approved["data"]["signature"]
        .as_str()
        .expect("confirmed funding signature")
        .to_string();
    assert!(rpc_observer.saw_authorized_funding.load(Ordering::SeqCst));
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 1);

    let (status, public_status) = request_json(
        &app,
        Method::GET,
        &format!("/funding/request/{request_id}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{public_status}");
    assert_eq!(public_status["data"]["status"], "confirmed");
    assert_eq!(
        public_status["data"]["signature"].as_str(),
        Some(funding_signature.as_str())
    );

    let (status, funding_transfers) = request_json(
        &app,
        Method::GET,
        "/admin/funding/history?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{funding_transfers}");
    let matching_funding = funding_transfers["data"]
        .as_array()
        .expect("funding history")
        .iter()
        .filter(|funding| funding["requestId"].as_str() == Some(request_id.as_str()))
        .collect::<Vec<_>>();
    assert_eq!(matching_funding.len(), 1);
    assert_eq!(matching_funding[0]["confirmed"], true);
    assert_eq!(
        matching_funding[0]["signature"].as_str(),
        Some(funding_signature.as_str())
    );

    let airdrop_address = Pubkey::new_unique().to_string();
    let (status, airdrop) = request_json(
        &app,
        Method::POST,
        "/funding/airdrop",
        Some(json!({"address": airdrop_address, "amountAeko": 1.0})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{airdrop}");
    assert_eq!(airdrop["data"]["status"], "confirmed");
    let airdrop_signature = airdrop["data"]["signature"]
        .as_str()
        .expect("airdrop signature")
        .to_string();
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 2);

    // The fake signer derives one deterministic signature per submission
    // intent, so response-loss replays recover the same signature while
    // unrelated requests settle distinctly. Ledger separation is asserted by
    // the durable domain identity/address all the same.
    let (status, funding_after_airdrop) = request_json(
        &app,
        Method::GET,
        "/admin/funding/history?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{funding_after_airdrop}");
    let funding_rows = funding_after_airdrop["data"]
        .as_array()
        .expect("funding history");
    assert_eq!(
        funding_rows
            .iter()
            .filter(|funding| funding["requestId"].as_str() == Some(request_id.as_str()))
            .count(),
        1
    );
    assert!(!funding_rows
        .iter()
        .any(|funding| funding["address"].as_str() == Some(airdrop_address.as_str())));

    let (status, airdrops) = request_json(
        &app,
        Method::GET,
        "/admin/funding/airdrops?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{airdrops}");
    let airdrop_rows = airdrops["data"].as_array().expect("airdrop list");
    assert!(airdrop_rows.iter().any(|entry| {
        entry["address"].as_str() == Some(airdrop_address.as_str())
            && entry["signature"].as_str() == Some(airdrop_signature.as_str())
    }));
    assert!(!airdrop_rows
        .iter()
        .any(|entry| entry["address"].as_str() == Some(address.as_str())));

    drop(app);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn developer_airdrop_is_forbidden_on_mainnet() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-mainnet-0001".to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(0)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(true)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
        blockhash: Pubkey::new_unique().to_string(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let admin_token = "test-settings-admin-token-mainnet-000001";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "mainnet",
        "test-mainnet-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state, &server_config());

    let (status, payload) = request_json(
        &app,
        Method::POST,
        "/funding/airdrop",
        Some(json!({
            "address": Pubkey::new_unique().to_string(),
            "amountAeko": 1.0
        })),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{payload}");
    assert_eq!(payload["error"]["code"], "AIRDROP_DISABLED_ON_MAINNET");
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 0);

    drop(app);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn expired_submitted_funding_becomes_terminal_failed_without_fresh_intent() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-expired-0001".to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(0)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(false)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(usize::MAX)),
        blockhash: Pubkey::new_unique().to_string(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;

    let admin_token = "test-settings-admin-token-expired-0000001";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "testnet",
        "test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let address = Pubkey::new_unique().to_string();
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    let before = state.repository.funding_policy_snapshot().await?;
    let (status, failed_response) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_GATEWAY, "{failed_response}");
    assert_eq!(
        failed_response["error"]["code"],
        "FUNDING_TRANSACTION_FAILED"
    );
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rpc_observer.blockhash_calls.load(Ordering::SeqCst), 1);

    let failed = state
        .repository
        .funding_request(&request_id)
        .await?
        .expect("failed request");
    assert_eq!(failed.status, "failed");
    assert!(!failed.confirmed);

    let after = state.repository.funding_policy_snapshot().await?;
    assert!(
        after.public_reserved_aeko <= before.public_reserved_aeko,
        "expired intent must release its public budget reservation"
    );
    assert!(!state
        .repository
        .list_funding_transfers(500)
        .await?
        .iter()
        .any(|funding| funding.request_id.as_deref() == Some(request_id.as_str())));

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn processing_funding_replays_only_persisted_intent_after_submission_response_failure(
) -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-replay-0001".to_string();
    let blockhash = Pubkey::new_unique().to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(1)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(true)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
        blockhash: blockhash.clone(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;

    let admin_token = "test-settings-admin-token-replay-00000001";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "testnet",
        "test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let address = Pubkey::new_unique().to_string();
    // The fake signer derives its signature from the submission intent, so
    // the replayed settlement must recover exactly this signature.
    let expected_signature = intent_signature(&address, 5_000_000_000, &blockhash);
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    let (status, failed_response) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{failed_response}");
    assert_eq!(
        failed_response["error"]["code"],
        "FUNDING_SUBMISSION_RETRY_PENDING"
    );
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rpc_observer.blockhash_calls.load(Ordering::SeqCst), 1);

    let persisted = state
        .repository
        .funding_request(&request_id)
        .await?
        .expect("persisted request");
    assert_eq!(persisted.status, "processing");
    assert_eq!(
        persisted.submission_blockhash.as_deref(),
        Some(blockhash.as_str())
    );
    assert!(persisted.signature.is_none());

    let transitioned = funding::reconcile_submitted_settlements_once(&state).await;
    assert!(transitioned >= 1);
    assert_eq!(
        rpc_observer.transfer_calls.load(Ordering::SeqCst),
        2,
        "recovery should replay the persisted transaction intent exactly once"
    );
    assert_eq!(
        rpc_observer.blockhash_calls.load(Ordering::SeqCst),
        1,
        "recovery must not fetch a fresh blockhash for an uncertain submission"
    );

    let recovered = state
        .repository
        .funding_request(&request_id)
        .await?
        .expect("recovered request");
    assert_eq!(recovered.status, "confirmed");
    assert_eq!(
        recovered.signature.as_deref(),
        Some(expected_signature.as_str())
    );

    let funding_transfers = state.repository.list_funding_transfers(500).await?;
    let matching: Vec<_> = funding_transfers
        .iter()
        .filter(|funding| funding.request_id.as_deref() == Some(request_id.as_str()))
        .collect();
    assert_eq!(matching.len(), 1);
    assert_eq!(
        matching[0].signature.as_deref(),
        Some(expected_signature.as_str())
    );
    assert!(matching[0].confirmed);

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn processing_funding_recovers_original_signature_after_blockhash_expiry() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-expired-replay-0001".to_string();
    let blockhash = Pubkey::new_unique().to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(1)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(false)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
        blockhash: blockhash.clone(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;

    let admin_token = "test-settings-admin-token-expired-replay-0001";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "testnet",
        "test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let address = Pubkey::new_unique().to_string();
    // The fake signer derives its signature from the submission intent, so
    // the replayed settlement must recover exactly this signature.
    let expected_signature = intent_signature(&address, 5_000_000_000, &blockhash);
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    let (status, failed_response) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{failed_response}");
    assert_eq!(
        failed_response["error"]["code"],
        "FUNDING_SUBMISSION_RETRY_PENDING"
    );
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rpc_observer.blockhash_calls.load(Ordering::SeqCst), 1);

    // The original request may have reached the Validator/Faucet and landed
    // even though Explorer lost the RPC response. Once the persisted blockhash
    // expires, recovery must still replay that exact intent to recover the same
    // deterministic signature rather than mint a fresh transaction.
    let transitioned = funding::reconcile_submitted_settlements_once(&state).await;
    assert!(transitioned >= 2);
    assert_eq!(
        rpc_observer.transfer_calls.load(Ordering::SeqCst),
        2,
        "expired recovery must replay the persisted intent exactly once"
    );
    assert_eq!(
        rpc_observer.blockhash_calls.load(Ordering::SeqCst),
        1,
        "expired recovery must never fetch a fresh blockhash"
    );

    let recovered = state
        .repository
        .funding_request(&request_id)
        .await?
        .expect("recovered request");
    assert_eq!(recovered.status, "confirmed");
    assert_eq!(
        recovered.signature.as_deref(),
        Some(expected_signature.as_str())
    );
    assert!(recovered.confirmed);

    let funding_transfers = state.repository.list_funding_transfers(500).await?;
    assert_eq!(
        funding_transfers
            .iter()
            .filter(|funding| funding.request_id.as_deref() == Some(request_id.as_str()))
            .count(),
        1,
        "response-loss recovery must still create exactly one confirmed funding"
    );

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn submitted_funding_is_reconciled_without_resubmission() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-0002".to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_funding: Arc::new(AtomicBool::new(false)),
        transfer_calls: Arc::new(AtomicUsize::new(0)),
        transfer_failures: Arc::new(AtomicUsize::new(0)),
        blockhash_calls: Arc::new(AtomicUsize::new(0)),
        blockhash_valid: Arc::new(AtomicBool::new(true)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(12)),
        blockhash: Pubkey::new_unique().to_string(),
    };
    let rpc_observer = fake_state.clone();

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(fake_state);
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let config = backend_config(database_url, format!("http://{rpc_addr}"));
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;

    let admin_token = "test-settings-admin-token-0000000003";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "testnet",
        "test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let address = Pubkey::new_unique().to_string();
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    let (status, approved) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{approved}");
    assert_eq!(approved["data"]["status"], "submitted");
    assert_eq!(rpc_observer.transfer_calls.load(Ordering::SeqCst), 1);

    let transitioned = funding::reconcile_submitted_settlements_once(&state).await;
    assert_eq!(transitioned, 1);
    assert_eq!(
        rpc_observer.transfer_calls.load(Ordering::SeqCst),
        1,
        "reconciliation must observe the stored signature without resubmitting"
    );

    let (status, reconciled) = request_json(
        &app,
        Method::GET,
        &format!("/funding/request/{request_id}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reconciled}");
    assert_eq!(reconciled["data"]["status"], "confirmed");
    assert_eq!(reconciled["data"]["confirmed"], true);

    let (status, funding_transfers) = request_json(
        &app,
        Method::GET,
        "/admin/funding/history?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{funding_transfers}");
    assert_eq!(
        funding_transfers["data"]
            .as_array()
            .expect("funding history")
            .iter()
            .filter(|funding| funding["requestId"].as_str() == Some(request_id.as_str()))
            .count(),
        1
    );

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn mainnet_public_and_admin_funding_remain_available() -> Result<()> {
    // Mainnet keeps authenticated/public Funding available while the separate
    // developer-airdrop endpoint is covered by the fail-closed regression above.
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let authorization = "mainnet-funding-authorization-key-00000001".to_string();
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(FakeRpcState {
            authorization: authorization.clone(),
            saw_authorized_funding: Arc::new(AtomicBool::new(false)),
            transfer_calls: Arc::new(AtomicUsize::new(0)),
            transfer_failures: Arc::new(AtomicUsize::new(0)),
            blockhash_calls: Arc::new(AtomicUsize::new(0)),
            blockhash_valid: Arc::new(AtomicBool::new(true)),
            pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
            blockhash: Pubkey::new_unique().to_string(),
        });
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let mut config = backend_config(database_url, format!("http://{rpc_addr}"));
    config.network = "mainnet".to_string();
    let repository = PostgresRepository::connect(&config).await?;
    let settings = repository.funding_settings().await?;
    repository
        .update_funding_settings(
            settings.revision,
            &aeko_explorer_backend::infrastructure::persistence::funding::FundingSettingsUpdate {
                enabled: Some(true),
                amount_aeko: Some(5.0),
                cooldown_hours: Some(0.0),
                daily_budget_aeko: Some(1_000_000.0),
                max_admin_funding_aeko: Some(100.0),
                console_airdrop_cap_aeko: Some(25.0),
            },
        )
        .await?;
    let admin_token = "test-settings-admin-token-0000000002";
    let rpc_owner = build_rpc_owner(config).await?;
    let state = AppState::new(
        repository,
        rpc_owner.clone(),
        "mainnet",
        "mainnet-test-genesis",
        128,
        true,
        admin_token,
        Some(authorization),
        100,
        100.0,
    )
    .shared();
    let app = build_router(state.clone(), &server_config());

    let public_address = Pubkey::new_unique().to_string();
    let (status, created) = request_json(
        &app,
        Method::POST,
        "/funding/request",
        Some(json!({"address": public_address})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let request_id = created["data"]["id"]
        .as_str()
        .expect("request id")
        .to_string();

    let (status, approved) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{approved}");
    assert!(
        approved["data"]["signature"]
            .as_str()
            .is_some_and(|value| !value.is_empty()),
        "mainnet public Funding must settle with a durable signature: {approved}"
    );

    let admin_address = Pubkey::new_unique().to_string();
    let (status, direct) = request_json(
        &app,
        Method::POST,
        "/admin/funding/send",
        Some(json!({"address": admin_address, "amountAeko": 1.0})),
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{direct}");
    assert!(
        direct["data"]["signature"]
            .as_str()
            .is_some_and(|value| !value.is_empty()),
        "mainnet direct Admin Funding must settle with a durable signature: {direct}"
    );

    let transfers = state.repository.list_funding_transfers(500).await?;
    assert!(
        transfers
            .iter()
            .any(|entry| entry.request_id.as_deref() == Some(request_id.as_str())),
        "mainnet public approval must record a confirmed funding transfer"
    );
    assert!(
        transfers
            .iter()
            .any(|entry| entry.address == admin_address && entry.confirmed),
        "mainnet direct Admin Funding must be recorded in funding history"
    );

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}
