//! Production SocialFi chain source backed by the canonical bootstrap registry.
//!
//! The public AEKO RPC may throttle or disable `getProgramAccounts`. SocialFi
//! already has exactly one canonical state account per native program, written
//! by `aeko-social-bootstrap` into the shared registry. This source delegates
//! ordinary chain/indexer reads to `RpcChainDataSource` but reads SocialFi state
//! directly with `getAccountInfo`, verifies the expected program owner, and
//! decodes the padded Borsh state before projecting it into Explorer records.

use {
    crate::{
        api::registry::resolve_social_registry,
        indexer::{ChainDataSource, RpcChainDataSource},
        models::{
            BlockRecord, CreatorRewardRecord, EngagementRecord, NftRecord, SocialPostRecord,
            SocialStakeRecord, TokenTransferRecord, TransactionRecord, WalletProfileRecord,
        },
    },
    anyhow::{anyhow, Context, Result},
    aeko_sdk::pubkey::Pubkey,
    aeko_social_anti_spam_program::state::{AntiSpamProfile, SocialAntiSpamStateAccount},
    aeko_social_posts_program::state::SocialPostsStateAccount,
    aeko_social_rewards_program::state::SocialRewardsStateAccount,
    aeko_social_staking_program::state::SocialStakingStateAccount,
    base64::{prelude::BASE64_STANDARD, Engine},
    borsh::BorshDeserialize,
    reqwest::blocking::Client,
    serde_json::{json, Value},
    std::collections::HashMap,
};

#[derive(Clone)]
pub struct CanonicalSocialChainDataSource {
    inner: RpcChainDataSource,
    client: Client,
}

impl CanonicalSocialChainDataSource {
    pub fn new(inner: RpcChainDataSource) -> Self {
        Self {
            inner,
            client: Client::new(),
        }
    }

    fn fetch_owned_state<T: BorshDeserialize>(
        &self,
        address: Option<&str>,
        expected_owner: Pubkey,
        label: &str,
    ) -> Result<T> {
        let address = address.ok_or_else(|| {
            anyhow!(
                "{label} state is missing from the canonical SocialFi registry; social-bootstrap has not completed successfully"
            )
        })?;
        let response = self
            .client
            .post(&self.inner.config.rpc_url)
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1u64,
                "method": "getAccountInfo",
                "params": [address, {"commitment": "confirmed", "encoding": "base64"}],
            }))
            .send()
            .with_context(|| format!("reading canonical {label} state account {address}"))?
            .error_for_status()
            .with_context(|| format!("RPC HTTP error while reading canonical {label} state"))?
            .json::<Value>()
            .with_context(|| format!("decoding canonical {label} getAccountInfo response"))?;

        if let Some(error) = response.get("error") {
            return Err(anyhow!("RPC getAccountInfo failed for {label} state {address}: {error}"));
        }
        let value = response
            .pointer("/result/value")
            .filter(|value| !value.is_null())
            .ok_or_else(|| anyhow!("canonical {label} state account {address} does not exist"))?;
        let owner = value
            .get("owner")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("canonical {label} state response has no owner"))?;
        if owner != expected_owner.to_string() {
            return Err(anyhow!(
                "canonical {label} state owner mismatch: expected {expected_owner}, got {owner}"
            ));
        }
        let encoded = value
            .get("data")
            .and_then(Value::as_array)
            .and_then(|data| data.first())
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("canonical {label} state response has no base64 account data"))?;
        let raw = BASE64_STANDARD
            .decode(encoded)
            .with_context(|| format!("decoding canonical {label} state base64"))?;
        let end = raw
            .iter()
            .rposition(|byte| *byte != 0)
            .map(|index| index + 1)
            .unwrap_or(0);
        T::try_from_slice(&raw[..end])
            .with_context(|| format!("decoding canonical {label} padded Borsh state"))
    }

    fn posts_state(&self) -> Result<SocialPostsStateAccount> {
        let registry = resolve_social_registry();
        self.fetch_owned_state(
            registry.posts.as_deref(),
            aeko_social_posts_program::id(),
            "social-posts",
        )
    }

    fn rewards_state(&self) -> Result<SocialRewardsStateAccount> {
        let registry = resolve_social_registry();
        self.fetch_owned_state(
            registry.rewards.as_deref(),
            aeko_social_rewards_program::id(),
            "social-rewards",
        )
    }

    fn staking_state(&self) -> Result<SocialStakingStateAccount> {
        let registry = resolve_social_registry();
        self.fetch_owned_state(
            registry.staking.as_deref(),
            aeko_social_staking_program::id(),
            "social-staking",
        )
    }

    fn anti_spam_state(&self) -> Result<SocialAntiSpamStateAccount> {
        let registry = resolve_social_registry();
        self.fetch_owned_state(
            registry.anti_spam.as_deref(),
            aeko_social_anti_spam_program::id(),
            "social-anti-spam",
        )
    }
}

impl ChainDataSource for CanonicalSocialChainDataSource {
    fn latest_slot(&self) -> Result<u64> {
        self.inner.latest_slot()
    }

    fn fetch_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        self.inner.fetch_block(slot)
    }

    fn fetch_transactions(&self, slot: u64) -> Result<Vec<TransactionRecord>> {
        self.inner.fetch_transactions(slot)
    }

    fn fetch_token_transfers(&self, slot: u64) -> Result<Vec<TokenTransferRecord>> {
        self.inner.fetch_token_transfers(slot)
    }

    fn fetch_nft_updates(&self, slot: u64) -> Result<Vec<NftRecord>> {
        self.inner.fetch_nft_updates(slot)
    }

    fn fetch_social_posts(&self, _slot: u64) -> Result<Vec<SocialPostRecord>> {
        let state = self.posts_state()?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-posts state is not initialized"));
        }
        Ok(state
            .posts
            .into_iter()
            .map(|post| SocialPostRecord {
                post_id: bs58::encode(post.post_id).into_string(),
                creator: post.creator.to_string(),
                content_uri: post.content_uri,
                post_kind: format!("{:?}", post.post_kind).to_lowercase(),
                visibility: format!("{:?}", post.visibility)
                    .replace("Only", "-only")
                    .replace("By", "-by")
                    .to_lowercase(),
                moderation_state: format!("{:?}", post.moderation_state)
                    .replace("By", "-by")
                    .replace("Protocol", "-protocol")
                    .to_lowercase(),
                created_at_unix: post.created_at_unix,
            })
            .collect())
    }

    fn fetch_creator_rewards(&self, _slot: u64) -> Result<Vec<CreatorRewardRecord>> {
        let state = self.rewards_state()?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-rewards state is not initialized"));
        }
        Ok(state
            .epochs
            .into_iter()
            .map(|epoch| CreatorRewardRecord {
                creator: epoch.creator.to_string(),
                epoch: epoch.epoch,
                reward_amount: epoch.reward_amount,
                claimable_amount: epoch.reward_amount.saturating_sub(epoch.claimed_amount),
            })
            .collect())
    }

    fn fetch_engagement_events(&self, _slot: u64) -> Result<Vec<EngagementRecord>> {
        let state = self.posts_state()?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-posts state is not initialized"));
        }
        Ok(state
            .engagement_proofs
            .into_iter()
            .map(|proof| EngagementRecord {
                proof_id: bs58::encode(proof.proof_id).into_string(),
                actor: proof.actor.to_string(),
                target_creator: proof.target_creator.to_string(),
                target_post_id: proof
                    .target_post_id
                    .map(|post_id| bs58::encode(post_id).into_string()),
                action_kind: format!("{:?}", proof.action_kind).to_lowercase(),
                action_weight: proof.action_weight,
                slot: proof.slot,
                unix_timestamp: proof.unix_timestamp,
            })
            .collect())
    }

    fn fetch_social_stakes(&self, _slot: u64) -> Result<Vec<SocialStakeRecord>> {
        let state = self.staking_state()?;
        if !state.is_initialized {
            return Err(anyhow!("canonical social-staking state is not initialized"));
        }
        Ok(state
            .positions
            .into_iter()
            .map(|position| SocialStakeRecord {
                position_id: bs58::encode(position.position_id).into_string(),
                staker: position.staker.to_string(),
                creator: position.creator.to_string(),
                staked_amount: position.staked_amount,
                state: format!("{:?}", position.state)
                    .replace("Down", "-down")
                    .to_lowercase(),
                accumulated_yield: position.accumulated_yield,
                claimed_yield: position.claimed_yield,
            })
            .collect())
    }

    fn fetch_wallet_profiles(&self, slot: u64) -> Result<Vec<WalletProfileRecord>> {
        let anti_spam_state = self.anti_spam_state()?;
        let posts_state = self.posts_state()?;
        let staking_state = self.staking_state()?;
        let token_accounts = self.inner.fetch_token_transfers(slot)?;
        let nft_tokens = self.inner.fetch_nft_updates(slot)?;
        let mut profiles = HashMap::<String, WalletProfileRecord>::new();

        for profile in anti_spam_state.profiles {
            profiles.insert(
                profile.wallet.to_string(),
                WalletProfileRecord {
                    address: profile.wallet.to_string(),
                    reputation_score: Some(anti_spam_profile_score(
                        &profile,
                        anti_spam_state.config.cooldown_epochs,
                    )),
                    native_balance: None,
                    token_count: 0,
                    nft_count: 0,
                },
            );
        }

        for post in posts_state.posts {
            profiles
                .entry(post.creator.to_string())
                .or_insert_with(|| empty_profile(post.creator.to_string()));
        }

        for position in staking_state.positions {
            profiles
                .entry(position.staker.to_string())
                .or_insert_with(|| empty_profile(position.staker.to_string()));
            profiles
                .entry(position.creator.to_string())
                .or_insert_with(|| empty_profile(position.creator.to_string()));
        }

        for token in token_accounts {
            let entry = profiles
                .entry(token.destination.clone())
                .or_insert_with(|| empty_profile(token.destination));
            entry.token_count = entry.token_count.saturating_add(1);
        }

        for nft in nft_tokens {
            let entry = profiles
                .entry(nft.owner.clone())
                .or_insert_with(|| empty_profile(nft.owner));
            entry.nft_count = entry.nft_count.saturating_add(1);
        }

        Ok(profiles.into_values().collect())
    }
}

fn empty_profile(address: String) -> WalletProfileRecord {
    WalletProfileRecord {
        address,
        reputation_score: None,
        native_balance: None,
        token_count: 0,
        nft_count: 0,
    }
}

fn anti_spam_profile_score(profile: &AntiSpamProfile, cooldown_epochs: u64) -> u16 {
    let spam_penalty = u32::from(profile.spam_flags).saturating_mul(50);
    let slash_penalty = u32::from(profile.slash_count).saturating_mul(150);
    let gated_penalty = if profile
        .gated_until_epoch
        .is_some_and(|gated_until_epoch| gated_until_epoch >= cooldown_epochs)
    {
        250
    } else {
        0
    };
    let total_penalty = spam_penalty
        .saturating_add(slash_penalty)
        .saturating_add(gated_penalty)
        .min(1_000);
    (1_000u32.saturating_sub(total_penalty)) as u16
}
