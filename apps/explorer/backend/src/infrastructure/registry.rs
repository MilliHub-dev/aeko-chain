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
        sync::{Mutex, OnceLock},
        time::{Duration, Instant},
    },
    url::Url,
};

const SOCIAL_REGISTRY_FILE_ENV: &str = "AEKO_SOCIAL_REGISTRY_FILE";
const PROTOCOL_REGISTRY_FILE_ENV: &str = "AEKO_PROTOCOL_REGISTRY_FILE";
const REGISTRY_FETCH_TIMEOUT_ENV: &str = "AEKO_REGISTRY_FETCH_TIMEOUT_SECS";
const REGISTRY_CACHE_TTL_ENV: &str = "AEKO_REGISTRY_CACHE_TTL_SECS";
const DEFAULT_REGISTRY_FETCH_TIMEOUT_SECS: u64 = 5;
const DEFAULT_REGISTRY_CACHE_TTL_SECS: u64 = 30;
const MAX_REGISTRY_BYTES: usize = 64 * 1024;

#[derive(Clone)]
struct CachedRegistry {
    values: HashMap<String, String>,
    refreshed_at: Instant,
}

static REMOTE_REGISTRY_CACHE: OnceLock<Mutex<HashMap<String, CachedRegistry>>> = OnceLock::new();

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
    let file_values = load_registry_source(SOCIAL_REGISTRY_FILE_ENV, RegistryKind::Social, "SocialFi");
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
        && rewards_treasury.is_some()
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
    let file_values = load_registry_source(PROTOCOL_REGISTRY_FILE_ENV, RegistryKind::Protocol, "protocol");
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

#[derive(Clone, Copy)]
enum RegistryKind {
    Social,
    Protocol,
}

impl RegistryKind {
    fn suffix(self) -> &'static str {
        match self {
            Self::Social => "SOCIAL_REGISTRY_URL",
            Self::Protocol => "PROTOCOL_REGISTRY_URL",
        }
    }
}

fn registry_url_env_name(network: &str, kind: RegistryKind) -> Option<String> {
    let prefix = match network {
        "testnet" => "AEKO_TESTNET",
        "mainnet" => "AEKO_MAINNET",
        "localnet" => "AEKO_LOCALNET",
        _ => return None,
    };
    Some(format!("{prefix}_{}", kind.suffix()))
}

fn configured_registry_url(kind: RegistryKind) -> Option<(String, String)> {
    let network = env::var("AEKO_EXPLORER_NETWORK")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())?;
    let env_name = registry_url_env_name(&network, kind)?;
    let url = env::var(&env_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    Some((network, url))
}

fn load_registry_source(
    file_env_name: &str,
    kind: RegistryKind,
    label: &str,
) -> HashMap<String, String> {
    if let Some((network, url)) = configured_registry_url(kind) {
        return load_registry_url(&network, &url, label);
    }
    load_registry_file(file_env_name, label)
}

fn load_registry_url(network: &str, url: &str, label: &str) -> HashMap<String, String> {
    if let Err(error) = validate_registry_url(network, url) {
        tracing::warn!(network, url, label, error = %error, "invalid bootstrap registry URL");
        return HashMap::new();
    }

    let ttl = duration_env(
        REGISTRY_CACHE_TTL_ENV,
        DEFAULT_REGISTRY_CACHE_TTL_SECS,
    );
    let timeout = duration_env(
        REGISTRY_FETCH_TIMEOUT_ENV,
        DEFAULT_REGISTRY_FETCH_TIMEOUT_SECS,
    );

    let cache = REMOTE_REGISTRY_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let stale = {
        let cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        cache.get(url).cloned()
    };
    if let Some(entry) = stale.as_ref() {
        if entry.refreshed_at.elapsed() < ttl {
            return entry.values.clone();
        }
    }

    match fetch_registry_url(url, timeout) {
        Ok(values) => {
            let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            cache.insert(
                url.to_string(),
                CachedRegistry {
                    values: values.clone(),
                    refreshed_at: Instant::now(),
                },
            );
            values
        }
        Err(error) => {
            tracing::warn!(
                network,
                url,
                label,
                error = %error,
                "unable to refresh bootstrap registry URL"
            );
            if let Some(mut entry) = stale {
                // Keep a known-good registry available through transient network
                // failures without retrying on every indexed slot.
                entry.refreshed_at = Instant::now();
                let values = entry.values.clone();
                let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                cache.insert(url.to_string(), entry);
                values
            } else {
                let mut cache = cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                cache.insert(
                    url.to_string(),
                    CachedRegistry {
                        values: HashMap::new(),
                        refreshed_at: Instant::now(),
                    },
                );
                HashMap::new()
            }
        }
    }
}

fn validate_registry_url(network: &str, value: &str) -> Result<(), String> {
    let parsed = Url::parse(value).map_err(|error| error.to_string())?;
    match (network, parsed.scheme()) {
        ("testnet" | "mainnet", "https") => Ok(()),
        ("localnet", "http" | "https") => Ok(()),
        ("testnet" | "mainnet", scheme) => Err(format!(
            "{network} bootstrap registry URL must use https, got {scheme}"
        )),
        ("localnet", scheme) => Err(format!(
            "localnet bootstrap registry URL must use http or https, got {scheme}"
        )),
        _ => Err(format!("unsupported AEKO Explorer network {network:?}")),
    }
}

fn fetch_registry_url(url: &str, timeout: Duration) -> Result<HashMap<String, String>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| error.to_string())?;
    if let Some(length) = response.content_length() {
        if length > MAX_REGISTRY_BYTES as u64 {
            return Err(format!("bootstrap registry response is too large: {length} bytes"));
        }
    }
    let body = response.bytes().map_err(|error| error.to_string())?;
    if body.len() > MAX_REGISTRY_BYTES {
        return Err(format!(
            "bootstrap registry response is too large: {} bytes",
            body.len()
        ));
    }
    let text = std::str::from_utf8(&body).map_err(|error| error.to_string())?;
    Ok(parse_registry_env(text))
}

fn duration_env(name: &str, default_secs: u64) -> Duration {
    let seconds = env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_secs);
    Duration::from_secs(seconds)
}

fn read_value(key: &str, file_values: &HashMap<String, String>) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| file_values.get(key).cloned())
}

fn bootstrap_marker_exists(env_name: &str) -> bool {
    let kind = match env_name {
        SOCIAL_REGISTRY_FILE_ENV => RegistryKind::Social,
        PROTOCOL_REGISTRY_FILE_ENV => RegistryKind::Protocol,
        _ => return false,
    };
    // The remote registry service only starts after both one-shot bootstraps
    // complete, so an active URL source cannot represent an in-progress marker.
    if configured_registry_url(kind).is_some() {
        return false;
    }
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
            expected_missing_registry, fetch_registry_url, parse_registry_env,
            registry_url_env_name, validate_registry_url, RegistryKind,
            PROTOCOL_REGISTRY_FILE_ENV, SOCIAL_REGISTRY_FILE_ENV,
        },
        std::{
            io::{Error, ErrorKind, Read, Write},
            net::TcpListener,
            thread,
            time::Duration,
        },
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
    fn registry_url_names_are_network_scoped() {
        assert_eq!(
            registry_url_env_name("testnet", RegistryKind::Social).as_deref(),
            Some("AEKO_TESTNET_SOCIAL_REGISTRY_URL")
        );
        assert_eq!(
            registry_url_env_name("mainnet", RegistryKind::Protocol).as_deref(),
            Some("AEKO_MAINNET_PROTOCOL_REGISTRY_URL")
        );
        assert_eq!(
            registry_url_env_name("localnet", RegistryKind::Social).as_deref(),
            Some("AEKO_LOCALNET_SOCIAL_REGISTRY_URL")
        );
        assert!(registry_url_env_name("devnet", RegistryKind::Social).is_none());
    }

    #[test]
    fn public_registry_urls_require_https() {
        assert!(validate_registry_url(
            "testnet",
            "https://bootstrap.aeko.online/social-registry.env"
        )
        .is_ok());
        assert!(validate_registry_url(
            "testnet",
            "http://bootstrap.aeko.online/social-registry.env"
        )
        .is_err());
        assert!(validate_registry_url(
            "localnet",
            "http://127.0.0.1:8080/social-registry.env"
        )
        .is_ok());
    }

    #[test]
    fn remote_registry_fetch_reads_env_payload() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 1024];
            let _ = stream.read(&mut request).unwrap();
            let body = "AEKO_REGISTRY_SCHEMA_VERSION=2\nAEKO_CHAIN_GENESIS_HASH=genesis-remote\n";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });

        let values = fetch_registry_url(
            &format!("http://{address}/social-registry.env"),
            Duration::from_secs(2),
        )
        .unwrap();
        server.join().unwrap();

        assert_eq!(
            values.get("AEKO_CHAIN_GENESIS_HASH").map(String::as_str),
            Some("genesis-remote")
        );
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
