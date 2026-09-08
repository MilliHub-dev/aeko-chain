//! Live verification for every native AEKO SocialFi state account.
//!
//! This endpoint is intentionally separate from the durable indexer views.
//! It resolves the bootstrap registry, reads each state account from the
//! configured RPC, verifies program ownership, decodes the canonical Borsh
//! state, and returns compact metrics. The response metadata is marked
//! `rpc-live` so consumers never confuse this with an indexed snapshot.

use {
    crate::{
        api::registry::resolve_social_registry,
        config::ExplorerBackendConfig,
        error::{ApiError, ApiResult},
        response::{self, DataEnvelope},
        state::SharedState,
    },
    anyhow::{anyhow, Context, Result},
    axum::{extract::State, routing::get, Json, Router},
    base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _},
    serde::Serialize,
    serde_json::{json, Value},
    std::collections::BTreeMap,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialFiStatus {
    pub complete: bool,
    pub domains: BTreeMap<String, SocialDomainStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialDomainStatus {
    pub state_account: Option<String>,
    pub program_id: String,
    pub owner_matches: bool,
    pub initialized: bool,
    pub metrics: Value,
    pub error: Option<String>,
}

pub fn router() -> Router<SharedState> {
    Router::new().route("/social/status", get(get_social_status))
}

async fn get_social_status(
    State(state): State<SharedState>,
) -> ApiResult<Json<DataEnvelope<SocialFiStatus>>> {
    let config = ExplorerBackendConfig::from_env().map_err(ApiError::Internal)?;
    let registry = resolve_social_registry();
    let client = reqwest::Client::new();

    let mut domains = BTreeMap::new();
    domains.insert(
        "posts".to_string(),
        inspect_domain(
            &client,
            &config.rpc_url,
            registry.posts,
            aeko_social_posts_program::id().to_string(),
            summarize_posts,
        )
        .await,
    );
    domains.insert(
        "rewards".to_string(),
        inspect_domain(
            &client,
            &config.rpc_url,
            registry.rewards,
            aeko_social_rewards_program::id().to_string(),
            summarize_rewards,
        )
        .await,
    );
    domains.insert(
        "staking".to_string(),
        inspect_domain(
            &client,
            &config.rpc_url,
            registry.staking,
            aeko_social_staking_program::id().to_string(),
            summarize_staking,
        )
        .await,
    );
    domains.insert(
        "antiSpam".to_string(),
        inspect_domain(
            &client,
            &config.rpc_url,
            registry.anti_spam,
            aeko_social_anti_spam_program::id().to_string(),
            summarize_anti_spam,
        )
        .await,
    );
    domains.insert(
        "monetization".to_string(),
        inspect_domain(
            &client,
            &config.rpc_url,
            registry.monetization,
            aeko_social_monetization_program::id().to_string(),
            summarize_monetization,
        )
        .await,
    );

    let complete = domains
        .values()
        .all(|domain| domain.owner_matches && domain.initialized && domain.error.is_none());

    Ok(response::data_from_source(
        &state.network,
        SocialFiStatus { complete, domains },
        "rpc-live",
    ))
}

async fn inspect_domain(
    client: &reqwest::Client,
    rpc_url: &str,
    state_account: Option<String>,
    program_id: String,
    summarize: fn(&[u8]) -> Result<(bool, Value)>,
) -> SocialDomainStatus {
    let Some(address) = state_account else {
        return SocialDomainStatus {
            state_account: None,
            program_id,
            owner_matches: false,
            initialized: false,
            metrics: json!({}),
            error: Some("state account is missing from the SocialFi registry".to_string()),
        };
    };

    let result = async {
        let (owner, data) = fetch_account(client, rpc_url, &address).await?;
        let owner_matches = owner == program_id;
        if !owner_matches {
            return Err(anyhow!(
                "state owner mismatch: expected {program_id}, got {owner}"
            ));
        }
        let (initialized, metrics) = summarize(&data)?;
        Ok::<_, anyhow::Error>((owner_matches, initialized, metrics))
    }
    .await;

    match result {
        Ok((owner_matches, initialized, metrics)) => SocialDomainStatus {
            state_account: Some(address),
            program_id,
            owner_matches,
            initialized,
            metrics,
            error: None,
        },
        Err(error) => SocialDomainStatus {
            state_account: Some(address),
            program_id,
            owner_matches: false,
            initialized: false,
            metrics: json!({}),
            error: Some(error.to_string()),
        },
    }
}

async fn fetch_account(
    client: &reqwest::Client,
    rpc_url: &str,
    address: &str,
) -> Result<(String, Vec<u8>)> {
    let response = client
        .post(rpc_url)
        .json(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [address, {"commitment": "confirmed", "encoding": "base64"}],
        }))
        .send()
        .await
        .with_context(|| format!("reading {address} from RPC"))?
        .error_for_status()
        .context("SocialFi RPC returned HTTP error")?
        .json::<Value>()
        .await
        .context("decoding SocialFi RPC response")?;

    if let Some(error) = response.get("error") {
        return Err(anyhow!("RPC getAccountInfo failed: {error}"));
    }
    let value = response
        .pointer("/result/value")
        .filter(|value| !value.is_null())
        .ok_or_else(|| anyhow!("state account {address} does not exist"))?;
    let owner = value
        .get("owner")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("state account {address} response has no owner"))?
        .to_string();
    let encoded = value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|data| data.first())
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("state account {address} response has no base64 data"))?;
    let data = BASE64_STANDARD
        .decode(encoded)
        .context("decoding state-account base64")?;
    Ok((owner, data))
}

fn summarize_posts(data: &[u8]) -> Result<(bool, Value)> {
    let state = aeko_social_posts_program::state::SocialPostsStateAccount::deserialize_padded(data)
        .map_err(|error| anyhow!("decoding social-posts state: {error:?}"))?;
    Ok((
        state.is_initialized,
        json!({
            "posts": state.posts.len(),
            "engagements": state.engagement_proofs.len(),
            "postingEnabled": state.config.posting_enabled,
            "engagementEnabled": state.config.engagement_enabled,
        }),
    ))
}

fn summarize_rewards(data: &[u8]) -> Result<(bool, Value)> {
    let state = aeko_social_rewards_program::state::SocialRewardsStateAccount::deserialize_padded(data)
        .map_err(|error| anyhow!("decoding social-rewards state: {error:?}"))?;
    Ok((
        state.is_initialized,
        json!({
            "creators": state.creators.len(),
            "epochs": state.epochs.len(),
            "settlements": state.settlements.len(),
            "rewardsEnabled": state.config.rewards_enabled,
        }),
    ))
}

fn summarize_staking(data: &[u8]) -> Result<(bool, Value)> {
    let state = aeko_social_staking_program::state::SocialStakingStateAccount::deserialize_padded(data)
        .map_err(|error| anyhow!("decoding social-staking state: {error:?}"))?;
    Ok((
        state.is_initialized,
        json!({
            "positions": state.positions.len(),
            "yieldRecords": state.yield_records.len(),
            "stakingEnabled": state.config.staking_enabled,
        }),
    ))
}

fn summarize_anti_spam(data: &[u8]) -> Result<(bool, Value)> {
    let state = aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount::deserialize_padded(data)
        .map_err(|error| anyhow!("decoding social-anti-spam state: {error:?}"))?;
    Ok((
        state.is_initialized,
        json!({
            "profiles": state.profiles.len(),
            "mode": format!("{:?}", state.config.mode),
            "minPostStake": state.config.min_post_stake,
            "minPostReputation": state.config.min_post_reputation,
        }),
    ))
}

fn summarize_monetization(data: &[u8]) -> Result<(bool, Value)> {
    let state = aeko_social_monetization_program::state::SocialMonetizationStateAccount::deserialize_padded(data)
        .map_err(|error| anyhow!("decoding social-monetization state: {error:?}"))?;
    Ok((
        state.is_initialized,
        json!({
            "tips": state.tips.len(),
            "subscriptions": state.subscriptions.len(),
            "unlocks": state.unlocks.len(),
            "revenues": state.revenues.len(),
            "subscriptionsEnabled": state.config.subscriptions_enabled,
            "paidContentEnabled": state.config.paid_content_enabled,
            "platformFeeBps": state.config.platform_fee_bps,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_registry_entry_is_not_complete() {
        let status = SocialDomainStatus {
            state_account: None,
            program_id: "program".to_string(),
            owner_matches: false,
            initialized: false,
            metrics: json!({}),
            error: Some("missing".to_string()),
        };
        assert!(!status.owner_matches);
        assert!(!status.initialized);
        assert!(status.error.is_some());
    }
}
