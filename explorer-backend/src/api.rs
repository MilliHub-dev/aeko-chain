use {
    crate::models::{
        AccountDetailRecord, BlockRecord, CollectionSummaryRecord, CreatorProfileRecord,
        CreatorRewardRecord, EngagementRecord, NftRecord, SearchResultRecord, SocialPostRecord,
        SocialStakeRecord, TokenSummaryRecord, TokenTransferRecord, TransactionRecord,
        WalletProfileRecord,
    },
    anyhow::Result,
    std::collections::HashSet,
};

pub trait ExplorerReadStore: Send + Sync {
    fn list_blocks(&self, limit: usize) -> Result<Vec<BlockRecord>>;
    fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>>;
    fn list_transactions(&self, limit: usize) -> Result<Vec<TransactionRecord>>;
    fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>>;
    fn list_token_transfers(&self, mint: Option<&str>, limit: usize) -> Result<Vec<TokenTransferRecord>>;
    fn list_nfts(&self, collection_id: Option<&str>, limit: usize) -> Result<Vec<NftRecord>>;
    fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>>;
    fn list_posts(&self, creator: Option<&str>, limit: usize) -> Result<Vec<SocialPostRecord>>;
    fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>>;
    fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>>;
    fn list_engagement_events(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<EngagementRecord>>;
    fn list_social_stakes(
        &self,
        wallet: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialStakeRecord>>;
    fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>>;
    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>>;
}

pub struct ExplorerApiService<S> {
    store: S,
}

impl<S> ExplorerApiService<S>
where
    S: ExplorerReadStore,
{
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list_blocks(&self, limit: usize) -> Result<Vec<BlockRecord>> {
        self.store.list_blocks(limit)
    }

    pub fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        self.store.get_block(slot)
    }

    pub fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>> {
        self.store.get_transaction(signature)
    }

    pub fn list_transactions(&self, limit: usize) -> Result<Vec<TransactionRecord>> {
        self.store.list_transactions(limit)
    }

    pub fn list_token_transfers(
        &self,
        mint: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TokenTransferRecord>> {
        self.store.list_token_transfers(mint, limit)
    }

    pub fn get_token_summary(&self, mint: &str, limit: usize) -> Result<Option<TokenSummaryRecord>> {
        let transfers = self.store.list_token_transfers(Some(mint), limit)?;
        if transfers.is_empty() {
            return Ok(None);
        }

        let mut holders = HashSet::new();
        let mut total_supply = 0u128;
        for transfer in &transfers {
            holders.insert(transfer.destination.clone());
            total_supply = total_supply.saturating_add(
                transfer.amount.parse::<u128>().unwrap_or_default(),
            );
        }

        Ok(Some(TokenSummaryRecord {
            mint: mint.to_string(),
            holder_count: holders.len(),
            total_supply: total_supply.to_string(),
            recent_transfers: transfers,
        }))
    }

    pub fn list_nfts(&self, collection_id: Option<&str>, limit: usize) -> Result<Vec<NftRecord>> {
        self.store.list_nfts(collection_id, limit)
    }

    pub fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>> {
        self.store.get_nft(token_id)
    }

    pub fn get_collection_summary(
        &self,
        collection_id: &str,
        limit: usize,
    ) -> Result<Option<CollectionSummaryRecord>> {
        let items = self.store.list_nfts(Some(collection_id), limit)?;
        if items.is_empty() {
            return Ok(None);
        }

        let mut owners = HashSet::new();
        let mut creators = HashSet::new();
        for item in &items {
            owners.insert(item.owner.clone());
            creators.insert(item.creator.clone());
        }

        Ok(Some(CollectionSummaryRecord {
            collection_id: collection_id.to_string(),
            item_count: items.len(),
            owner_count: owners.len(),
            creator_count: creators.len(),
            items,
        }))
    }

    pub fn list_posts(&self, creator: Option<&str>, limit: usize) -> Result<Vec<SocialPostRecord>> {
        self.store.list_posts(creator, limit)
    }

    pub fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>> {
        self.store.get_post(post_id)
    }

    pub fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>> {
        self.store.list_creator_rewards(creator, limit)
    }

    pub fn list_engagement_events(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<EngagementRecord>> {
        self.store.list_engagement_events(creator, limit)
    }

    pub fn list_social_stakes(
        &self,
        wallet: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialStakeRecord>> {
        self.store.list_social_stakes(wallet, limit)
    }

    pub fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>> {
        self.store.get_wallet_profile(address)
    }

    pub fn get_account_detail(
        &self,
        address: &str,
        limit: usize,
    ) -> Result<Option<AccountDetailRecord>> {
        let Some(profile) = self.store.get_wallet_profile(address)? else {
            return Ok(None);
        };

        let recent_transactions = self
            .store
            .list_transactions(limit)?
            .into_iter()
            .filter(|tx| tx.signer.as_deref() == Some(address))
            .collect();
        let recent_posts = self.store.list_posts(Some(address), limit)?;
        let social_stakes = self.store.list_social_stakes(Some(address), limit)?;
        let creator_rewards = self.store.list_creator_rewards(Some(address), limit)?;

        Ok(Some(AccountDetailRecord {
            profile,
            recent_transactions,
            recent_posts,
            social_stakes,
            creator_rewards,
        }))
    }

    pub fn get_creator_profile(
        &self,
        address: &str,
        limit: usize,
    ) -> Result<Option<CreatorProfileRecord>> {
        let Some(profile) = self.store.get_wallet_profile(address)? else {
            return Ok(None);
        };

        let recent_posts = self.store.list_posts(Some(address), limit)?;
        let recent_rewards = self.store.list_creator_rewards(Some(address), limit)?;
        let related_stakes = self.store.list_social_stakes(Some(address), limit)?;
        let total_rewards_earned = recent_rewards.iter().map(|reward| reward.reward_amount).sum();
        let total_claimable_rewards = recent_rewards
            .iter()
            .map(|reward| reward.claimable_amount)
            .sum();
        let active_stake_count = related_stakes
            .iter()
            .filter(|stake| stake.creator == address && stake.state == "active")
            .count();
        let total_staked_amount = related_stakes
            .iter()
            .filter(|stake| stake.creator == address)
            .map(|stake| stake.staked_amount)
            .sum();

        Ok(Some(CreatorProfileRecord {
            profile,
            post_count: recent_posts.len(),
            total_rewards_earned,
            total_claimable_rewards,
            active_stake_count,
            total_staked_amount,
            recent_posts,
            recent_rewards,
            related_stakes,
        }))
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>> {
        self.store.search(query, limit)
    }
}
