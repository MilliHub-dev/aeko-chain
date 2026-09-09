use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockRecord {
    pub slot: u64,
    pub blockhash: String,
    pub parent_slot: u64,
    pub transaction_count: u64,
    pub producer: Option<String>,
    pub unix_timestamp: Option<i64>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRecord {
    pub signature: String,
    pub slot: u64,
    pub success: bool,
    pub fee: u64,
    pub primary_program: Option<String>,
    pub signer: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TransactionAccountRecord {
    pub signature: String,
    pub account_index: usize,
    pub address: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTransferRecord {
    pub mint: String,
    pub source: String,
    pub destination: String,
    pub amount: String,
    pub signature: String,
    pub event_index: String,
    pub slot: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenMintRecord {
    pub mint: String,
    pub mint_authority: Option<String>,
    pub freeze_authority: Option<String>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: String,
    pub supply_cap: Option<String>,
    pub metadata_uri: Option<String>,
    pub mint_policy: String,
    pub last_seen_slot: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenAccountRecord {
    pub address: String,
    pub owner: String,
    pub mint: String,
    pub balance: String,
    pub frozen: bool,
    pub last_seen_slot: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSummaryRecord {
    pub mint: String,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub holder_count: usize,
    pub total_supply: String,
    pub recent_transfers: Vec<TokenTransferRecord>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NftRecord {
    pub token_id: String,
    pub collection_id: Option<String>,
    pub owner: String,
    pub creator: String,
    pub metadata_uri: Option<String>,
    pub frozen: bool,
    pub last_seen_slot: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NftCollectionRecord {
    pub collection_id: String,
    pub authority: String,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub total_minted: u64,
    pub last_seen_slot: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummaryRecord {
    pub collection_id: String,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub total_minted: u64,
    pub item_count: usize,
    pub owner_count: usize,
    pub creator_count: usize,
    pub items: Vec<NftRecord>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialPostRecord {
    pub post_id: String,
    pub creator: String,
    pub content_hash: String,
    pub metadata_hash: String,
    pub content_uri: String,
    pub parent_post_id: Option<String>,
    pub post_kind: String,
    pub created_at_unix: i64,
    pub edited_at_unix: Option<i64>,
    pub visibility: String,
    pub moderation_state: String,
    pub signature_ref: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngagementRecord {
    pub proof_id: String,
    pub actor: String,
    pub target_creator: String,
    pub target_post_id: Option<String>,
    pub action_kind: String,
    pub action_weight: u32,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub replay_guard: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorRewardRecord {
    pub creator: String,
    pub epoch: u64,
    pub earned_points: String,
    pub reward_amount: u64,
    pub claimed_amount: u64,
    pub claimable_amount: u64,
    pub penalty_bps: u16,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialRewardAccountRecord {
    pub creator: String,
    pub total_earned: String,
    pub total_claimed: String,
    pub claimable_amount: u64,
    pub last_settled_epoch: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardSettlementRecord {
    pub epoch: u64,
    pub reward_pool_amount: u64,
    pub total_effective_points: String,
    pub settled_creator_count: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialStakeRecord {
    pub position_id: String,
    pub staker: String,
    pub creator: String,
    pub staked_amount: u64,
    pub activated_at_epoch: u64,
    pub unlock_epoch: Option<u64>,
    pub state: String,
    pub accumulated_yield: u64,
    pub claimed_yield: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StakeYieldRecord {
    pub epoch: u64,
    pub position_id: String,
    pub creator: String,
    pub staker: String,
    pub yield_amount: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntiSpamProfileRecord {
    pub wallet: String,
    pub post_count_window: u32,
    pub engagement_count_window: u32,
    pub spam_flags: u16,
    pub gated_until_epoch: Option<u64>,
    pub slash_count: u16,
    pub last_flagged_at_unix: Option<i64>,
    pub reputation_score: u16,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorTipRecord {
    pub tip_id: String,
    pub creator: String,
    pub sender: String,
    pub amount: u64,
    pub timestamp: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionRecord {
    pub subscription_id: String,
    pub creator: String,
    pub subscriber: String,
    pub amount_per_period: u64,
    pub period_seconds: u64,
    pub started_at_unix: i64,
    pub valid_until_unix: i64,
    pub state: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaidContentUnlockRecord {
    pub unlock_id: String,
    pub content_id: String,
    pub creator: String,
    pub buyer: String,
    pub amount: u64,
    pub unlocked_at_unix: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorRevenueRecord {
    pub creator: String,
    pub total_earned: String,
    pub total_claimed: String,
    pub claimable_amount: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialDomainSnapshotRecord {
    pub domain: String,
    pub state_account: String,
    pub program_id: String,
    pub slot: u64,
    pub epoch: u64,
    pub item_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletProfileRecord {
    pub address: String,
    pub reputation_score: Option<u16>,
    pub native_balance: Option<u64>,
    pub token_count: usize,
    pub nft_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainAccountRecord {
    pub address: String,
    pub lamports: u64,
    pub owner: String,
    pub executable: bool,
    pub data_len: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDetailRecord {
    pub account: ChainAccountRecord,
    pub profile: WalletProfileRecord,
    pub token_holdings: Vec<TokenAccountRecord>,
    pub nft_holdings: Vec<NftRecord>,
    pub recent_transactions: Vec<TransactionRecord>,
    pub recent_posts: Vec<SocialPostRecord>,
    pub social_stakes: Vec<SocialStakeRecord>,
    pub creator_rewards: Vec<CreatorRewardRecord>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorProfileRecord {
    pub profile: WalletProfileRecord,
    pub post_count: usize,
    pub total_rewards_earned: u64,
    pub total_claimable_rewards: u64,
    pub active_stake_count: usize,
    pub total_staked_amount: u64,
    pub recent_posts: Vec<SocialPostRecord>,
    pub recent_rewards: Vec<CreatorRewardRecord>,
    pub related_stakes: Vec<SocialStakeRecord>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SearchResultRecord {
    Block(BlockRecord),
    Transaction(TransactionRecord),
    Wallet(WalletProfileRecord),
    TokenTransfer(TokenTransferRecord),
    Nft(NftRecord),
    SocialPost(SocialPostRecord),
    Engagement(EngagementRecord),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CoreSlotRecord {
    pub slot: u64,
    pub block: Option<BlockRecord>,
    pub transactions: Vec<TransactionRecord>,
    pub transaction_accounts: Vec<TransactionAccountRecord>,
    pub token_transfers: Vec<TokenTransferRecord>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AssetSnapshot {
    pub slot: u64,
    pub token_mints: Vec<TokenMintRecord>,
    pub token_accounts: Vec<TokenAccountRecord>,
    pub nft_collections: Vec<NftCollectionRecord>,
    pub nfts: Vec<NftRecord>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SocialSnapshot {
    pub slot: u64,
    pub epoch: u64,
    pub domains: Vec<SocialDomainSnapshotRecord>,
    pub posts: Vec<SocialPostRecord>,
    pub engagement: Vec<EngagementRecord>,
    pub reward_accounts: Vec<SocialRewardAccountRecord>,
    pub reward_epochs: Vec<CreatorRewardRecord>,
    pub reward_settlements: Vec<RewardSettlementRecord>,
    pub stakes: Vec<SocialStakeRecord>,
    pub stake_yields: Vec<StakeYieldRecord>,
    pub anti_spam_profiles: Vec<AntiSpamProfileRecord>,
    pub tips: Vec<CreatorTipRecord>,
    pub subscriptions: Vec<SubscriptionRecord>,
    pub unlocks: Vec<PaidContentUnlockRecord>,
    pub revenues: Vec<CreatorRevenueRecord>,
}
