use {
    aeko_emergency_multisig_program::state::MultisigConfig,
    aeko_finality_oracle_program::state::OracleConfig,
    aeko_permission_registry_program::state::RegistryConfig,
    aeko_public_mint_program::state::PublicMintState,
    aeko_revocation_registry_program::state::RevRegistryConfig,
    aeko_subnet_registry_program::state::SubnetRegistryConfig,
    aeko_token_20_program::state::Aeko20Mint,
    aeko_tokenomics_program::state::TokenomicsStateAccount,
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
pub(crate) struct ProtocolStatus {
    complete: bool,
    condition: String,
    registry_complete: bool,
    registry_schema_version: Option<u32>,
    registry_genesis_hash: Option<String>,
    bootstrap_in_progress: bool,
    live_genesis_hash: String,
    genesis_matches: bool,
    features: BTreeMap<String, FeatureStatus>,
    programs: BTreeMap<String, ProgramStatus>,
    states: BTreeMap<String, StateStatus>,
}

impl ProtocolStatus {
    pub(crate) fn is_complete(&self) -> bool {
        self.complete
    }

    pub(crate) fn condition(&self) -> &str {
        &self.condition
    }

    pub(crate) fn registry_complete(&self) -> bool {
        self.registry_complete
    }

    pub(crate) fn registry_genesis_hash(&self) -> Option<&str> {
        self.registry_genesis_hash.as_deref()
    }

    pub(crate) fn genesis_matches(&self) -> bool {
        self.genesis_matches
    }

    pub(crate) fn executable_program_count(&self) -> usize {
        self.programs
            .values()
            .filter(|status| status.present && status.executable && status.error.is_none())
            .count()
    }

    pub(crate) fn program_count(&self) -> usize {
        self.programs.len()
    }

    pub(crate) fn healthy_state_count(&self) -> usize {
        self.states
            .values()
            .filter(|status| status.condition == "healthy")
            .count()
    }

    pub(crate) fn state_count(&self) -> usize {
        self.states.len()
    }
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
    condition: String,
    error: Option<String>,
}

async fn get_status(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<ProtocolStatus>>> {
    let rpc = state.rpc.clone();
    let live_genesis = state.genesis_hash.clone();
    let status = tokio::task::spawn_blocking(move || inspect_protocol_status(&rpc, &live_genesis))
        .await
        .context("protocol status worker panicked")?;
    Ok(response::data_from_source(
        &state.network,
        status,
        "rpc-live",
    ))
}

pub(crate) fn inspect_protocol_status(
    rpc: &RpcChainClient,
    live_genesis: &str,
) -> ProtocolStatus {
    inspect_protocol(rpc, resolve_protocol_registry(), live_genesis)
}

fn inspect_protocol(
    rpc: &RpcChainClient,
    registry: ProtocolRegistry,
    live_genesis: &str,
) -> ProtocolStatus {
    let registry_complete = registry.complete;
    let registry_schema_version = registry.schema_version;
    let registry_genesis_hash = registry.genesis_hash.clone();
    let bootstrap_in_progress = registry.bootstrap_in_progress;
    let genesis_matches = registry_genesis_hash.as_deref() == Some(live_genesis);

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
            (
                label.clone(),
                inspect_state(rpc, label, address, expected_owner),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let features_healthy = features.values().all(|status| {
        status.present
            && status.owner_matches
            && status.activated_at.is_some()
            && status.error.is_none()
    });
    let programs_healthy = programs
        .values()
        .all(|status| status.present && status.executable && status.error.is_none());
    let states_healthy = states.values().all(|status| status.condition == "healthy");

    let condition = if bootstrap_in_progress {
        "bootstrapInProgress"
    } else if !registry_complete {
        "registryIncomplete"
    } else if registry_genesis_hash.is_none() {
        "legacyRegistry"
    } else if !genesis_matches {
        "genesisMismatch"
    } else if features_healthy && programs_healthy && states_healthy {
        "healthy"
    } else {
        "stateIncomplete"
    }
    .to_string();

    ProtocolStatus {
        complete: registry_complete
            && genesis_matches
            && features_healthy
            && programs_healthy
            && states_healthy,
        condition,
        registry_complete,
        registry_schema_version,
        registry_genesis_hash,
        bootstrap_in_progress,
        live_genesis_hash: live_genesis.to_string(),
        genesis_matches,
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
    label: &str,
    address: &str,
    expected_owner: Option<String>,
) -> StateStatus {
    match rpc.fetch_account_with_data(address) {
        Ok(Some((account, data))) => {
            let owner_matches = expected_owner
                .as_ref()
                .map(|owner| owner == &account.owner)
                .unwrap_or(false);
            let (condition, error) = if expected_owner.is_none() {
                (
                    "registryMissing".to_string(),
                    Some("expected owner program is missing from the protocol registry".to_string()),
                )
            } else if !owner_matches {
                (
                    "wrongOwner".to_string(),
                    Some(format!(
                        "canonical state owner mismatch: expected {}, got {}",
                        expected_owner.as_deref().unwrap_or("unknown"),
                        account.owner
                    )),
                )
            } else {
                match canonical_state_initialized(label, &data) {
                    Ok(true) => ("healthy".to_string(), None),
                    Ok(false) => (
                        "uninitialized".to_string(),
                        Some(
                            "canonical state account has valid schema but is not initialized"
                                .to_string(),
                        ),
                    ),
                    Err(error) => ("invalidData".to_string(), Some(error)),
                }
            };
            StateStatus {
                state_account: address.to_string(),
                expected_owner,
                present: true,
                owner_matches,
                data_len: account.data_len,
                condition,
                error,
            }
        }
        Ok(None) => StateStatus {
            state_account: address.to_string(),
            expected_owner,
            present: false,
            owner_matches: false,
            data_len: 0,
            condition: "missing".to_string(),
            error: Some("canonical state account does not exist".to_string()),
        },
        Err(error) => StateStatus {
            state_account: address.to_string(),
            expected_owner,
            present: false,
            owner_matches: false,
            data_len: 0,
            condition: "rpcError".to_string(),
            error: Some(error.to_string()),
        },
    }
}

fn canonical_state_initialized(label: &str, data: &[u8]) -> Result<bool, String> {
    match label {
        "tokenomics" => TokenomicsStateAccount::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid tokenomics state data: {error}")),
        "referenceMint" => Aeko20Mint::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid AEKO-20 reference mint data: {error}")),
        "publicMint" => PublicMintState::deserialize_padded(data)
            .map(|state| state.policy.is_initialized)
            .map_err(|error| format!("invalid public-mint state data: {error}")),
        "permissionRegistry" => RegistryConfig::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid permission-registry state data: {error}")),
        "revocationRegistry" => RevRegistryConfig::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid revocation-registry state data: {error}")),
        "subnetRegistry" => SubnetRegistryConfig::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid subnet-registry state data: {error}")),
        "emergencyMultisig" => MultisigConfig::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid emergency-multisig state data: {error}")),
        "finalityOracle" => OracleConfig::deserialize_padded(data)
            .map(|state| state.is_initialized)
            .map_err(|error| format!("invalid finality-oracle state data: {error}")),
        other => Err(format!(
            "no canonical state decoder is registered for protocol state {other}"
        )),
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
