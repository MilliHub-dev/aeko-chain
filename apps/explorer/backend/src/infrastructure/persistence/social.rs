use {
    super::{parse_u64_text, PostgresRepository},
    crate::models::{
        AntiSpamProfileRecord, CreatorRevenueRecord, CreatorRewardRecord, CreatorTipRecord,
        EngagementRecord, PaidContentUnlockRecord, RewardSettlementRecord, SocialDomainSnapshotRecord,
        SocialPostRecord, SocialRewardAccountRecord, SocialSnapshot, SocialStakeRecord,
        StakeYieldRecord, SubscriptionRecord,
    },
    anyhow::{Context, Result},
    sqlx::{Postgres, Row, Transaction},
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

#[derive(Clone, Debug, Default)]
pub struct YieldQuery {
    pub wallet: Option<String>,
    pub creator: Option<String>,
    pub staker: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct TipQuery {
    pub creator: Option<String>,
    pub sender: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct SubscriptionQuery {
    pub creator: Option<String>,
    pub subscriber: Option<String>,
    pub state: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct UnlockQuery {
    pub creator: Option<String>,
    pub buyer: Option<String>,
    pub content_id: Option<String>,
    pub limit: usize,
}

impl PostgresRepository {
    pub async fn persist_social_snapshot(&self, snapshot: SocialSnapshot) -> Result<()> {
        let mut tx = self.pool.begin().await.context("begin canonical Social snapshot transaction")?;

        for table in [
            "posts",
            "engagement_events",
            "creator_rewards",
            "social_reward_accounts",
            "reward_settlements",
            "social_stakes",
            "stake_yield_records",
            "anti_spam_profiles",
            "creator_tips",
            "social_subscriptions",
            "paid_content_unlocks",
            "creator_revenues",
            "social_domain_snapshots",
        ] {
            sqlx::query(&format!("DELETE FROM {table}"))
                .execute(&mut *tx)
                .await
                .with_context(|| format!("clearing {table} for authoritative Social snapshot"))?;
        }

        persist_posts(&mut tx, &snapshot.posts).await?;
        persist_engagement(&mut tx, &snapshot.engagement).await?;
        persist_reward_epochs(&mut tx, &snapshot.reward_epochs).await?;
        persist_reward_accounts(&mut tx, &snapshot.reward_accounts).await?;
        persist_reward_settlements(&mut tx, &snapshot.reward_settlements).await?;
        persist_stakes(&mut tx, &snapshot.stakes).await?;
        persist_stake_yields(&mut tx, &snapshot.stake_yields).await?;
        persist_anti_spam(&mut tx, &snapshot.anti_spam_profiles).await?;
        persist_tips(&mut tx, &snapshot.tips).await?;
        persist_subscriptions(&mut tx, &snapshot.subscriptions).await?;
        persist_unlocks(&mut tx, &snapshot.unlocks).await?;
        persist_revenues(&mut tx, &snapshot.revenues).await?;
        persist_domains(&mut tx, &snapshot.domains).await?;

        let next_slot = snapshot.slot.checked_add(1).context("Social projection slot overflow")?;
        sqlx::query(
            r#"
            INSERT INTO indexer_cursors (stream, next_slot)
            VALUES ('social', $1)
            ON CONFLICT (stream) DO UPDATE SET
                next_slot = EXCLUDED.next_slot,
                updated_at = NOW()
            "#,
        )
        .bind(i64::try_from(next_slot).context("Social projection next slot exceeds BIGINT")?)
        .execute(&mut *tx)
        .await
        .context("advancing Social projection cursor")?;

        tx.commit().await.context("commit canonical Social snapshot transaction")
    }

    pub async fn list_posts(&self, query: &PostQuery) -> Result<Vec<SocialPostRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id,
                   post_kind, created_at_unix, edited_at_unix, visibility, moderation_state, signature_ref
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
        .bind(i64::try_from(query.limit).context("post limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing social posts")?;
        Ok(rows.into_iter().map(post_from_row).collect())
    }

    pub async fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>> {
        let row = sqlx::query(
            r#"
            SELECT post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id,
                   post_kind, created_at_unix, edited_at_unix, visibility, moderation_state, signature_ref
            FROM posts WHERE post_id = $1
            "#,
        )
        .bind(post_id)
        .fetch_optional(&self.pool)
        .await
        .context("getting social post")?;
        Ok(row.map(post_from_row))
    }

    pub async fn list_engagement_events(&self, query: &EngagementQuery) -> Result<Vec<EngagementRecord>> {
        let before = query.before.map(i64::try_from).transpose().context("before slot exceeds BIGINT")?;
        let after = query.after.map(i64::try_from).transpose().context("after slot exceeds BIGINT")?;
        let rows = sqlx::query(
            r#"
            SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight,
                   slot, unix_timestamp, replay_guard
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
        .bind(i64::try_from(query.limit).context("engagement limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing engagement events")?;
        rows.into_iter().map(engagement_from_row).collect()
    }

    pub async fn list_creator_rewards(&self, creator: Option<&str>, limit: usize) -> Result<Vec<CreatorRewardRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT creator, epoch, earned_points, reward_amount, claimed_amount, claimable_amount, penalty_bps
            FROM creator_rewards
            WHERE ($1::TEXT IS NULL OR creator = $1)
            ORDER BY epoch DESC, creator ASC
            LIMIT $2
            "#,
        )
        .bind(creator)
        .bind(i64::try_from(limit).context("reward limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing creator rewards")?;
        rows.into_iter().map(reward_from_row).collect()
    }

    pub async fn list_reward_accounts(&self, creator: Option<&str>, limit: usize) -> Result<Vec<SocialRewardAccountRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT creator, total_earned, total_claimed, claimable_amount, last_settled_epoch
            FROM social_reward_accounts
            WHERE ($1::TEXT IS NULL OR creator = $1)
            ORDER BY creator ASC LIMIT $2
            "#,
        )
        .bind(creator)
        .bind(i64::try_from(limit).context("reward account limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing Social reward accounts")?;
        rows.into_iter().map(reward_account_from_row).collect()
    }

    pub async fn list_reward_settlements(&self, limit: usize) -> Result<Vec<RewardSettlementRecord>> {
        let rows = sqlx::query(
            "SELECT epoch, reward_pool_amount, total_effective_points, settled_creator_count FROM reward_settlements ORDER BY epoch DESC LIMIT $1",
        )
        .bind(i64::try_from(limit).context("settlement limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing reward settlements")?;
        rows.into_iter().map(settlement_from_row).collect()
    }

    pub async fn list_social_stakes(&self, query: &StakeQuery) -> Result<Vec<SocialStakeRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT position_id, staker, creator, staked_amount, activated_at_epoch, unlock_epoch,
                   state, accumulated_yield, claimed_yield
            FROM social_stakes
            WHERE ($1::TEXT IS NULL OR staker = $1 OR creator = $1)
              AND ($2::TEXT IS NULL OR creator = $2)
              AND ($3::TEXT IS NULL OR staker = $3)
              AND ($4::TEXT IS NULL OR state = $4)
            ORDER BY position_id ASC LIMIT $5
            "#,
        )
        .bind(query.wallet.as_deref())
        .bind(query.creator.as_deref())
        .bind(query.staker.as_deref())
        .bind(query.state.as_deref())
        .bind(i64::try_from(query.limit).context("stake limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing social stakes")?;
        rows.into_iter().map(stake_from_row).collect()
    }

    pub async fn list_stake_yields(&self, query: &YieldQuery) -> Result<Vec<StakeYieldRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT epoch, position_id, creator, staker, yield_amount
            FROM stake_yield_records
            WHERE ($1::TEXT IS NULL OR creator = $1 OR staker = $1)
              AND ($2::TEXT IS NULL OR creator = $2)
              AND ($3::TEXT IS NULL OR staker = $3)
            ORDER BY epoch DESC, position_id ASC LIMIT $4
            "#,
        )
        .bind(query.wallet.as_deref())
        .bind(query.creator.as_deref())
        .bind(query.staker.as_deref())
        .bind(i64::try_from(query.limit).context("yield limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing stake yields")?;
        rows.into_iter().map(yield_from_row).collect()
    }

    pub async fn list_anti_spam_profiles(&self, wallet: Option<&str>, limit: usize) -> Result<Vec<AntiSpamProfileRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT wallet, post_count_window, engagement_count_window, spam_flags, gated_until_epoch,
                   slash_count, last_flagged_at_unix, reputation_score
            FROM anti_spam_profiles
            WHERE ($1::TEXT IS NULL OR wallet = $1)
            ORDER BY wallet ASC LIMIT $2
            "#,
        )
        .bind(wallet)
        .bind(i64::try_from(limit).context("anti-spam limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing anti-spam profiles")?;
        rows.into_iter().map(anti_spam_from_row).collect()
    }

    pub async fn reputation_score(&self, wallet: &str) -> Result<Option<u16>> {
        let value: Option<i32> = sqlx::query_scalar("SELECT reputation_score FROM anti_spam_profiles WHERE wallet = $1")
            .bind(wallet)
            .fetch_optional(&self.pool)
            .await
            .context("reading authoritative projected reputation")?;
        value.map(|score| u16::try_from(score).context("persisted reputation score is outside u16 range")).transpose()
    }

    pub async fn list_tips(&self, query: &TipQuery) -> Result<Vec<CreatorTipRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT tip_id, creator, sender, amount, timestamp FROM creator_tips
            WHERE ($1::TEXT IS NULL OR creator = $1)
              AND ($2::TEXT IS NULL OR sender = $2)
            ORDER BY timestamp DESC, tip_id ASC LIMIT $3
            "#,
        )
        .bind(query.creator.as_deref())
        .bind(query.sender.as_deref())
        .bind(i64::try_from(query.limit).context("tip limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing creator tips")?;
        rows.into_iter().map(tip_from_row).collect()
    }

    pub async fn list_subscriptions(&self, query: &SubscriptionQuery) -> Result<Vec<SubscriptionRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT subscription_id, creator, subscriber, amount_per_period, period_seconds,
                   started_at_unix, valid_until_unix, state
            FROM social_subscriptions
            WHERE ($1::TEXT IS NULL OR creator = $1)
              AND ($2::TEXT IS NULL OR subscriber = $2)
              AND ($3::TEXT IS NULL OR state = $3)
            ORDER BY valid_until_unix DESC, subscription_id ASC LIMIT $4
            "#,
        )
        .bind(query.creator.as_deref())
        .bind(query.subscriber.as_deref())
        .bind(query.state.as_deref())
        .bind(i64::try_from(query.limit).context("subscription limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing Social subscriptions")?;
        rows.into_iter().map(subscription_from_row).collect()
    }

    pub async fn list_unlocks(&self, query: &UnlockQuery) -> Result<Vec<PaidContentUnlockRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT unlock_id, content_id, creator, buyer, amount, unlocked_at_unix
            FROM paid_content_unlocks
            WHERE ($1::TEXT IS NULL OR creator = $1)
              AND ($2::TEXT IS NULL OR buyer = $2)
              AND ($3::TEXT IS NULL OR content_id = $3)
            ORDER BY unlocked_at_unix DESC, unlock_id ASC LIMIT $4
            "#,
        )
        .bind(query.creator.as_deref())
        .bind(query.buyer.as_deref())
        .bind(query.content_id.as_deref())
        .bind(i64::try_from(query.limit).context("unlock limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing paid content unlocks")?;
        rows.into_iter().map(unlock_from_row).collect()
    }

    pub async fn list_creator_revenues(&self, creator: Option<&str>, limit: usize) -> Result<Vec<CreatorRevenueRecord>> {
        let rows = sqlx::query(
            "SELECT creator, total_earned, total_claimed, claimable_amount FROM creator_revenues WHERE ($1::TEXT IS NULL OR creator = $1) ORDER BY creator ASC LIMIT $2",
        )
        .bind(creator)
        .bind(i64::try_from(limit).context("revenue limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing creator revenues")?;
        rows.into_iter().map(revenue_from_row).collect()
    }

    pub async fn list_social_domains(&self) -> Result<Vec<SocialDomainSnapshotRecord>> {
        let rows = sqlx::query(
            "SELECT domain, state_account, program_id, slot, epoch, item_count FROM social_domain_snapshots ORDER BY domain ASC",
        )
        .fetch_all(&self.pool)
        .await
        .context("listing Social domain snapshots")?;
        rows.into_iter().map(domain_from_row).collect()
    }
}

async fn persist_posts(tx: &mut Transaction<'_, Postgres>, rows: &[SocialPostRecord]) -> Result<()> {
    for row in rows {
        sqlx::query(
            r#"INSERT INTO posts
            (post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id, post_kind,
             created_at_unix, edited_at_unix, visibility, moderation_state, signature_ref)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)"#,
        )
        .bind(&row.post_id).bind(&row.creator).bind(&row.content_hash).bind(&row.metadata_hash)
        .bind(&row.content_uri).bind(&row.parent_post_id).bind(&row.post_kind).bind(row.created_at_unix)
        .bind(row.edited_at_unix).bind(&row.visibility).bind(&row.moderation_state).bind(&row.signature_ref)
        .execute(&mut **tx).await.context("persisting canonical Social post")?;
    }
    Ok(())
}

async fn persist_engagement(tx: &mut Transaction<'_, Postgres>, rows: &[EngagementRecord]) -> Result<()> {
    for row in rows {
        sqlx::query(
            r#"INSERT INTO engagement_events
            (proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp, replay_guard)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
        )
        .bind(&row.proof_id).bind(&row.actor).bind(&row.target_creator).bind(&row.target_post_id)
        .bind(&row.action_kind).bind(i64::from(row.action_weight))
        .bind(i64::try_from(row.slot).context("engagement slot exceeds BIGINT")?)
        .bind(row.unix_timestamp).bind(&row.replay_guard)
        .execute(&mut **tx).await.context("persisting canonical engagement")?;
    }
    Ok(())
}

async fn persist_reward_epochs(tx: &mut Transaction<'_, Postgres>, rows: &[CreatorRewardRecord]) -> Result<()> {
    for row in rows {
        sqlx::query(
            r#"INSERT INTO creator_rewards
            (creator, epoch, earned_points, reward_amount, claimed_amount, claimable_amount, penalty_bps)
            VALUES ($1,$2,$3,$4,$5,$6,$7)"#,
        )
        .bind(&row.creator).bind(i64::try_from(row.epoch).context("reward epoch exceeds BIGINT")?)
        .bind(&row.earned_points).bind(row.reward_amount.to_string()).bind(row.claimed_amount.to_string())
        .bind(row.claimable_amount.to_string()).bind(i32::from(row.penalty_bps))
        .execute(&mut **tx).await.context("persisting creator reward epoch")?;
    }
    Ok(())
}

async fn persist_reward_accounts(tx: &mut Transaction<'_, Postgres>, rows: &[SocialRewardAccountRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO social_reward_accounts (creator,total_earned,total_claimed,claimable_amount,last_settled_epoch) VALUES ($1,$2,$3,$4,$5)")
            .bind(&row.creator).bind(&row.total_earned).bind(&row.total_claimed).bind(row.claimable_amount.to_string())
            .bind(i64::try_from(row.last_settled_epoch).context("last settled epoch exceeds BIGINT")?)
            .execute(&mut **tx).await.context("persisting reward account")?;
    }
    Ok(())
}

async fn persist_reward_settlements(tx: &mut Transaction<'_, Postgres>, rows: &[RewardSettlementRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO reward_settlements (epoch,reward_pool_amount,total_effective_points,settled_creator_count) VALUES ($1,$2,$3,$4)")
            .bind(i64::try_from(row.epoch).context("settlement epoch exceeds BIGINT")?)
            .bind(row.reward_pool_amount.to_string()).bind(&row.total_effective_points).bind(i64::from(row.settled_creator_count))
            .execute(&mut **tx).await.context("persisting reward settlement")?;
    }
    Ok(())
}

async fn persist_stakes(tx: &mut Transaction<'_, Postgres>, rows: &[SocialStakeRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO social_stakes (position_id,staker,creator,staked_amount,activated_at_epoch,unlock_epoch,state,accumulated_yield,claimed_yield) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(&row.position_id).bind(&row.staker).bind(&row.creator).bind(row.staked_amount.to_string())
            .bind(i64::try_from(row.activated_at_epoch).context("activated epoch exceeds BIGINT")?)
            .bind(row.unlock_epoch.map(i64::try_from).transpose().context("unlock epoch exceeds BIGINT")?)
            .bind(&row.state).bind(row.accumulated_yield.to_string()).bind(row.claimed_yield.to_string())
            .execute(&mut **tx).await.context("persisting Social stake")?;
    }
    Ok(())
}

async fn persist_stake_yields(tx: &mut Transaction<'_, Postgres>, rows: &[StakeYieldRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO stake_yield_records (epoch,position_id,creator,staker,yield_amount) VALUES ($1,$2,$3,$4,$5)")
            .bind(i64::try_from(row.epoch).context("yield epoch exceeds BIGINT")?).bind(&row.position_id)
            .bind(&row.creator).bind(&row.staker).bind(row.yield_amount.to_string())
            .execute(&mut **tx).await.context("persisting stake yield")?;
    }
    Ok(())
}

async fn persist_anti_spam(tx: &mut Transaction<'_, Postgres>, rows: &[AntiSpamProfileRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO anti_spam_profiles (wallet,post_count_window,engagement_count_window,spam_flags,gated_until_epoch,slash_count,last_flagged_at_unix,reputation_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(&row.wallet).bind(i64::from(row.post_count_window)).bind(i64::from(row.engagement_count_window))
            .bind(i32::from(row.spam_flags)).bind(row.gated_until_epoch.map(i64::try_from).transpose().context("gated epoch exceeds BIGINT")?)
            .bind(i32::from(row.slash_count)).bind(row.last_flagged_at_unix).bind(i32::from(row.reputation_score))
            .execute(&mut **tx).await.context("persisting anti-spam profile")?;
    }
    Ok(())
}

async fn persist_tips(tx: &mut Transaction<'_, Postgres>, rows: &[CreatorTipRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO creator_tips (tip_id,creator,sender,amount,timestamp) VALUES ($1,$2,$3,$4,$5)")
            .bind(&row.tip_id).bind(&row.creator).bind(&row.sender).bind(row.amount.to_string()).bind(row.timestamp)
            .execute(&mut **tx).await.context("persisting creator tip")?;
    }
    Ok(())
}

async fn persist_subscriptions(tx: &mut Transaction<'_, Postgres>, rows: &[SubscriptionRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO social_subscriptions (subscription_id,creator,subscriber,amount_per_period,period_seconds,started_at_unix,valid_until_unix,state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(&row.subscription_id).bind(&row.creator).bind(&row.subscriber).bind(row.amount_per_period.to_string())
            .bind(i64::try_from(row.period_seconds).context("subscription period exceeds BIGINT")?)
            .bind(row.started_at_unix).bind(row.valid_until_unix).bind(&row.state)
            .execute(&mut **tx).await.context("persisting Social subscription")?;
    }
    Ok(())
}

async fn persist_unlocks(tx: &mut Transaction<'_, Postgres>, rows: &[PaidContentUnlockRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO paid_content_unlocks (unlock_id,content_id,creator,buyer,amount,unlocked_at_unix) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(&row.unlock_id).bind(&row.content_id).bind(&row.creator).bind(&row.buyer).bind(row.amount.to_string()).bind(row.unlocked_at_unix)
            .execute(&mut **tx).await.context("persisting paid content unlock")?;
    }
    Ok(())
}

async fn persist_revenues(tx: &mut Transaction<'_, Postgres>, rows: &[CreatorRevenueRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO creator_revenues (creator,total_earned,total_claimed,claimable_amount) VALUES ($1,$2,$3,$4)")
            .bind(&row.creator).bind(&row.total_earned).bind(&row.total_claimed).bind(row.claimable_amount.to_string())
            .execute(&mut **tx).await.context("persisting creator revenue")?;
    }
    Ok(())
}

async fn persist_domains(tx: &mut Transaction<'_, Postgres>, rows: &[SocialDomainSnapshotRecord]) -> Result<()> {
    for row in rows {
        sqlx::query("INSERT INTO social_domain_snapshots (domain,state_account,program_id,slot,epoch,item_count) VALUES ($1,$2,$3,$4,$5,$6)")
            .bind(&row.domain).bind(&row.state_account).bind(&row.program_id)
            .bind(i64::try_from(row.slot).context("domain slot exceeds BIGINT")?)
            .bind(i64::try_from(row.epoch).context("domain epoch exceeds BIGINT")?)
            .bind(i64::try_from(row.item_count).context("domain item count exceeds BIGINT")?)
            .execute(&mut **tx).await.context("persisting Social domain snapshot")?;
    }
    Ok(())
}

fn post_from_row(row: sqlx::postgres::PgRow) -> SocialPostRecord {
    SocialPostRecord {
        post_id: row.get("post_id"), creator: row.get("creator"), content_hash: row.get("content_hash"),
        metadata_hash: row.get("metadata_hash"), content_uri: row.get("content_uri"), parent_post_id: row.get("parent_post_id"),
        post_kind: row.get("post_kind"), created_at_unix: row.get("created_at_unix"), edited_at_unix: row.get("edited_at_unix"),
        visibility: row.get("visibility"), moderation_state: row.get("moderation_state"), signature_ref: row.get("signature_ref"),
    }
}

fn engagement_from_row(row: sqlx::postgres::PgRow) -> Result<EngagementRecord> {
    Ok(EngagementRecord {
        proof_id: row.get("proof_id"), actor: row.get("actor"), target_creator: row.get("target_creator"), target_post_id: row.get("target_post_id"),
        action_kind: row.get("action_kind"), action_weight: u32::try_from(row.get::<i64,_>("action_weight")).context("negative engagement weight")?,
        slot: u64::try_from(row.get::<i64,_>("slot")).context("negative engagement slot")?, unix_timestamp: row.get("unix_timestamp"), replay_guard: row.get("replay_guard"),
    })
}

fn reward_from_row(row: sqlx::postgres::PgRow) -> Result<CreatorRewardRecord> {
    Ok(CreatorRewardRecord {
        creator: row.get("creator"), epoch: u64::try_from(row.get::<i64,_>("epoch")).context("negative reward epoch")?,
        earned_points: row.get("earned_points"), reward_amount: parse_u64_text(&row.get::<String,_>("reward_amount"), "creator_rewards.reward_amount")?,
        claimed_amount: parse_u64_text(&row.get::<String,_>("claimed_amount"), "creator_rewards.claimed_amount")?,
        claimable_amount: parse_u64_text(&row.get::<String,_>("claimable_amount"), "creator_rewards.claimable_amount")?,
        penalty_bps: u16::try_from(row.get::<i32,_>("penalty_bps")).context("invalid reward penalty_bps")?,
    })
}

fn reward_account_from_row(row: sqlx::postgres::PgRow) -> Result<SocialRewardAccountRecord> {
    Ok(SocialRewardAccountRecord { creator: row.get("creator"), total_earned: row.get("total_earned"), total_claimed: row.get("total_claimed"),
        claimable_amount: parse_u64_text(&row.get::<String,_>("claimable_amount"), "social_reward_accounts.claimable_amount")?,
        last_settled_epoch: u64::try_from(row.get::<i64,_>("last_settled_epoch")).context("negative last settled epoch")? })
}

fn settlement_from_row(row: sqlx::postgres::PgRow) -> Result<RewardSettlementRecord> {
    Ok(RewardSettlementRecord { epoch: u64::try_from(row.get::<i64,_>("epoch")).context("negative settlement epoch")?,
        reward_pool_amount: parse_u64_text(&row.get::<String,_>("reward_pool_amount"), "reward_settlements.reward_pool_amount")?,
        total_effective_points: row.get("total_effective_points"), settled_creator_count: u32::try_from(row.get::<i64,_>("settled_creator_count")).context("invalid settled creator count")? })
}

fn stake_from_row(row: sqlx::postgres::PgRow) -> Result<SocialStakeRecord> {
    Ok(SocialStakeRecord { position_id: row.get("position_id"), staker: row.get("staker"), creator: row.get("creator"),
        staked_amount: parse_u64_text(&row.get::<String,_>("staked_amount"), "social_stakes.staked_amount")?,
        activated_at_epoch: u64::try_from(row.get::<i64,_>("activated_at_epoch")).context("negative activated epoch")?,
        unlock_epoch: row.get::<Option<i64>,_>("unlock_epoch").map(u64::try_from).transpose().context("negative unlock epoch")?, state: row.get("state"),
        accumulated_yield: parse_u64_text(&row.get::<String,_>("accumulated_yield"), "social_stakes.accumulated_yield")?,
        claimed_yield: parse_u64_text(&row.get::<String,_>("claimed_yield"), "social_stakes.claimed_yield")? })
}

fn yield_from_row(row: sqlx::postgres::PgRow) -> Result<StakeYieldRecord> {
    Ok(StakeYieldRecord { epoch: u64::try_from(row.get::<i64,_>("epoch")).context("negative yield epoch")?, position_id: row.get("position_id"), creator: row.get("creator"), staker: row.get("staker"),
        yield_amount: parse_u64_text(&row.get::<String,_>("yield_amount"), "stake_yield_records.yield_amount")? })
}

fn anti_spam_from_row(row: sqlx::postgres::PgRow) -> Result<AntiSpamProfileRecord> {
    Ok(AntiSpamProfileRecord { wallet: row.get("wallet"), post_count_window: u32::try_from(row.get::<i64,_>("post_count_window")).context("invalid post count")?,
        engagement_count_window: u32::try_from(row.get::<i64,_>("engagement_count_window")).context("invalid engagement count")?,
        spam_flags: u16::try_from(row.get::<i32,_>("spam_flags")).context("invalid spam flags")?, gated_until_epoch: row.get::<Option<i64>,_>("gated_until_epoch").map(u64::try_from).transpose().context("invalid gated epoch")?,
        slash_count: u16::try_from(row.get::<i32,_>("slash_count")).context("invalid slash count")?, last_flagged_at_unix: row.get("last_flagged_at_unix"),
        reputation_score: u16::try_from(row.get::<i32,_>("reputation_score")).context("invalid reputation score")? })
}

fn tip_from_row(row: sqlx::postgres::PgRow) -> Result<CreatorTipRecord> {
    Ok(CreatorTipRecord { tip_id: row.get("tip_id"), creator: row.get("creator"), sender: row.get("sender"), amount: parse_u64_text(&row.get::<String,_>("amount"), "creator_tips.amount")?, timestamp: row.get("timestamp") })
}

fn subscription_from_row(row: sqlx::postgres::PgRow) -> Result<SubscriptionRecord> {
    Ok(SubscriptionRecord { subscription_id: row.get("subscription_id"), creator: row.get("creator"), subscriber: row.get("subscriber"),
        amount_per_period: parse_u64_text(&row.get::<String,_>("amount_per_period"), "social_subscriptions.amount_per_period")?,
        period_seconds: u64::try_from(row.get::<i64,_>("period_seconds")).context("negative subscription period")?, started_at_unix: row.get("started_at_unix"), valid_until_unix: row.get("valid_until_unix"), state: row.get("state") })
}

fn unlock_from_row(row: sqlx::postgres::PgRow) -> Result<PaidContentUnlockRecord> {
    Ok(PaidContentUnlockRecord { unlock_id: row.get("unlock_id"), content_id: row.get("content_id"), creator: row.get("creator"), buyer: row.get("buyer"),
        amount: parse_u64_text(&row.get::<String,_>("amount"), "paid_content_unlocks.amount")?, unlocked_at_unix: row.get("unlocked_at_unix") })
}

fn revenue_from_row(row: sqlx::postgres::PgRow) -> Result<CreatorRevenueRecord> {
    Ok(CreatorRevenueRecord { creator: row.get("creator"), total_earned: row.get("total_earned"), total_claimed: row.get("total_claimed"),
        claimable_amount: parse_u64_text(&row.get::<String,_>("claimable_amount"), "creator_revenues.claimable_amount")? })
}

fn domain_from_row(row: sqlx::postgres::PgRow) -> Result<SocialDomainSnapshotRecord> {
    Ok(SocialDomainSnapshotRecord { domain: row.get("domain"), state_account: row.get("state_account"), program_id: row.get("program_id"),
        slot: u64::try_from(row.get::<i64,_>("slot")).context("negative Social domain slot")?, epoch: u64::try_from(row.get::<i64,_>("epoch")).context("negative Social domain epoch")?,
        item_count: usize::try_from(row.get::<i64,_>("item_count")).context("negative Social domain item count")? })
}
