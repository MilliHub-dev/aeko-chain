//! Process-local HashMap implementation. Default when `DATABASE_URL` is
//! unset (local dev, CI smoke tests). Unbounded — switch to
//! `PgExplorerStore` for any non-throwaway deployment.

use {
    crate::{
        indexer::IndexSink,
        models::{
            BlockRecord, CreatorRewardRecord, EngagementRecord, NftRecord, SearchResultRecord,
            SocialPostRecord, SocialStakeRecord, TokenTransferRecord, TransactionRecord,
            WalletProfileRecord,
        },
        store::ExplorerReadStore,
    },
    anyhow::Result,
    std::{
        collections::HashMap,
        sync::{Arc, RwLock},
    },
};

#[derive(Clone, Default)]
pub struct InMemoryExplorerStore {
    state: Arc<RwLock<ExplorerStoreState>>,
}

#[derive(Default)]
struct ExplorerStoreState {
    blocks: HashMap<u64, BlockRecord>,
    transactions: HashMap<String, TransactionRecord>,
    token_transfers: Vec<TokenTransferRecord>,
    nfts: HashMap<String, NftRecord>,
    posts: HashMap<String, SocialPostRecord>,
    creator_rewards: HashMap<String, CreatorRewardRecord>,
    engagement_events: HashMap<String, EngagementRecord>,
    social_stakes: HashMap<String, SocialStakeRecord>,
    wallet_profiles: HashMap<String, WalletProfileRecord>,
}

impl InMemoryExplorerStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl IndexSink for InMemoryExplorerStore {
    fn persist_block(&self, block: BlockRecord) -> Result<()> {
        self.state.write().unwrap().blocks.insert(block.slot, block);
        Ok(())
    }

    fn persist_transactions(&self, transactions: Vec<TransactionRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for transaction in transactions {
            state
                .transactions
                .insert(transaction.signature.clone(), transaction);
        }
        Ok(())
    }

    fn persist_token_transfers(&self, transfers: Vec<TokenTransferRecord>) -> Result<()> {
        self.state.write().unwrap().token_transfers.extend(transfers);
        Ok(())
    }

    fn persist_nft_updates(&self, nfts: Vec<NftRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for nft in nfts {
            state.nfts.insert(nft.token_id.clone(), nft);
        }
        Ok(())
    }

    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for post in posts {
            state.posts.insert(post.post_id.clone(), post);
        }
        Ok(())
    }

    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for reward in rewards {
            state.creator_rewards.insert(
                creator_reward_key(&reward.creator, reward.epoch),
                reward,
            );
        }
        Ok(())
    }

    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for event in events {
            state.engagement_events.insert(event.proof_id.clone(), event);
        }
        Ok(())
    }

    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for stake in stakes {
            state.social_stakes.insert(stake.position_id.clone(), stake);
        }
        Ok(())
    }

    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()> {
        let mut state = self.state.write().unwrap();
        for profile in profiles {
            state.wallet_profiles.insert(profile.address.clone(), profile);
        }
        Ok(())
    }
}

impl ExplorerReadStore for InMemoryExplorerStore {
    fn list_blocks(&self, limit: usize) -> Result<Vec<BlockRecord>> {
        let mut blocks = self
            .state
            .read()
            .unwrap()
            .blocks
            .values()
            .cloned()
            .collect::<Vec<_>>();
        blocks.sort_by(|left, right| right.slot.cmp(&left.slot));
        blocks.truncate(limit);
        Ok(blocks)
    }

    fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        Ok(self.state.read().unwrap().blocks.get(&slot).cloned())
    }

    fn list_transactions(&self, limit: usize) -> Result<Vec<TransactionRecord>> {
        let mut transactions = self
            .state
            .read()
            .unwrap()
            .transactions
            .values()
            .cloned()
            .collect::<Vec<_>>();
        transactions.sort_by(|left, right| right.slot.cmp(&left.slot));
        transactions.truncate(limit);
        Ok(transactions)
    }

    fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>> {
        Ok(self
            .state
            .read()
            .unwrap()
            .transactions
            .get(signature)
            .cloned())
    }

    fn list_token_transfers(&self, mint: Option<&str>, limit: usize) -> Result<Vec<TokenTransferRecord>> {
        let mut transfers = self.state.read().unwrap().token_transfers.clone();
        if let Some(mint) = mint {
            transfers.retain(|transfer| transfer.mint == mint);
        }
        transfers.truncate(limit);
        Ok(transfers)
    }

    fn list_nfts(&self, collection_id: Option<&str>, limit: usize) -> Result<Vec<NftRecord>> {
        let mut nfts = self
            .state
            .read()
            .unwrap()
            .nfts
            .values()
            .cloned()
            .collect::<Vec<_>>();
        if let Some(collection_id) = collection_id {
            nfts.retain(|nft| nft.collection_id.as_deref() == Some(collection_id));
        }
        nfts.truncate(limit);
        Ok(nfts)
    }

    fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>> {
        Ok(self.state.read().unwrap().nfts.get(token_id).cloned())
    }

    fn list_posts(&self, creator: Option<&str>, limit: usize) -> Result<Vec<SocialPostRecord>> {
        let mut posts = self
            .state
            .read()
            .unwrap()
            .posts
            .values()
            .cloned()
            .collect::<Vec<_>>();
        if let Some(creator) = creator {
            posts.retain(|post| post.creator == creator);
        }
        posts.sort_by(|left, right| right.created_at_unix.cmp(&left.created_at_unix));
        posts.truncate(limit);
        Ok(posts)
    }

    fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>> {
        Ok(self.state.read().unwrap().posts.get(post_id).cloned())
    }

    fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>> {
        let mut rewards = self
            .state
            .read()
            .unwrap()
            .creator_rewards
            .values()
            .cloned()
            .collect::<Vec<_>>();
        if let Some(creator) = creator {
            rewards.retain(|reward| reward.creator == creator);
        }
        rewards.sort_by(|left, right| right.epoch.cmp(&left.epoch));
        rewards.truncate(limit);
        Ok(rewards)
    }

    fn list_engagement_events(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<EngagementRecord>> {
        let mut events = self
            .state
            .read()
            .unwrap()
            .engagement_events
            .values()
            .cloned()
            .collect::<Vec<_>>();
        if let Some(creator) = creator {
            events.retain(|event| event.target_creator == creator);
        }
        events.sort_by(|left, right| right.slot.cmp(&left.slot));
        events.truncate(limit);
        Ok(events)
    }

    fn list_social_stakes(
        &self,
        wallet: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialStakeRecord>> {
        let mut stakes = self
            .state
            .read()
            .unwrap()
            .social_stakes
            .values()
            .cloned()
            .collect::<Vec<_>>();
        if let Some(wallet) = wallet {
            stakes.retain(|stake| stake.staker == wallet || stake.creator == wallet);
        }
        stakes.truncate(limit);
        Ok(stakes)
    }

    fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>> {
        Ok(self
            .state
            .read()
            .unwrap()
            .wallet_profiles
            .get(address)
            .cloned())
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>> {
        let state = self.state.read().unwrap();
        let mut results = Vec::new();

        results.extend(
            state
                .blocks
                .values()
                .filter(|block| {
                    block.blockhash.contains(query) || block.slot.to_string() == query
                })
                .cloned()
                .map(SearchResultRecord::Block),
        );
        results.extend(
            state
                .transactions
                .values()
                .filter(|tx| tx.signature.contains(query))
                .cloned()
                .map(SearchResultRecord::Transaction),
        );
        results.extend(
            state
                .wallet_profiles
                .values()
                .filter(|wallet| wallet.address.contains(query))
                .cloned()
                .map(SearchResultRecord::Wallet),
        );
        results.extend(
            state
                .token_transfers
                .iter()
                .filter(|transfer| {
                    transfer.mint.contains(query)
                        || transfer.source.contains(query)
                        || transfer.destination.contains(query)
                        || transfer.signature.contains(query)
                })
                .cloned()
                .map(SearchResultRecord::TokenTransfer),
        );
        results.extend(
            state
                .nfts
                .values()
                .filter(|nft| {
                    nft.token_id.contains(query)
                        || nft.owner.contains(query)
                        || nft.creator.contains(query)
                        || nft
                            .collection_id
                            .as_deref()
                            .is_some_and(|collection_id| collection_id.contains(query))
                })
                .cloned()
                .map(SearchResultRecord::Nft),
        );
        results.extend(
            state
                .posts
                .values()
                .filter(|post| post.post_id.contains(query) || post.creator.contains(query))
                .cloned()
                .map(SearchResultRecord::SocialPost),
        );
        results.extend(
            state
                .engagement_events
                .values()
                .filter(|event| event.proof_id.contains(query) || event.target_creator.contains(query))
                .cloned()
                .map(SearchResultRecord::Engagement),
        );

        results.truncate(limit);
        Ok(results)
    }
}

fn creator_reward_key(creator: &str, epoch: u64) -> String {
    format!("{creator}:{epoch}")
}
