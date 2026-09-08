use {
    crate::{
        config::ExplorerBackendConfig,
        models::{
            BlockRecord, CreatorRewardRecord, EngagementRecord, NftRecord, SocialPostRecord,
            SocialStakeRecord, TokenTransferRecord, TransactionRecord, WalletProfileRecord,
        },
    },
    anyhow::{Context, Result},
    base64::{prelude::BASE64_STANDARD, Engine},
    borsh::BorshDeserialize,
    reqwest::blocking::Client,
    serde::de::DeserializeOwned,
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    std::collections::HashMap,
    aeko_sdk::pubkey::Pubkey,
    aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount,
    aeko_social_posts_program::state::SocialPostsStateAccount,
    aeko_social_rewards_program::state::SocialRewardsStateAccount,
    aeko_social_staking_program::state::SocialStakingStateAccount,
    aeko_token_20_program::state::Aeko20Account,
    aeko_token_721_program::state::{Aeko721Collection, Aeko721Token},
};

pub trait ChainDataSource: Send + Sync {
    fn latest_slot(&self) -> Result<u64>;
    fn fetch_block(&self, slot: u64) -> Result<Option<BlockRecord>>;
    fn fetch_transactions(&self, slot: u64) -> Result<Vec<TransactionRecord>>;
    fn fetch_token_transfers(&self, slot: u64) -> Result<Vec<TokenTransferRecord>>;
    fn fetch_nft_updates(&self, slot: u64) -> Result<Vec<NftRecord>>;
    fn fetch_social_posts(&self, slot: u64) -> Result<Vec<SocialPostRecord>>;
    fn fetch_creator_rewards(&self, slot: u64) -> Result<Vec<CreatorRewardRecord>>;
    fn fetch_engagement_events(&self, slot: u64) -> Result<Vec<EngagementRecord>>;
    fn fetch_social_stakes(&self, slot: u64) -> Result<Vec<SocialStakeRecord>>;
    fn fetch_wallet_profiles(&self, slot: u64) -> Result<Vec<WalletProfileRecord>>;
}

pub trait IndexSink: Send + Sync {
    fn persist_block(&self, block: BlockRecord) -> Result<()>;
    fn persist_transactions(&self, transactions: Vec<TransactionRecord>) -> Result<()>;
    fn persist_token_transfers(&self, transfers: Vec<TokenTransferRecord>) -> Result<()>;
    fn persist_nft_updates(&self, nfts: Vec<NftRecord>) -> Result<()>;
    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()>;
    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()>;
    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()>;
    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()>;
    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()>;
}

// Blanket impl so `ExplorerIndexer<D, Arc<dyn IndexSink>>` works. Lets the
// boot path in main.rs hand the same Arc<dyn IndexSink> to the indexer for
// both InMemory and Postgres stores without a generic explosion. `?Sized`
// is required because `dyn IndexSink` is unsized.
impl<T: IndexSink + ?Sized> IndexSink for std::sync::Arc<T> {
    fn persist_block(&self, block: BlockRecord) -> Result<()> {
        (**self).persist_block(block)
    }
    fn persist_transactions(&self, transactions: Vec<TransactionRecord>) -> Result<()> {
        (**self).persist_transactions(transactions)
    }
    fn persist_token_transfers(&self, transfers: Vec<TokenTransferRecord>) -> Result<()> {
        (**self).persist_token_transfers(transfers)
    }
    fn persist_nft_updates(&self, nfts: Vec<NftRecord>) -> Result<()> {
        (**self).persist_nft_updates(nfts)
    }
    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()> {
        (**self).persist_social_posts(posts)
    }
    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()> {
        (**self).persist_creator_rewards(rewards)
    }
    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()> {
        (**self).persist_engagement_events(events)
    }
    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()> {
        (**self).persist_social_stakes(stakes)
    }
    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()> {
        (**self).persist_wallet_profiles(profiles)
    }
}

pub struct ExplorerIndexer<D, S> {
    pub config: ExplorerBackendConfig,
    pub data_source: D,
    pub sink: S,
}

#[derive(Clone)]
pub struct RpcChainDataSource {
    pub config: ExplorerBackendConfig,
    client: Client,
}

impl RpcChainDataSource {
    pub fn new(config: ExplorerBackendConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn rpc_request<T: DeserializeOwned>(&self, method: &str, params: Value) -> Result<T> {
        let payload = json!({
            "jsonrpc": "2.0",
            "id": 1u64,
            "method": method,
            "params": params,
        });
        let response = self
            .client
            .post(&self.config.rpc_url)
            .json(&payload)
            .send()
            .with_context(|| format!("rpc request failed for method {method}"))?;
        let envelope: JsonRpcEnvelope<T> = response
            .json()
            .with_context(|| format!("rpc response decode failed for method {method}"))?;
        if let Some(error) = envelope.error {
            anyhow::bail!("rpc error {}: {}", error.code, error.message);
        }
        envelope
            .result
            .with_context(|| format!("rpc returned no result for method {method}"))
    }

    fn fetch_block_value(&self, slot: u64) -> Result<Option<Value>> {
        self.rpc_request(
            "getBlock",
            json!([
                slot,
                {
                    "transactionDetails": "full",
                    "rewards": false,
                    "maxSupportedTransactionVersion": 0
                }
            ]),
        )
    }

    fn fetch_program_accounts(&self, program_id: &Pubkey) -> Result<Vec<Value>> {
        self.rpc_request(
            "getProgramAccounts",
            json!([
                program_id.to_string(),
                {
                    "encoding": "base64"
                }
            ]),
        )
    }

    fn social_posts_state(&self) -> Result<Option<SocialPostsStateAccount>> {
        decode_first_program_state::<SocialPostsStateAccount>(
            self.fetch_program_accounts(&aeko_social_posts_program::id())?,
        )
    }

    fn social_rewards_state(&self) -> Result<Option<SocialRewardsStateAccount>> {
        decode_first_program_state::<SocialRewardsStateAccount>(
            self.fetch_program_accounts(&aeko_social_rewards_program::id())?,
        )
    }

    fn social_staking_state(&self) -> Result<Option<SocialStakingStateAccount>> {
        decode_first_program_state::<SocialStakingStateAccount>(
            self.fetch_program_accounts(&aeko_social_staking_program::id())?,
        )
    }

    fn social_anti_spam_state(&self) -> Result<Option<SocialAntiSpamStateAccount>> {
        decode_first_program_state::<SocialAntiSpamStateAccount>(
            self.fetch_program_accounts(&aeko_social_anti_spam_program::id())?,
        )
    }

    fn token20_accounts(&self) -> Result<Vec<(String, Aeko20Account)>> {
        decode_program_accounts_by_type::<Aeko20Account, _>(
            self.fetch_program_accounts(&aeko_token_20_program::id())?,
            is_valid_token20_account,
        )
    }

    fn token721_tokens(&self) -> Result<Vec<(String, Aeko721Token)>> {
        decode_program_accounts_by_type::<Aeko721Token, _>(
            self.fetch_program_accounts(&aeko_token_721_program::id())?,
            is_valid_token721_token,
        )
    }

    fn wallet_profiles_from_states(
        &self,
        anti_spam_state: Option<SocialAntiSpamStateAccount>,
        posts_state: Option<SocialPostsStateAccount>,
        staking_state: Option<SocialStakingStateAccount>,
        token_accounts: Vec<(String, Aeko20Account)>,
        nft_tokens: Vec<(String, Aeko721Token)>,
    ) -> Vec<WalletProfileRecord> {
        wallet_profiles_from_social_states(
            anti_spam_state,
            posts_state,
            staking_state,
            token_accounts,
            nft_tokens,
        )
    }
}

impl<D, S> ExplorerIndexer<D, S>
where
    D: ChainDataSource,
    S: IndexSink,
{
    pub fn new(config: ExplorerBackendConfig, data_source: D, sink: S) -> Self {
        Self {
            config,
            data_source,
            sink,
        }
    }

    pub fn sync_slot(&self, slot: u64) -> Result<()> {
        if let Some(block) = self.data_source.fetch_block(slot)? {
            self.sink.persist_block(block)?;
        }
        self.sink
            .persist_transactions(self.data_source.fetch_transactions(slot)?)?;
        self.sink
            .persist_token_transfers(self.data_source.fetch_token_transfers(slot)?)?;
        self.sink
            .persist_nft_updates(self.data_source.fetch_nft_updates(slot)?)?;

        if self.config.persist_socialfi_views {
            self.sink
                .persist_social_posts(self.data_source.fetch_social_posts(slot)?)?;
            self.sink
                .persist_creator_rewards(self.data_source.fetch_creator_rewards(slot)?)?;
            self.sink
                .persist_engagement_events(self.data_source.fetch_engagement_events(slot)?)?;
            self.sink
                .persist_social_stakes(self.data_source.fetch_social_stakes(slot)?)?;
            self.sink
                .persist_wallet_profiles(self.data_source.fetch_wallet_profiles(slot)?)?;
        }

        Ok(())
    }

    pub fn sync_range(&self, start_slot: u64, end_slot: u64) -> Result<()> {
        for slot in start_slot..=end_slot {
            self.sync_slot(slot)?;
        }
        Ok(())
    }

    pub fn catch_up(&self) -> Result<()> {
        let latest_slot = self.data_source.latest_slot()?;
        self.sync_range(self.config.start_slot, latest_slot)
    }
}

impl ChainDataSource for RpcChainDataSource {
    fn latest_slot(&self) -> Result<u64> {
        self.rpc_request("getSlot", json!([]))
    }

    fn fetch_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        let Some(block) = self.fetch_block_value(slot)? else {
            return Ok(None);
        };

        Ok(Some(BlockRecord {
            slot,
            blockhash: block
                .get("blockhash")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            parent_slot: block
                .get("parentSlot")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
            transaction_count: block
                .get("transactions")
                .and_then(Value::as_array)
                .map(|items| items.len() as u64)
                .unwrap_or_default(),
            producer: block
                .get("blockHeight")
                .and_then(Value::as_u64)
                .map(|height| height.to_string()),
            unix_timestamp: block.get("blockTime").and_then(Value::as_i64),
        }))
    }

    fn fetch_transactions(&self, slot: u64) -> Result<Vec<TransactionRecord>> {
        let Some(block) = self.fetch_block_value(slot)? else {
            return Ok(Vec::new());
        };
        let records = block
            .get("transactions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|tx| TransactionRecord {
                signature: tx
                    .get("transaction")
                    .and_then(|transaction| transaction.get("signatures"))
                    .and_then(Value::as_array)
                    .and_then(|signatures| signatures.first())
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                slot,
                success: tx
                    .get("meta")
                    .and_then(|meta| meta.get("err"))
                    .map(|err| err.is_null())
                    .unwrap_or(true),
                fee: tx
                    .get("meta")
                    .and_then(|meta| meta.get("fee"))
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                primary_program: tx
                    .get("transaction")
                    .and_then(|transaction| transaction.get("message"))
                    .and_then(|message| message.get("instructions"))
                    .and_then(Value::as_array)
                    .and_then(|instructions| instructions.first())
                    .and_then(|ix| ix.get("programId"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                signer: tx
                    .get("transaction")
                    .and_then(|transaction| transaction.get("message"))
                    .and_then(|message| message.get("accountKeys"))
                    .and_then(Value::as_array)
                    .and_then(|keys| keys.first())
                    .and_then(|key| {
                        key.as_str().or_else(|| key.get("pubkey").and_then(Value::as_str))
                    })
                    .map(ToString::to_string),
            })
            .collect();
        Ok(records)
    }

    fn fetch_token_transfers(&self, slot: u64) -> Result<Vec<TokenTransferRecord>> {
        Ok(self
            .token20_accounts()?
            .into_iter()
            .filter(|(_, account)| account.balance > 0)
            .map(|(account_pubkey, account)| TokenTransferRecord {
                mint: account.mint.to_string(),
                source: account_pubkey.clone(),
                destination: account.owner.to_string(),
                amount: account.balance.to_string(),
                signature: format!("snapshot:{account_pubkey}"),
                slot,
            })
            .collect())
    }

    fn fetch_nft_updates(&self, _slot: u64) -> Result<Vec<NftRecord>> {
        let _collections = decode_program_accounts_by_type::<Aeko721Collection, _>(
            self.fetch_program_accounts(&aeko_token_721_program::id())?,
            is_valid_token721_collection,
        )?;
        Ok(self
            .token721_tokens()?
            .into_iter()
            .map(|(account_pubkey, token)| NftRecord {
                token_id: account_pubkey,
                collection_id: Some(token.collection.to_string()),
                owner: token.owner.to_string(),
                creator: token.creator.to_string(),
                metadata_uri: Some(token.metadata.uri.clone()),
                frozen: token.frozen,
            })
            .collect())
    }

    fn fetch_social_posts(&self, _slot: u64) -> Result<Vec<SocialPostRecord>> {
        let Some(state) = self.social_posts_state()? else {
            return Ok(Vec::new());
        };
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
        let Some(state) = self.social_rewards_state()? else {
            return Ok(Vec::new());
        };
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
        let Some(state) = self.social_posts_state()? else {
            return Ok(Vec::new());
        };
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
        let Some(state) = self.social_staking_state()? else {
            return Ok(Vec::new());
        };
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

    fn fetch_wallet_profiles(&self, _slot: u64) -> Result<Vec<WalletProfileRecord>> {
        Ok(self.wallet_profiles_from_states(
            self.social_anti_spam_state()?,
            self.social_posts_state()?,
            self.social_staking_state()?,
            self.token20_accounts()?,
            self.token721_tokens()?,
        ))
    }
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize, Serialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

fn decode_first_program_state<T: BorshDeserialize>(accounts: Vec<Value>) -> Result<Option<T>> {
    for account in accounts {
        let Some(data) = account
            .get("account")
            .and_then(|account| account.get("data"))
            .and_then(Value::as_array)
        else {
            continue;
        };
        let Some(encoded) = data.first().and_then(Value::as_str) else {
            continue;
        };
        let raw = BASE64_STANDARD
            .decode(encoded)
            .context("failed to decode base64 account data")?;
        if let Some(decoded) = try_deserialize_padded::<T>(&raw) {
            return Ok(Some(decoded));
        }
    }
    Ok(None)
}

fn try_deserialize_padded<T: BorshDeserialize>(data: &[u8]) -> Option<T> {
    let end = data
        .iter()
        .rposition(|byte| *byte != 0)
        .map(|index| index + 1)
        .unwrap_or(0);
    T::try_from_slice(&data[..end]).ok()
}

fn anti_spam_profile_score(
    profile: &aeko_social_anti_spam_program::state::AntiSpamProfile,
    cooldown_epochs: u64,
) -> u16 {
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

fn wallet_profiles_from_social_states(
    anti_spam_state: Option<SocialAntiSpamStateAccount>,
    posts_state: Option<SocialPostsStateAccount>,
    staking_state: Option<SocialStakingStateAccount>,
    token_accounts: Vec<(String, Aeko20Account)>,
    nft_tokens: Vec<(String, Aeko721Token)>,
) -> Vec<WalletProfileRecord> {
    let mut profiles = HashMap::<String, WalletProfileRecord>::new();

    if let Some(state) = anti_spam_state {
        for profile in state.profiles {
            profiles.insert(
                profile.wallet.to_string(),
                WalletProfileRecord {
                    address: profile.wallet.to_string(),
                    reputation_score: Some(anti_spam_profile_score(
                        &profile,
                        state.config.cooldown_epochs,
                    )),
                    native_balance: None,
                    token_count: 0,
                    nft_count: 0,
                },
            );
        }
    }

    if let Some(state) = posts_state {
        for post in state.posts {
            profiles
                .entry(post.creator.to_string())
                .or_insert_with(|| WalletProfileRecord {
                    address: post.creator.to_string(),
                    reputation_score: None,
                    native_balance: None,
                    token_count: 0,
                    nft_count: 0,
                });
        }
    }

    if let Some(state) = staking_state {
        for position in state.positions {
            profiles
                .entry(position.staker.to_string())
                .or_insert_with(|| WalletProfileRecord {
                    address: position.staker.to_string(),
                    reputation_score: None,
                    native_balance: None,
                    token_count: 0,
                    nft_count: 0,
                });
            profiles
                .entry(position.creator.to_string())
                .or_insert_with(|| WalletProfileRecord {
                    address: position.creator.to_string(),
                    reputation_score: None,
                    native_balance: None,
                    token_count: 0,
                    nft_count: 0,
                });
        }
    }

    for (_, account) in token_accounts {
        let entry = profiles
            .entry(account.owner.to_string())
            .or_insert_with(|| WalletProfileRecord {
                address: account.owner.to_string(),
                reputation_score: None,
                native_balance: None,
                token_count: 0,
                nft_count: 0,
            });
        if account.balance > 0 {
            entry.token_count = entry.token_count.saturating_add(1);
        }
    }

    for (_, token) in nft_tokens {
        let entry = profiles
            .entry(token.owner.to_string())
            .or_insert_with(|| WalletProfileRecord {
                address: token.owner.to_string(),
                reputation_score: None,
                native_balance: None,
                token_count: 0,
                nft_count: 0,
            });
        if token.is_initialized {
            entry.nft_count = entry.nft_count.saturating_add(1);
        }
    }

    profiles.into_values().collect()
}

fn decode_program_accounts_by_type<T, F>(accounts: Vec<Value>, is_valid: F) -> Result<Vec<(String, T)>>
where
    T: BorshDeserialize,
    F: Fn(&T) -> bool,
{
    let mut decoded = Vec::new();
    for account in accounts {
        let Some(pubkey) = account.get("pubkey").and_then(Value::as_str) else {
            continue;
        };
        let Some(data) = account
            .get("account")
            .and_then(|account| account.get("data"))
            .and_then(Value::as_array)
        else {
            continue;
        };
        let Some(encoded) = data.first().and_then(Value::as_str) else {
            continue;
        };
        let raw = BASE64_STANDARD
            .decode(encoded)
            .context("failed to decode base64 account data")?;
        let Some(value) = try_deserialize_padded::<T>(&raw) else {
            continue;
        };
        if is_valid(&value) {
            decoded.push((pubkey.to_string(), value));
        }
    }
    Ok(decoded)
}

fn is_valid_token20_account(account: &Aeko20Account) -> bool {
    account.owner != Pubkey::default() && account.mint != Pubkey::default()
}

fn is_valid_token721_collection(collection: &Aeko721Collection) -> bool {
    collection.is_initialized && !collection.name.is_empty()
}

fn is_valid_token721_token(token: &Aeko721Token) -> bool {
    token.is_initialized && !token.metadata.uri.is_empty()
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        crate::{
            api::ExplorerReadStore,
            config::ExplorerBackendConfig,
            store::InMemoryExplorerStore,
        },
        aeko_sdk::pubkey::Pubkey,
        aeko_social_anti_spam_program::state::{
            AntiSpamConfig, AntiSpamMode, AntiSpamProfile, SocialAntiSpamStateAccount,
        },
        aeko_social_posts_program::state::{
            ModerationState, PostAnchor, PostKind, SocialPostsConfig, SocialPostsStateAccount,
            VisibilityClass,
        },
        aeko_social_staking_program::state::{
            SocialStakeConfig, SocialStakePosition, SocialStakeState, SocialStakingStateAccount,
        },
        aeko_token_20_program::state::Aeko20Account,
        aeko_token_721_program::state::{Aeko721Token, NftMetadata},
    };

    #[derive(Clone)]
    struct StubChainDataSource {
        latest_slot: u64,
        posts: Vec<SocialPostRecord>,
        rewards: Vec<CreatorRewardRecord>,
        engagements: Vec<EngagementRecord>,
        stakes: Vec<SocialStakeRecord>,
        profiles: Vec<WalletProfileRecord>,
    }

    impl ChainDataSource for StubChainDataSource {
        fn latest_slot(&self) -> Result<u64> {
            Ok(self.latest_slot)
        }

        fn fetch_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
            Ok(Some(BlockRecord {
                slot,
                ..BlockRecord::default()
            }))
        }

        fn fetch_transactions(&self, _slot: u64) -> Result<Vec<TransactionRecord>> {
            Ok(Vec::new())
        }

        fn fetch_token_transfers(&self, _slot: u64) -> Result<Vec<TokenTransferRecord>> {
            Ok(Vec::new())
        }

        fn fetch_nft_updates(&self, _slot: u64) -> Result<Vec<NftRecord>> {
            Ok(Vec::new())
        }

        fn fetch_social_posts(&self, _slot: u64) -> Result<Vec<SocialPostRecord>> {
            Ok(self.posts.clone())
        }

        fn fetch_creator_rewards(&self, _slot: u64) -> Result<Vec<CreatorRewardRecord>> {
            Ok(self.rewards.clone())
        }

        fn fetch_engagement_events(&self, _slot: u64) -> Result<Vec<EngagementRecord>> {
            Ok(self.engagements.clone())
        }

        fn fetch_social_stakes(&self, _slot: u64) -> Result<Vec<SocialStakeRecord>> {
            Ok(self.stakes.clone())
        }

        fn fetch_wallet_profiles(&self, _slot: u64) -> Result<Vec<WalletProfileRecord>> {
            Ok(self.profiles.clone())
        }
    }

    #[test]
    fn wallet_profiles_are_derived_from_multiple_socialfi_states() {
        let wallet = Pubkey::new_unique();
        let creator = Pubkey::new_unique();
        let staker = Pubkey::new_unique();

        let anti_spam_state = SocialAntiSpamStateAccount {
            is_initialized: true,
            config: AntiSpamConfig {
                authority: Pubkey::new_unique(),
                mode: AntiSpamMode::PenaltyEnabled,
                min_post_stake: 100,
                min_post_reputation: 600,
                cooldown_epochs: 12,
                slash_bps: 500,
            },
            profiles: vec![AntiSpamProfile {
                wallet,
                post_count_window: 0,
                engagement_count_window: 0,
                spam_flags: 1,
                gated_until_epoch: None,
                slash_count: 0,
                last_flagged_at_unix: None,
            }],
        };
        let posts_state = SocialPostsStateAccount {
            is_initialized: true,
            config: SocialPostsConfig {
                authority: Pubkey::new_unique(),
                posting_enabled: true,
                engagement_enabled: true,
                max_content_uri_len: 128,
            },
            posts: vec![PostAnchor {
                post_id: [7; 32],
                creator,
                content_hash: [1; 32],
                metadata_hash: [2; 32],
                content_uri: "ipfs://post".to_string(),
                parent_post_id: None,
                post_kind: PostKind::Original,
                created_at_unix: 123,
                edited_at_unix: None,
                visibility: VisibilityClass::Public,
                moderation_state: ModerationState::Active,
                signature_ref: None,
            }],
            engagement_proofs: Vec::new(),
        };
        let staking_state = SocialStakingStateAccount {
            is_initialized: true,
            config: SocialStakeConfig {
                authority: Pubkey::new_unique(),
                stake_vault: Pubkey::new_unique(),
                reward_vault: Pubkey::new_unique(),
                min_stake_amount: 10,
                cooldown_epochs: 3,
                staking_enabled: true,
            },
            positions: vec![SocialStakePosition {
                position_id: [9; 32],
                staker,
                creator,
                staked_amount: 1_000,
                activated_at_epoch: 1,
                unlock_epoch: None,
                accumulated_yield: 0,
                claimed_yield: 0,
                state: SocialStakeState::Active,
            }],
            yield_records: Vec::new(),
        };
        let token_accounts = vec![(
            "token-account-1".to_string(),
            Aeko20Account {
                owner: wallet,
                mint: Pubkey::new_unique(),
                balance: 500,
                frozen: false,
            },
        )];
        let nft_tokens = vec![(
            "nft-account-1".to_string(),
            Aeko721Token {
                collection: Pubkey::new_unique(),
                token_id: 1,
                owner: creator,
                creator,
                royalty_bps: 500,
                metadata: NftMetadata {
                    name: "Genesis".to_string(),
                    description: None,
                    uri: "ipfs://nft".to_string(),
                    image_uri: None,
                    attributes: Vec::new(),
                },
                frozen: false,
                is_initialized: true,
            },
        )];

        let profiles = wallet_profiles_from_social_states(
            Some(anti_spam_state),
            Some(posts_state),
            Some(staking_state),
            token_accounts,
            nft_tokens,
        );

        assert_eq!(profiles.len(), 3);
        assert!(profiles.iter().any(|profile| {
            profile.address == wallet.to_string()
                && profile.reputation_score == Some(950)
                && profile.token_count == 1
        }));
        assert!(profiles.iter().any(|profile| {
            profile.address == creator.to_string() && profile.nft_count == 1
        }));
        assert!(profiles
            .iter()
            .any(|profile| profile.address == staker.to_string()));
    }

    #[test]
    fn sync_slot_deduplicates_creator_rewards() {
        let source = StubChainDataSource {
            latest_slot: 10,
            posts: Vec::new(),
            rewards: vec![CreatorRewardRecord {
                creator: "creator-1".to_string(),
                epoch: 77,
                reward_amount: 1_000,
                claimable_amount: 800,
            }],
            engagements: Vec::new(),
            stakes: Vec::new(),
            profiles: Vec::new(),
        };
        let store = InMemoryExplorerStore::new();
        let indexer = ExplorerIndexer::new(ExplorerBackendConfig::default(), source.clone(), store.clone());

        indexer.sync_slot(10).unwrap();
        indexer.sync_slot(10).unwrap();

        let rewards = store.list_creator_rewards(Some("creator-1"), 10).unwrap();
        assert_eq!(rewards.len(), 1);
        assert_eq!(rewards[0].epoch, 77);
    }
}
