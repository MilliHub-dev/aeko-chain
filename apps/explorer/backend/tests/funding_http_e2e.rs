use {
    aeko_explorer_backend::{
        features::funding,
        http::{build_router, state::AppState},
        ExplorerBackendConfig, PostgresRepository, RpcChainClient, ServerConfig,
    },
    aeko_sdk::{pubkey::Pubkey, signature::Signature},
    anyhow::{Context, Result},
    axum::{
        body::{to_bytes, Body},
        extract::State,
        http::{Method, Request, StatusCode},
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
    saw_authorized_airdrop: Arc<AtomicBool>,
    airdrop_calls: Arc<AtomicUsize>,
    pending_signature_statuses: Arc<AtomicUsize>,
}

async fn fake_rpc(State(state): State<FakeRpcState>, Json(request): Json<Value>) -> Json<Value> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let id = request.get("id").cloned().unwrap_or(json!(1));

    match method {
        "requestAirdrop" => {
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
            state.saw_authorized_airdrop.store(true, Ordering::SeqCst);
            state.airdrop_calls.fetch_add(1, Ordering::SeqCst);
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": Signature::new_unique().to_string()
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
        saw_authorized_airdrop: Arc::new(AtomicBool::new(false)),
        airdrop_calls: Arc::new(AtomicUsize::new(0)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
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
                max_manual_grant_aeko: Some(100.0),
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
    let app = build_router(state, &server_config());

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
    // server-side Admin token a Scan/user request cannot decide a grant.
    let (status, unauthorized) = request_json(
        &app,
        Method::POST,
        &format!("/admin/funding/requests/{request_id}/decide"),
        Some(json!({"approved": true})),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{unauthorized}");
    assert_eq!(rpc_observer.airdrop_calls.load(Ordering::SeqCst), 0);

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
    let grant_signature = approved["data"]["signature"]
        .as_str()
        .expect("confirmed grant signature")
        .to_string();
    assert!(rpc_observer.saw_authorized_airdrop.load(Ordering::SeqCst));
    assert_eq!(rpc_observer.airdrop_calls.load(Ordering::SeqCst), 1);

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
        Some(grant_signature.as_str())
    );

    let (status, grants) = request_json(
        &app,
        Method::GET,
        "/admin/funding/grants?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{grants}");
    let matching_grants = grants["data"]
        .as_array()
        .expect("grant list")
        .iter()
        .filter(|grant| grant["requestId"].as_str() == Some(request_id.as_str()))
        .collect::<Vec<_>>();
    assert_eq!(matching_grants.len(), 1);
    assert_eq!(matching_grants[0]["confirmed"], true);
    assert_eq!(
        matching_grants[0]["signature"].as_str(),
        Some(grant_signature.as_str())
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
    assert_ne!(airdrop_signature, grant_signature);
    assert_eq!(rpc_observer.airdrop_calls.load(Ordering::SeqCst), 2);

    let (status, grants_after_airdrop) = request_json(
        &app,
        Method::GET,
        "/admin/funding/grants?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{grants_after_airdrop}");
    assert!(!grants_after_airdrop["data"]
        .as_array()
        .expect("grant list")
        .iter()
        .any(|grant| grant["signature"].as_str() == Some(airdrop_signature.as_str())));

    let (status, airdrops) = request_json(
        &app,
        Method::GET,
        "/admin/funding/airdrops?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{airdrops}");
    assert!(airdrops["data"]
        .as_array()
        .expect("airdrop list")
        .iter()
        .any(|entry| entry["signature"].as_str() == Some(airdrop_signature.as_str())));
    assert!(!airdrops["data"]
        .as_array()
        .expect("airdrop list")
        .iter()
        .any(|entry| entry["signature"].as_str() == Some(grant_signature.as_str())));

    drop(app);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn submitted_grant_is_reconciled_without_resubmission() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let authorization = "test-funding-authorization-key-0002".to_string();
    let fake_state = FakeRpcState {
        authorization: authorization.clone(),
        saw_authorized_airdrop: Arc::new(AtomicBool::new(false)),
        airdrop_calls: Arc::new(AtomicUsize::new(0)),
        pending_signature_statuses: Arc::new(AtomicUsize::new(12)),
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
                max_manual_grant_aeko: Some(100.0),
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
    assert_eq!(rpc_observer.airdrop_calls.load(Ordering::SeqCst), 1);

    let transitioned = funding::reconcile_submitted_settlements_once(&state).await;
    assert_eq!(transitioned, 1);
    assert_eq!(
        rpc_observer.airdrop_calls.load(Ordering::SeqCst),
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

    let (status, grants) = request_json(
        &app,
        Method::GET,
        "/admin/funding/grants?limit=500",
        None,
        Some(admin_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{grants}");
    assert_eq!(
        grants["data"]
            .as_array()
            .expect("grant list")
            .iter()
            .filter(|grant| grant["requestId"].as_str() == Some(request_id.as_str()))
            .count(),
        1
    );

    drop(app);
    drop(state);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}

#[tokio::test]
async fn mainnet_funding_and_airdrop_routes_fail_closed() -> Result<()> {
    let _guard = TEST_DB_LOCK.lock().await;
    let database_url = env::var("AEKO_EXPLORER_TEST_DATABASE_URL")
        .context("AEKO_EXPLORER_TEST_DATABASE_URL must be set for integration tests")?;

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let rpc_addr = listener.local_addr()?;
    let authorization = "unused-mainnet-funding-key-00000001".to_string();
    let fake_server = Router::new()
        .route("/", post(fake_rpc))
        .with_state(FakeRpcState {
            authorization: authorization.clone(),
            saw_authorized_airdrop: Arc::new(AtomicBool::new(false)),
            airdrop_calls: Arc::new(AtomicUsize::new(0)),
            pending_signature_statuses: Arc::new(AtomicUsize::new(0)),
        });
    tokio::spawn(async move {
        axum::serve(listener, fake_server).await.unwrap();
    });

    let mut config = backend_config(database_url, format!("http://{rpc_addr}"));
    config.network = "mainnet".to_string();
    let repository = PostgresRepository::connect(&config).await?;
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
        None,
        100,
        100.0,
    )
    .shared();
    let app = build_router(state, &server_config());
    let address = Pubkey::new_unique().to_string();

    for (method, uri, body, token) in [
        (Method::GET, "/funding/policy", None, None),
        (
            Method::POST,
            "/funding/request",
            Some(json!({"address": address})),
            None,
        ),
        (
            Method::POST,
            "/funding/airdrop",
            Some(json!({"address": address, "amountAeko": 1.0})),
            None,
        ),
        (
            Method::POST,
            "/admin/funding/grant",
            Some(json!({"address": address, "amountAeko": 1.0})),
            Some(admin_token),
        ),
    ] {
        let (status, payload) = request_json(&app, method, uri, body, token).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri}: {payload}");
    }

    drop(app);
    drop_rpc_owner(rpc_owner).await?;
    Ok(())
}
