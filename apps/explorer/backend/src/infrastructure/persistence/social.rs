use {
    super::{parse_u64_text, PostgresRepository},
    crate::models::{
        CreatorProfileRecord, CreatorRewardRecord, EngagementRecord, SocialPostRecord,
        SocialStakeRecord, WalletProfileRecord,
    },
    anyhow::{Context, Result},
    sqlx::Row,
};

#[derive(Clone, Debug, Default)]
pub struct PostQuery {
    pub creator: Option<String>,
    pub before: Option<i64>,
    pub after: Option<i64>,
    pub post_kind: Option<String>,
    pub visibility: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct EngagementQuery {
    pub creator: Option<String>,
    pub actor: Option<String>,
    pub post_id: Option<String>,
    pub action_kind: Option<String>,
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct StakeQuery {
    pub wallet: Option<String>,
    pub creator: Option<String>,
    pub staker: Option<String>,
    pub state: Option<String>,
    pub limit: usize,
}

impl PostgresRepository {
    pub async fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()> {
        if posts.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await.context("begin social-post transaction")?;
        for post in posts {
            sqlx::query(
                r#"
                INSERT INTO posts
                    (post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (post_id) DO UPDATE SET
                    creator = EXCLUDED.creator,
                    content_uri = EXCLUDED.content_uri,
                    post_kind = EXCLUDED.post_kind,
                    visibility = EXCLUDED.visibility,
                    moderation_state = EXCLUDED.moderation_state,
                    created_at_unix = EXCLUDED.created_at_unix,
                    indexed_at = NOW()
                "#,
            )
            .bind(&post.post_id)
            .bind(&post.creator)
            .bind(&post.content_uri)
            .bind(&post.post_kind)
            .bind(&post.visibility)
            .bind(&post.moderation_state)
            .bind(post.created_at_unix)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting social post {}", post.post_id))?;
        }
        tx.commit().await.context("commit social-post transaction")
    }

    pub async fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()> {
        if rewards.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await.context("begin creator-reward transaction")?;
        for reward in rewards {
            sqlx::query(
                r#"
                INSERT INTO creator_rewards (creator, epoch, reward_amount, claimable_amount)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (creator, epoch) DO UPDATE SET
                    reward_amount = EXCLUDED.reward_amount,
                    claimable_amount = EXCLUDED.claimable_amount,
                    indexed_at = NOW()
                "#,
            )
            .bind(&reward.creator)
            .bind(i64::try_from(reward.epoch).context("reward epoch exceeds BIGINT")?)
            .bind(reward.reward_amount.to_string())
            .bind(reward.claimable_amount.to_string())
            .execute(&mut *tx)
            .await
            .context("persisting creator reward")?;
        }
        tx.commit().await.context("commit creator-reward transaction")
    }

    pub async fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await.context("begin engagement transaction")?;
        for event in events {
            sqlx::query(
                r#"
                INSERT INTO engagement_events
                    (proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (proof_id) DO UPDATE SET
                    actor = EXCLUDED.actor,
                    target_creator = EXCLUDED.target_creator,
                    target_post_id = EXCLUDED.target_post_id,
                    action_kind = EXCLUDED.action_kind,
                    action_weight = EXCLUDED.action_weight,
                    slot = EXCLUDED.slot,
                    unix_timestamp = EXCLUDED.unix_timestamp,
                    indexed_at = NOW()
                "#,
            )
            .bind(&event.proof_id)
            .bind(&event.actor)
            .bind(&event.target_creator)
            .bind(&event.target_post_id)
            .bind(&event.action_kind)
            .bind(i64::from(event.action_weight))
            .bind(i64::try_from(event.slot).context("engagement slot exceeds BIGINT")?)
            .bind(event.unix_timestamp)
            .execute(&mut *tx)
            .await
            .context("persisting engagement event")?;
        }
        tx.commit().await.context("commit engagement transaction")
    }

    pub async fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()> {
        if stakes.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await.context("begin social-stake transaction")?;
        for stake in stakes {
            sqlx::query(
                r#"
                INSERT INTO social_stakes
                    (position_id, staker, creator, staked_amount, state, accumulated_yield, claimed_yield)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (position_id) DO UPDATE SET
                    staker = EXCLUDED.staker,
                    creator = EXCLUDED.creator,
                    staked_amount = EXCLUDED.staked_amount,
                    state = EXCLUDED.state,
                    accumulated_yield = EXCLUDED.accumulated_yield,
                    claimed_yield = EXCLUDED.claimed_yield,
                    indexed_at = NOW()
                "#,
            )
            .bind(&stake.position_id)
            .bind(&stake.staker)
            .bind(&stake.creator)
            .bind(stake.staked_amount.to_string())
            .bind(&stake.state)
            .bind(stake.accumulated_yield.to_string())
            .bind(stake.claimed_yield.to_string())
            .execute(&mut *tx)
            .await
            .context("persisting social stake")?;
        }
        tx.commit().await.context("commit social-stake transaction")
    }

    pub async fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()> {
        if profiles.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await.context("begin wallet-profile transaction")?;
        for profile in profiles {
            sqlx::query(
                r#"
                INSERT INTO wallet_profiles
                    (address, reputation_score, native_balance, token_count, nft_count)
                VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (address) DO UPDATE SET
                    reputation_score = EXCLUDED.reputation_score,
                    native_balance = COALESCE(EXCLUDED.native_balance, wallet_profiles.native_balance),
                    token_count = EXCLUDED.token_count,
                    nft_count = EXCLUDED.nft_count,
                    indexed_at = NOW()
                "#,
            )
            .bind(&profile.address)
            .bind(profile.reputation_score.map(i32::from))
            .bind(profile.native_balance.map(|value| value.to_string()))
            .bind(i64::try_from(profile.token_count).context("token count exceeds BIGINT")?)
            .bind(i64::try_from(profile.nft_count).context("NFT count exceeds BIGINT")?)
            .execute(&mut *tx)
            .await
            .context("persisting wallet profile")?;
        }
        tx.commit().await.context("commit wallet-profile transaction")
    }

    pub async fn list_posts(&self, query: &PostQuery) -> Result<Vec<SocialPostRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix
            FROM posts
            WHERE ($1::TEXT IS NULL OR creator = $1)
              AND ($2::BIGINT IS NULL OR created_at_unix < $2)
              AND ($3::BIGINT IS NULL OR created_at_unix > $3)
              AND ($4::TEXT IS NULL OR post_kind = $4)
              AND ($5::TEXT IS NULL OR visibility = $5)
            ORDER BY created_at_unix DESC, post_id ASC
            LIMIT $6
            "#,
        )
        .bind(query.creator.as_deref())
        .bind(query.before)
        .bind(query.after)
        .bind(query.post_kind.as_deref())
        .bind(query.visibility.as_deref())
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing social posts")?;
        Ok(rows.into_iter().map(post_from_row).collect())
    }

    pub async fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>> {
        let row = sqlx::query(
            "SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix FROM posts WHERE post_id = $1",
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await
        .context("getting social post")?;
        Ok(row.map(post_from_row))
    }

    pub async fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT creator, epoch, reward_amount, claimable_amount
            FROM creator_rewards
            WHERE ($1::TEXT IS NULL OR creator = $1)
            ORDER BY epoch DESC, creator ASC
            LIMIT $2
            "#,
        )
        .bind(creator)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing creator rewards")?;
        rows.into_iter().map(reward_from_row).collect()
    }

    pub async fn list_engagement_events(&self, query: &EngagementQuery) -> Result<Vec<EngagementRecord>> {
        let before = query.before.map(i64::try_from).transpose().context("before slot exceeds BIGINT")?;
        let after = query.after.map(i64::try_from).transpose().context("after slot exceeds BIGINT")?;
        let rows = sqlx::query(
            r#"
            SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp
            FROM engagement_events
            WHERE ($1::TEXT IS NULL OR target_creator = $1)
              AND ($2::TEXT IS NULL OR actor = $2)
              AND ($3::TEXT IS NULL OR target_post_id = $3)
              AND ($4::TEXT IS NULL OR action_kind = $4)
              AND ($5::BIGINT IS NULL OR slot < $5)
              AND ($6::BIGINT IS NULL OR slot > $6)
            ORDER BY slot DESC, proof_id ASC
            LIMIT $7
            "#,
        )
        .bind(query.creator.as_deref())
        .bind(query.actor.as_deref())
        .bind(query.post_id.as_deref())
        .bind(query.action_kind.as_deref())
        .bind(before)
        .bind(after)
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing engagement events")?;
        rows.into_iter().map(engagement_from_row).collect()
    }

    pub async fn list_social_stakes(&self, query: &StakeQuery) -> Result<Vec<SocialStakeRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT position_id, staker, creator, staked_amount, state, accumulated_yield, claimed_yield
            FROM social_stakes
            WHERE ($1::TEXT IS NULL OR staker = $1 OR creator = $1)
              AND ($2::TEXT IS NULL OR creator = $2)
              AND ($3::TEXT IS NULL OR staker = $3)
              AND ($4::TEXT IS NULL OR state = $4)
            ORDER BY position_id ASC
            LIMIT $5
            "#,
        )
        .bind(query.wallet.as_deref())
        .bind(query.creator.as_deref())
        .bind(query.staker.as_deref())
        .bind(query.state.as_deref())
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing social stakes")?;
        rows.into_iter().map(stake_from_row).collect()
    }

    pub async fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>> {
        let row = sqlx::query(
            "SELECT address, reputation_score, native_balance, token_count, nft_count FROM wallet_profiles WHERE address = $1",
        )
        .bind(address)
        .fetch_optional(&self.pool)
        .await
        .context("getting wallet profile")?;
        row.map(wallet_profile_from_row).transpose()
    }

    pub async fn get_creator_profile(
        &self,
        address: &str,
        limit: usize,
    ) -> Result<Option<CreatorProfileRecord>> {
        let Some(profile) = self.get_wallet_profile(address).await? else {
            return Ok(None);
        };
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
            total_rewards_earned = total_rewards_earned
                .checked_add(parse_u64_text(&row.get::<String, _>("reward_amount"), "creator_rewards.reward_amount")?)
                .context("creator total rewards overflow")?;
            total_claimable_rewards = total_claimable_rewards
                .checked_add(parse_u64_text(&row.get::<String, _>("claimable_amount"), "creator_rewards.claimable_amount")?)
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
            let amount = parse_u64_text(&row.get::<String, _>("staked_amount"), "social_stakes.staked_amount")?;
            total_staked_amount = total_staked_amount
                .checked_add(amount)
                .context("creator total stake overflow")?;
            if row.get::<String, _>("state") == "active" {
                active_stake_count += 1;
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
        Ok(Some(CreatorProfileRecord {
            profile,
            post_count: usize::try_from(post_count).context("negative post count")?,
            total_rewards_earned,
            total_claimable_rewards,
            active_stake_count,
            total_staked_amount,
            recent_posts,
            recent_rewards,
            related_stakes,
        }))
    }
}

fn post_from_row(row: sqlx::postgres::PgRow) -> SocialPostRecord {
    SocialPostRecord {
        post_id: row.get("post_id"),
        creator: row.get("creator"),
        content_uri: row.get("content_uri"),
        post_kind: row.get("post_kind"),
        visibility: row.get("visibility"),
        moderation_state: row.get("moderation_state"),
        created_at_unix: row.get("created_at_unix"),
    }
}

fn reward_from_row(row: sqlx::postgres::PgRow) -> Result<CreatorRewardRecord> {
    Ok(CreatorRewardRecord {
        creator: row.get("creator"),
        epoch: u64::try_from(row.get::<i64, _>("epoch")).context("negative reward epoch")?,
        reward_amount: parse_u64_text(&row.get::<String, _>("reward_amount"), "creator_rewards.reward_amount")?,
        claimable_amount: parse_u64_text(&row.get::<String, _>("claimable_amount"), "creator_rewards.claimable_amount")?,
    })
}

fn engagement_from_row(row: sqlx::postgres::PgRow) -> Result<EngagementRecord> {
    Ok(EngagementRecord {
        proof_id: row.get("proof_id"),
        actor: row.get("actor"),
        target_creator: row.get("target_creator"),
        target_post_id: row.get("target_post_id"),
        action_kind: row.get("action_kind"),
        action_weight: u32::try_from(row.get::<i64, _>("action_weight"))
            .context("invalid engagement action_weight")?,
        slot: u64::try_from(row.get::<i64, _>("slot")).context("negative engagement slot")?,
        unix_timestamp: row.get("unix_timestamp"),
    })
}

fn stake_from_row(row: sqlx::postgres::PgRow) -> Result<SocialStakeRecord> {
    Ok(SocialStakeRecord {
        position_id: row.get("position_id"),
        staker: row.get("staker"),
        creator: row.get("creator"),
        staked_amount: parse_u64_text(&row.get::<String, _>("staked_amount"), "social_stakes.staked_amount")?,
        state: row.get("state"),
        accumulated_yield: parse_u64_text(&row.get::<String, _>("accumulated_yield"), "social_stakes.accumulated_yield")?,
        claimed_yield: parse_u64_text(&row.get::<String, _>("claimed_yield"), "social_stakes.claimed_yield")?,
    })
}

fn wallet_profile_from_row(row: sqlx::postgres::PgRow) -> Result<WalletProfileRecord> {
    let native_balance = row
        .get::<Option<String>, _>("native_balance")
        .map(|value| parse_u64_text(&value, "wallet_profiles.native_balance"))
        .transpose()?;
    Ok(WalletProfileRecord {
        address: row.get("address"),
        reputation_score: row
            .get::<Option<i32>, _>("reputation_score")
            .map(u16::try_from)
            .transpose()
            .context("invalid wallet reputation_score")?,
        native_balance,
        token_count: usize::try_from(row.get::<i64, _>("token_count"))
            .context("negative wallet token_count")?,
        nft_count: usize::try_from(row.get::<i64, _>("nft_count"))
            .context("negative wallet nft_count")?,
    })
}
