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
    aeko_sdk::feature::{self, Feature},
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
    registry_activated_at: Option<u64>,
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
        .map(|(label, program_id)| (label.clone(), inspect_program(rpc, program_id)))
        .collect::<BTreeMap<_, _>>();

    let states = registry
        .states
        .iter()
        .map(|(label, address)| {
            let expected_owner = owner_label_for_state(label)
                .and_then(|program_label| registry.programs.get(program_label))
                .cloned();
            (label.clone(), inspect_state(rpc, address, expected_owner))
        })
        .collect::<BTreeMap<_, _>>();

    let complete = registry.complete
        && features.values().all(|status| {
            status.present
                && status.owner_matches
                && status.activated_at.is_some()
                && status.error.is_none()
        })
        && programs
            .values()
            .all(|status| status.present && status.executable && status.error.is_none())
        && states.values().all(|status| {
            status.present && status.owner_matches && status.data_len > 0 && status.error.is_none()
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
    registry_activated_at: Option<u64>,
) -> FeatureStatus {
    let Some(feature_id) = feature_id else {
        return FeatureStatus {
            feature_id: None,
            activated_at: None,
            registry_activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some("feature id is missing from the protocol registry".to_string()),
        };
    };

    match rpc.fetch_account_with_data(&feature_id) {
        Ok(Some((account, data))) => {
            let owner_matches = account.owner == feature::id().to_string();
            let (activated_at, error) = if owner_matches {
                match decode_feature_activation(&data) {
                    Ok(activated_at) => (
                        activated_at,
                        feature_activation_consistency_error(activated_at, registry_activated_at),
                    ),
                    Err(error) => (None, Some(error)),
                }
            } else {
                (
                    None,
                    Some(format!(
                        "feature account owner {} does not match {}",
                        account.owner,
                        feature::id()
                    )),
                )
            };
            FeatureStatus {
                feature_id: Some(feature_id),
                activated_at,
                registry_activated_at,
                present: true,
                owner_matches,
                data_len: account.data_len,
                error,
            }
        }
        Ok(None) => FeatureStatus {
            feature_id: Some(feature_id),
            activated_at: None,
            registry_activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some("feature account does not exist".to_string()),
        },
        Err(error) => FeatureStatus {
            feature_id: Some(feature_id),
            activated_at: None,
            registry_activated_at,
            present: false,
            owner_matches: false,
            data_len: 0,
            error: Some(error.to_string()),
        },
    }
}

fn decode_feature_activation(data: &[u8]) -> Result<Option<u64>, String> {
    bincode::deserialize::<Feature>(data)
        .map(|feature| feature.activated_at)
        .map_err(|error| format!("invalid feature account data: {error}"))
}

fn feature_activation_consistency_error(
    activated_at: Option<u64>,
    registry_activated_at: Option<u64>,
) -> Option<String> {
    match (activated_at, registry_activated_at) {
        (None, _) => Some("feature is still pending activation".to_string()),
        (Some(_), None) => {
            Some("protocol registry is missing the feature activation slot".to_string())
        }
        (Some(actual), Some(recorded)) if actual != recorded => Some(format!(
            "protocol registry activation slot {recorded} does not match on-chain slot {actual}"
        )),
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_activation_decode_reads_live_slot() {
        let data = bincode::serialize(&Feature {
            activated_at: Some(42),
        })
        .unwrap();
        assert_eq!(decode_feature_activation(&data).unwrap(), Some(42));
    }

    #[test]
    fn feature_activation_consistency_rejects_pending_missing_and_mismatch() {
        assert!(feature_activation_consistency_error(None, Some(42))
            .unwrap()
            .contains("pending"));
        assert!(feature_activation_consistency_error(Some(42), None)
            .unwrap()
            .contains("missing"));
        assert!(feature_activation_consistency_error(Some(42), Some(43))
            .unwrap()
            .contains("does not match"));
        assert!(feature_activation_consistency_error(Some(42), Some(42)).is_none());
    }

    #[test]
    fn feature_activation_decode_rejects_invalid_account_data() {
        assert!(decode_feature_activation(b"not-a-feature").is_err());
    }
}
