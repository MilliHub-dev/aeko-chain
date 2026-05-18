//! `/registry/social` — operator-published lookup for the on-chain state
//! accounts created by `aeko-social-bootstrap`.
//!
//! Why this exists:
//!   The frontend used to discover state accounts by calling
//!   `getProgramAccounts(programId)` on the validator RPC. That works on a
//!   local cluster, but the public production RPC throttles or outright
//!   disables `getProgramAccounts` to prevent DoS — so the Mini Feed got
//!   stuck on "No state account on chain yet" even though the bootstrap
//!   service had already printed the accounts in its container log.
//!
//!   This endpoint takes the operator's "I have these accounts" knowledge
//!   (the pubkeys the bootstrap binary prints) and exposes it to the
//!   browser as a simple JSON registry. No `getProgramAccounts` required;
//!   no extra RPC round-trip; works through whatever CDN/proxy the API
//!   already sits behind.
//!
//! Configuration:
//!   Set these env vars on the explorer-backend service (Coolify UI →
//!   Environment Variables tab). All are optional — entries the operator
//!   hasn't published yet come back as `null`, and the frontend falls
//!   back to `getProgramAccounts` (still useful for local dev).
//!
//!     AEKO_SOCIAL_POSTS_STATE
//!     AEKO_SOCIAL_REWARDS_STATE
//!     AEKO_SOCIAL_STAKING_STATE
//!     AEKO_SOCIAL_ANTI_SPAM_STATE
//!     AEKO_SOCIAL_MONETIZATION_STATE
//!     AEKO_REWARD_VAULT_ACCOUNT     (advisory; surfaced for client display)
//!     AEKO_TREASURY_ADDRESS         (advisory)
//!     AEKO_PLATFORM_FEE_BPS         (advisory, integer)

use {
    crate::{error::ApiResult, response, state::SharedState},
    axum::{extract::State, routing::get, Json, Router},
    serde::Serialize,
    std::env,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialRegistry {
    pub posts: Option<String>,
    pub rewards: Option<String>,
    pub staking: Option<String>,
    pub anti_spam: Option<String>,
    pub monetization: Option<String>,
    pub reward_vault: Option<String>,
    pub treasury: Option<String>,
    pub platform_fee_bps: Option<u32>,
    /// True iff every primary state account env var is set. Frontend can
    /// use this to know whether to trust the registry as authoritative
    /// without falling back to RPC discovery.
    pub complete: bool,
}

pub fn router() -> Router<SharedState> {
    Router::new().route("/registry/social", get(get_social_registry))
}

async fn get_social_registry(
    State(state): State<SharedState>,
) -> ApiResult<Json<response::DataEnvelope<SocialRegistry>>> {
    // Empty / whitespace-only values are treated as unset so an operator
    // can clear a previously-set entry without redeploying.
    fn read(key: &str) -> Option<String> {
        env::var(key).ok().and_then(|v| {
            let trimmed = v.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
    }

    let posts = read("AEKO_SOCIAL_POSTS_STATE");
    let rewards = read("AEKO_SOCIAL_REWARDS_STATE");
    let staking = read("AEKO_SOCIAL_STAKING_STATE");
    let anti_spam = read("AEKO_SOCIAL_ANTI_SPAM_STATE");
    let monetization = read("AEKO_SOCIAL_MONETIZATION_STATE");
    let complete = posts.is_some()
        && rewards.is_some()
        && staking.is_some()
        && anti_spam.is_some()
        && monetization.is_some();

    let registry = SocialRegistry {
        posts,
        rewards,
        staking,
        anti_spam,
        monetization,
        reward_vault: read("AEKO_REWARD_VAULT_ACCOUNT"),
        treasury: read("AEKO_TREASURY_ADDRESS"),
        platform_fee_bps: read("AEKO_PLATFORM_FEE_BPS").and_then(|s| s.parse().ok()),
        complete,
    };

    Ok(response::data(&state.network, registry))
}
