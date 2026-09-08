use {
    super::{
        assets::NftQuery,
        ledger::TransactionQuery,
        social::{PostQuery, StakeQuery},
        PostgresRepository,
    },
    crate::models::{
        AccountDetailRecord, ChainAccountRecord, CreatorProfileRecord, WalletProfileRecord,
    },
    anyhow::{Context, Result},
    sqlx::Row,
};

impl PostgresRepository {
    pub async fn build_wallet_profile(
        &self,
        address: &str,
        native_balance: Option<u64>,
        reputation_score: Option<u16>,
    ) -> Result<WalletProfileRecord> {
        let token_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(DISTINCT mint) FROM token_accounts WHERE owner = $1 AND balance <> '0'",
        )
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .context("counting account token holdings")?;
        let nft_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM nfts WHERE owner = $1",
        )
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .context("counting account NFT holdings")?;

        Ok(WalletProfileRecord {
            address: address.to_string(),
            reputation_score,
            native_balance,
            token_count: usize::try_from(token_count).context("negative account token count")?,
            nft_count: usize::try_from(nft_count).context("negative account NFT count")?,
        })
    }

    pub async fn get_account_detail_from_chain(
        &self,
        account: ChainAccountRecord,
        reputation_score: Option<u16>,
        limit: usize,
    ) -> Result<AccountDetailRecord> {
        let profile = self
            .build_wallet_profile(&account.address, Some(account.lamports), reputation_score)
            .await?;
        let token_holdings = self
            .list_token_accounts_by_owner(&account.address, limit)
            .await?;
        let nft_holdings = self
            .list_nfts(&NftQuery {
                owner: Some(account.address.clone()),
                limit,
                ..NftQuery::default()
            })
            .await?;
        let recent_transactions = self
            .list_transactions(&TransactionQuery {
                address: Some(account.address.clone()),
                limit,
                ..TransactionQuery::default()
            })
            .await?;
        let recent_posts = self
            .list_posts(&PostQuery {
                creator: Some(account.address.clone()),
                limit,
                ..PostQuery::default()
            })
            .await?;
        let social_stakes = self
            .list_social_stakes(&StakeQuery {
                wallet: Some(account.address.clone()),
                limit,
                ..StakeQuery::default()
            })
            .await?;
        let creator_rewards = self
            .list_creator_rewards(Some(&account.address), limit)
            .await?;

        Ok(AccountDetailRecord {
            account,
            profile,
            token_holdings,
            nft_holdings,
            recent_transactions,
            recent_posts,
            social_stakes,
            creator_rewards,
        })
    }

    pub async fn get_creator_profile_from_chain(
        &self,
        address: &str,
        native_balance: Option<u64>,
        reputation_score: Option<u16>,
        limit: usize,
    ) -> Result<CreatorProfileRecord> {
        let profile = self
            .build_wallet_profile(address, native_balance, reputation_score)
            .await?;
        let post_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM posts WHERE creator = $1")
            .bind(address)
            .fetch_one(&self.pool)
            .await
            .context("counting creator posts")?;
        let rewards = sqlx::query(
            "SELECT reward_amount, claimable_amount FROM creator_rewards WHERE creator = $1",
        )
        .bind(address)
        .fetch_all(&self.pool)
        .await
        .context("aggregating creator rewards")?;
        let mut total_rewards_earned = 0u64;
        let mut total_claimable_rewards = 0u64;
        for row in rewards {
            let earned = super::parse_u64_text(
                &row.get::<String, _>("reward_amount"),
                "creator_rewards.reward_amount",
            )?;
            let claimable = super::parse_u64_text(
                &row.get::<String, _>("claimable_amount"),
                "creator_rewards.claimable_amount",
            )?;
            total_rewards_earned = total_rewards_earned
                .checked_add(earned)
                .context("creator total rewards overflow")?;
            total_claimable_rewards = total_claimable_rewards
                .checked_add(claimable)
                .context("creator claimable rewards overflow")?;
        }
        let stakes = sqlx::query(
            "SELECT staked_amount, state FROM social_stakes WHERE creator = $1",
        )
        .bind(address)
        .fetch_all(&self.pool)
        .await
        .context("aggregating creator stakes")?;
        let mut active_stake_count = 0usize;
        let mut total_staked_amount = 0u64;
        for row in stakes {
            let amount = super::parse_u64_text(
                &row.get::<String, _>("staked_amount"),
                "social_stakes.staked_amount",
            )?;
            total_staked_amount = total_staked_amount
                .checked_add(amount)
                .context("creator total stake overflow")?;
            if row.get::<String, _>("state") == "active" {
                active_stake_count = active_stake_count.saturating_add(1);
            }
        }

        let recent_posts = self
            .list_posts(&PostQuery {
                creator: Some(address.to_string()),
                limit,
                ..PostQuery::default()
            })
            .await?;
        let recent_rewards = self.list_creator_rewards(Some(address), limit).await?;
        let related_stakes = self
            .list_social_stakes(&StakeQuery {
                wallet: Some(address.to_string()),
                limit,
                ..StakeQuery::default()
            })
            .await?;

        Ok(CreatorProfileRecord {
            profile,
            post_count: usize::try_from(post_count).context("negative creator post count")?,
            total_rewards_earned,
            total_claimable_rewards,
            active_stake_count,
            total_staked_amount,
            recent_posts,
            recent_rewards,
            related_stakes,
        })
    }
}
