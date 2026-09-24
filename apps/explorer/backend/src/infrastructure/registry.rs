//! Canonical bootstrap registry resolution.
//!
//! Explicit operator environment variables take precedence over registry files
//! produced by the one-shot bootstrap services. These files describe canonical
//! on-chain addresses; they are configuration discovery, not application state.

use {
    serde::Serialize,
    std::{
        collections::{BTreeMap, HashMap},
        env, fs,
        io::ErrorKind,
    },
};

const SOCIAL_REGISTRY_FILE_ENV: &str = "AEKO_SOCIAL_REGISTRY_FILE";
const PROTOCOL_REGISTRY_FILE_ENV: &str = "AEKO_PROTOCOL_REGISTRY_FILE";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialRegistry {
    pub schema_version: Option<u32>,
    pub genesis_hash: Option<String>,
    pub bootstrap_in_progress: bool,
    pub posts: Option<String>,
    pub rewards: Option<String>,
    pub staking: Option<String>,
    pub anti_spam: Option<String>,
    pub monetization: Option<String>,
    pub rewards_treasury: Option<String>,
    pub reward_vault: Option<String>,
    pub stake_vault: Option<String>,
    pub stake_reward_vault: Option<String>,
    pub treasury: Option<String>,
    pub platform_fee_bps: Option<u32>,
    pub complete: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolRegistry {
    pub schema_version: Option<u32>,
    pub genesis_hash: Option<String>,
    pub bootstrap_in_progress: bool,
    pub authority: Option<String>,
    pub token_programs_feature: Option<String>,
    pub token_programs_feature_activated_at: Option<u64>,
    pub permission_layer_feature: Option<String>,
    pub permission_layer_feature_activated_at: Option<u64>,
    pub programs: BTreeMap<String, String>,
    pub states: BTreeMap<String, String>,
    pub accounts: BTreeMap<String, String>,
    pub complete: bool,
}

pub fn resolve_social_registry() -> SocialRegistry {
    let file_values = load_registry_file(SOCIAL_REGISTRY_FILE_ENV, "SocialFi");
    let read = |key: &str| read_value(key, &file_values);
    let schema_version = read("AEKO_REGISTRY_SCHEMA_VERSION").and_then(|value| value.parse().ok());
    let genesis_hash = read("AEKO_CHAIN_GENESIS_HASH");
    let bootstrap_in_progress = bootstrap_marker_exists(SOCIAL_REGISTRY_FILE_ENV);
    let posts = read("AEKO_SOCIAL_POSTS_STATE");
    let rewards = read("AEKO_SOCIAL_REWARDS_STATE");
    let staking = read("AEKO_SOCIAL_STAKING_STATE");
    let anti_spam = read("AEKO_SOCIAL_ANTI_SPAM_STATE");
    let monetization = read("AEKO_SOCIAL_MONETIZATION_STATE");
    let rewards_treasury = read("AEKO_REWARDS_TREASURY_ACCOUNT");
    let reward_vault = read("AEKO_REWARD_VAULT_ACCOUNT");
    let stake_vault = read("AEKO_STAKE_VAULT_ACCOUNT");
    let stake_reward_vault = read("AEKO_STAKE_REWARD_VAULT_ACCOUNT");
    let treasury = read("AEKO_TREASURY_ADDRESS");
    let complete = posts.is_some()
        && rewards.is_some()
        && staking.is_some()
        && anti_spam.is_some()
        && monetization.is_some()
        && reward_vault.is_some()
        && stake_vault.is_some()
        && stake_reward_vault.is_some()
        && treasury.is_some();
    SocialRegistry {
        schema_version,
        genesis_hash,
        bootstrap_in_progress,
        posts,
        rewards,
        staking,
        anti_spam,
        monetization,
        rewards_treasury,
        reward_vault,
        stake_vault,
        stake_reward_vault,
        treasury,
        platform_fee_bps: read("AEKO_PLATFORM_FEE_BPS").and_then(|value| value.parse().ok()),
        complete,
    }
}

pub fn resolve_protocol_registry() -> ProtocolRegistry {
    let file_values = load_registry_file(PROTOCOL_REGISTRY_FILE_ENV, "protocol");
    let read = |key: &str| read_value(key, &file_values);

    let schema_version = read("AEKO_REGISTRY_SCHEMA_VERSION").and_then(|value| value.parse().ok());
    let genesis_hash = read("AEKO_CHAIN_GENESIS_HASH");
    let bootstrap_in_progress = bootstrap_marker_exists(PROTOCOL_REGISTRY_FILE_ENV);
    let authority = read("AEKO_PROTOCOL_AUTHORITY");
    let token_programs_feature = read("AEKO_TOKEN_PROGRAMS_FEATURE");
    let token_programs_feature_activated_at = read("AEKO_TOKEN_PROGRAMS_FEATURE_ACTIVATED_AT")
        .and_then(|value| value.parse::<u64>().ok());
    let permission_layer_feature = read("AEKO_PERMISSION_LAYER_FEATURE");
    let permission_layer_feature_activated_at = read("AEKO_PERMISSION_LAYER_FEATURE_ACTIVATED_AT")
        .and_then(|value| value.parse::<u64>().ok());

    let programs = collect_values(
        &read,
        &[
            ("tokenomics", "AEKO_TOKENOMICS_PROGRAM_ID"),
            ("token20", "AEKO_TOKEN_20_PROGRAM_ID"),
            ("publicMint", "AEKO_PUBLIC_MINT_PROGRAM_ID"),
            ("token721", "AEKO_TOKEN_721_PROGRAM_ID"),
            ("nftMarketplace", "AEKO_NFT_MARKETPLACE_PROGRAM_ID"),
            ("walletPermissions", "AEKO_WALLET_PERMISSIONS_PROGRAM_ID"),
            ("permissionRegistry", "AEKO_PERMISSION_REGISTRY_PROGRAM_ID"),
            ("revocationRegistry", "AEKO_REVOCATION_REGISTRY_PROGRAM_ID"),
            ("subnetRegistry", "AEKO_SUBNET_REGISTRY_PROGRAM_ID"),
            ("emergencyMultisig", "AEKO_EMERGENCY_MULTISIG_PROGRAM_ID"),
            ("finalityOracle", "AEKO_FINALITY_ORACLE_PROGRAM_ID"),
        ],
    );
    let states = collect_values(
        &read,
        &[
            ("tokenomics", "AEKO_TOKENOMICS_STATE"),
            ("referenceMint", "AEKO_AEKO20_REFERENCE_MINT"),
            ("publicMint", "AEKO_PUBLIC_MINT_STATE"),
            ("permissionRegistry", "AEKO_PERMISSION_REGISTRY_STATE"),
            ("revocationRegistry", "AEKO_REVOCATION_REGISTRY_STATE"),
            ("subnetRegistry", "AEKO_SUBNET_REGISTRY_STATE"),
            ("emergencyMultisig", "AEKO_EMERGENCY_MULTISIG_STATE"),
            ("finalityOracle", "AEKO_FINALITY_ORACLE_STATE"),
        ],
    );
    let accounts = collect_values(
        &read,
        &[
            ("tokenomicsTreasury", "AEKO_TOKENOMICS_TREASURY_ACCOUNT"),
            ("validatorRewards", "AEKO_VALIDATOR_REWARDS_ACCOUNT"),
            ("communityRewards", "AEKO_COMMUNITY_REWARDS_ACCOUNT"),
        ],
    );

    let complete = authority.is_some()
        && token_programs_feature.is_some()
        && token_programs_feature_activated_at.is_some()
        && permission_layer_feature.is_some()
        && permission_layer_feature_activated_at.is_some()
        && programs.len() == 11
        && states.len() == 8
        && accounts.len() == 3;

    ProtocolRegistry {
        schema_version,
        genesis_hash,
        bootstrap_in_progress,
        authority,
        token_programs_feature,
        token_programs_feature_activated_at,
        permission_layer_feature,
        permission_layer_feature_activated_at,
        programs,
        states,
        accounts,
        complete,
    }
}

fn collect_values<F>(read: &F, entries: &[(&str, &str)]) -> BTreeMap<String, String>
where
    F: Fn(&str) -> Option<String>,
{
    entries
        .iter()
        .filter_map(|(label, env_key)| read(env_key).map(|value| ((*label).to_string(), value)))
        .collect()
}

fn read_value(key: &str, file_values: &HashMap<String, String>) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| file_values.get(key).cloned())
}

fn bootstrap_marker_exists(env_name: &str) -> bool {
    let Some(path) = env::var(env_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return false;
    };
    let Some(parent) = std::path::Path::new(&path).parent() else {
        return false;
    };
    parent.join(".aeko-bootstrap-in-progress").is_file()
}

fn load_registry_file(env_name: &str, label: &str) -> HashMap<String, String> {
    let Some(path) = env::var(env_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return HashMap::new();
    };
    match fs::read_to_string(&path) {
        Ok(content) => parse_registry_env(&content),
        Err(error) if expected_missing_registry(env_name, &error) => {
            tracing::debug!(
                path,
                env_name,
                label,
                "protocol registry file is not present yet"
            );
            HashMap::new()
        }
        Err(error) => {
            tracing::warn!(path, env_name, label, error = %error, "unable to read bootstrap registry file");
            HashMap::new()
        }
    }
}

fn expected_missing_registry(env_name: &str, error: &std::io::Error) -> bool {
    env_name == PROTOCOL_REGISTRY_FILE_ENV && error.kind() == ErrorKind::NotFound
}

fn parse_registry_env(content: &str) -> HashMap<String, String> {
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let line = line.strip_prefix("export ").unwrap_or(line);
            let (key, value) = line.split_once('=')?;
            let key = key.trim();
            let value = value.trim();
            if key.is_empty() || value.is_empty() {
                return None;
            }
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use {
        super::{
            expected_missing_registry, parse_registry_env, PROTOCOL_REGISTRY_FILE_ENV,
            SOCIAL_REGISTRY_FILE_ENV,
        },
        std::io::{Error, ErrorKind},
    };

    #[test]
    fn missing_protocol_registry_is_expected_only_for_not_found() {
        let missing = Error::from(ErrorKind::NotFound);
        assert!(expected_missing_registry(
            PROTOCOL_REGISTRY_FILE_ENV,
            &missing
        ));
        assert!(!expected_missing_registry(
            SOCIAL_REGISTRY_FILE_ENV,
            &missing
        ));

        let denied = Error::from(ErrorKind::PermissionDenied);
        assert!(!expected_missing_registry(
            PROTOCOL_REGISTRY_FILE_ENV,
            &denied
        ));
    }

    #[test]
    fn registry_parser_accepts_both_bootstrap_formats_and_ignores_empty_values() {
        let values = parse_registry_env(
            "# generated\nAEKO_REGISTRY_SCHEMA_VERSION=2\nAEKO_CHAIN_GENESIS_HASH=genesis111\nAEKO_SOCIAL_POSTS_STATE=posts111\nAEKO_TOKENOMICS_STATE=tokenomics111\nexport AEKO_SOCIAL_REWARDS_STATE=rewards222\nEMPTY=\n",
        );
        assert_eq!(
            values
                .get("AEKO_REGISTRY_SCHEMA_VERSION")
                .map(String::as_str),
            Some("2")
        );
        assert_eq!(
            values.get("AEKO_CHAIN_GENESIS_HASH").map(String::as_str),
            Some("genesis111")
        );
        assert_eq!(
            values.get("AEKO_SOCIAL_POSTS_STATE").map(String::as_str),
            Some("posts111")
        );
        assert_eq!(
            values.get("AEKO_TOKENOMICS_STATE").map(String::as_str),
            Some("tokenomics111")
        );
        assert!(!values.contains_key("EMPTY"));
    }
}
