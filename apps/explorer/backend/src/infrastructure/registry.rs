//! Canonical SocialFi state-account registry resolution.
//!
//! Explicit operator environment variables take precedence over the registry
//! file produced by `aeko-social-bootstrap`. This is configuration discovery,
//! not application state; no in-memory persistence is involved.

use {serde::Serialize, std::{collections::HashMap, env, fs}};

const REGISTRY_FILE_ENV: &str = "AEKO_SOCIAL_REGISTRY_FILE";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialRegistry {
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

pub fn resolve_social_registry() -> SocialRegistry {
    let file_values = load_registry_file();
    let read = |key: &str| read_value(key, &file_values);
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
    let complete = posts.is_some() && rewards.is_some() && staking.is_some() && anti_spam.is_some()
        && monetization.is_some() && reward_vault.is_some() && stake_vault.is_some()
        && stake_reward_vault.is_some() && treasury.is_some();
    SocialRegistry {
        posts, rewards, staking, anti_spam, monetization,
        rewards_treasury, reward_vault, stake_vault, stake_reward_vault, treasury,
        platform_fee_bps: read("AEKO_PLATFORM_FEE_BPS").and_then(|value| value.parse().ok()),
        complete,
    }
}

fn read_value(key: &str, file_values: &HashMap<String, String>) -> Option<String> {
    env::var(key).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()).or_else(|| file_values.get(key).cloned())
}

fn load_registry_file() -> HashMap<String, String> {
    let Some(path) = env::var(REGISTRY_FILE_ENV).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) else { return HashMap::new(); };
    match fs::read_to_string(&path) {
        Ok(content) => parse_registry_env(&content),
        Err(error) => { tracing::warn!(path, error = %error, "unable to read SocialFi registry file"); HashMap::new() }
    }
}

fn parse_registry_env(content: &str) -> HashMap<String, String> {
    content.lines().filter_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { return None; }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let (key, value) = line.split_once('=')?;
        let key = key.trim(); let value = value.trim();
        if key.is_empty() || value.is_empty() { return None; }
        Some((key.to_string(), value.to_string()))
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::parse_registry_env;
    #[test]
    fn registry_parser_accepts_bootstrap_format_and_ignores_empty_values() {
        let values = parse_registry_env("# generated\nAEKO_SOCIAL_POSTS_STATE=posts111\nAEKO_STAKE_VAULT_ACCOUNT=stake333\nexport AEKO_SOCIAL_REWARDS_STATE=rewards222\nEMPTY=\n");
        assert_eq!(values.get("AEKO_SOCIAL_POSTS_STATE").map(String::as_str), Some("posts111"));
        assert_eq!(values.get("AEKO_STAKE_VAULT_ACCOUNT").map(String::as_str), Some("stake333"));
        assert!(!values.contains_key("EMPTY"));
    }
}
