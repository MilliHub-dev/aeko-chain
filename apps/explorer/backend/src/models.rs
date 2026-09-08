use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockRecord {
    pub slot: u64,
    pub blockhash: String,
    pub parent_slot: u64,
    pub transaction_count: u64,
    /// Validator/leader identity when the RPC source can prove it. Never use
    /// block height or another unrelated field as a stand-in.
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
    /// Stable location of the instruction inside the transaction, e.g. `2`
    /// or `2:1` for an inner instruction. A signature alone is not a unique
    /// token-transfer event.
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
    pub content_uri: String,
    pub post_kind: String,
    pub visibility: String,
    pub moderation_state: String,
    pub created_at_unix: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorRewardRecord {
    pub creator: String,
    pub epoch: u64,
    pub reward_amount: u64,
    pub claimable_amount: u64,
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
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocialStakeRecord {
    pub position_id: String,
    pub staker: String,
    pub creator: String,
    pub staked_amount: u64,
    pub state: String,
    pub accumulated_yield: u64,
    pub claimed_yield: u64,
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

/// One finalized chain slot, persisted atomically with its transaction events,
/// involved account projection, and durable next-slot cursor.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CoreSlotRecord {
    pub slot: u64,
    pub block: Option<BlockRecord>,
    pub transactions: Vec<TransactionRecord>,
    pub transaction_accounts: Vec<TransactionAccountRecord>,
    pub token_transfers: Vec<TokenTransferRecord>,
}

/// Periodic current-state projection. `slot` is a finalized watermark read
/// immediately before the complete RPC scan; the records describe current
/// finalized state observed at or after that watermark.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AssetSnapshot {
    pub slot: u64,
    pub token_mints: Vec<TokenMintRecord>,
    pub token_accounts: Vec<TokenAccountRecord>,
    pub nft_collections: Vec<NftCollectionRecord>,
    pub nfts: Vec<NftRecord>,
}
