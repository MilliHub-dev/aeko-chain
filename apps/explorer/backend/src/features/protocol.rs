use {
    crate::{
        error::ApiResult,
        infrastructure::{
            chain::RpcChainClient,
            registry::{resolve_protocol_registry, ProtocolRegistry},
        },
        response::{self, DataEnvelope},
        state::SharedState,
    },
    aeko_sdk::feature,
    anyhow::Context,
    axum::{extract::State, routing::get, Json, Router},
    serde::Serialize,
    std::collections::BTreeMap,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/registry/protocol", get(get_registry))
        .route("/protocol/status", get(get_status))
}

async fn get_registry(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<ProtocolRegistry>>> {
    Ok(response::data(&state.network, resolve_protocol_registry()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProtocolStatus {
    complete: bool,
    registry_complete: bool,
    features: BTreeMap<String, FeatureStatus>,
    programs: BTreeMap<String, ProgramStatus>,
    states: BTreeMap<String, StateStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeatureStatus {
    feature_id: Option<String>,
    activated_at: Option<u64>,
    present: bool,
    owner_matches: bool,
    data_len: usize,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgramStatus {
    program_id: String,
    present: bool,
    executable: bool,
    owner: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateStatus {
    state_account: String,
    expected_owner: Option<String>,
    present: bool,
    owner_matches: bool,
    data_len: usize,
    error: Option<String>,
}

async fn get_status(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<ProtocolStatus>>> {
    let rpc = state.rpc.clone();
    let registry = resolve_protocol_registry();
    let status = tokio::task::spawn_blocking(move || inspect_protocol(&rpc, registry))
        .await
        .context("protocol status worker panicked")?;
    Ok(response::data_from_source(
        &state.network,
        status,
        "rpc-live",
    ))
}

fn inspect_protocol(rpc: &RpcChainClient, registry: ProtocolRegistry) -> ProtocolStatus {
    let mut features = BTreeMap::new();
    features.insert(
        "tokenPrograms".to_string(),
        inspect_feature(
            rpc,
            registry.token_programs_feature.clone(),
            registry.token_programs_feature_activated_at,
        ),
    );
    features.insert(
        "permissionLayer".to_string(),
        inspect_feature(
            rpc,
            registry.permission_layer_feature.clone(),
            registry.permission_layer_feature_activated_at,
        ),
    );

    let programs = registry
        .programs
        .iter()
        .map(|(label, program_id)| {
            (
                label.clone(),
                inspect_program(rpc, program_id),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let states = registry
        .states
        .iter()
        .map(|(label, address)| {
            let expected_owner = owner_label_for_state(label)
                .and_then(|program_label| registry.programs.get(program_label))
                .cloned();
            (
                label.clone(),
                inspect_state(rpc, address, expected_owner),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let complete = registry.complete
        && features.values().all(|status| {
            status.present
                && status.owner_matches
                && status.activated_at.is_some()
                && status.error.is_none()
        })
        && programs.values().all(|status| {
            status.present && status.executable && status.error.is_none()
        })
        && states.values().all(|status| {
            status.present
                && status.owner_matches
                && status.data_len > 0
                && status.error.is_none()
        });

    ProtocolStatus {
        complete,
        registry_complete: registry.complete,
        features,
        programs,
        states,
    }
}

fn inspect_feature(
    rpc: &RpcChainClient,
    feature_id: Option<String>,
    activated_at: Option<u64>,
) -> FeatureStatus {
    let Some(feature_id) = feature_id else {
        return FeatureStatus {
            feature_id: None,
            activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some("feature id is missing from the protocol registry".to_string()),
        };
    };
    match rpc.fetch_account(&feature_id) {
        Ok(Some(account)) => FeatureStatus {
            feature_id: Some(feature_id),
            activated_at,
            present: true,
            owner_matches: account.owner == feature::id().to_string(),
            data_len: account.data_len,
            error: None,
        },
        Ok(None) => FeatureStatus {
            feature_id: Some(feature_id),
            activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some("feature account does not exist".to_string()),
        },
        Err(error) => FeatureStatus {
            feature_id: Some(feature_id),
            activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some(error.to_string()),
        },
    }
}

fn inspect_program(rpc: &RpcChainClient, program_id: &str) -> ProgramStatus {
    match rpc.fetch_account(program_id) {
        Ok(Some(account)) => ProgramStatus {
            program_id: program_id.to_string(),
            present: true,
            executable: account.executable,
            owner: Some(account.owner),
            error: None,
        },
        Ok(None) => ProgramStatus {
            program_id: program_id.to_string(),
            present: false,
            executable: false,
            owner: None,
            error: Some("native program account does not exist".to_string()),
        },
        Err(error) => ProgramStatus {
            program_id: program_id.to_string(),
            present: false,
            executable: false,
            owner: None,
            error: Some(error.to_string()),
        },
    }
}

fn inspect_state(
    rpc: &RpcChainClient,
    address: &str,
    expected_owner: Option<String>,
) -> StateStatus {
    match rpc.fetch_account(address) {
        Ok(Some(account)) => {
            let owner_matches = expected_owner
                .as_ref()
                .map(|owner| owner == &account.owner)
                .unwrap_or(false);
            StateStatus {
                state_account: address.to_string(),
                expected_owner,
                present: true,
                owner_matches,
                data_len: account.data_len,
                error: None,
            }
        }
        Ok(None) => StateStatus {
            state_account: address.to_string(),
            expected_owner,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some("canonical state account does not exist".to_string()),
        },
        Err(error) => StateStatus {
            state_account: address.to_string(),
            expected_owner,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some(error.to_string()),
        },
    }
}

fn owner_label_for_state(state_label: &str) -> Option<&'static str> {
    match state_label {
        "tokenomics" => Some("tokenomics"),
        "referenceMint" => Some("token20"),
        "publicMint" => Some("publicMint"),
        "permissionRegistry" => Some("permissionRegistry"),
        "revocationRegistry" => Some("revocationRegistry"),
        "subnetRegistry" => Some("subnetRegistry"),
        "emergencyMultisig" => Some("emergencyMultisig"),
        "finalityOracle" => Some("finalityOracle"),
        _ => None,
    }
}
