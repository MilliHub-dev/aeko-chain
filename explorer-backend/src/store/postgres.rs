//! Postgres-backed durable store. Implements both write (`IndexSink`) and
//! read (`ExplorerReadStore`) sides against a shared `sqlx::PgPool`.
//!
//! Schema and indexes live in `explorer-backend/migrations/`. `connect()`
//! runs `sqlx::migrate!()` at startup so a fresh database is fully set up
//! before the first query — no manual `psql` step.
//!
//! The store is *sync-trait-on-async-pool*: trait methods are sync (the
//! existing indexer + handlers are sync), so each method does a
//! `Handle::current().block_on(future)`. That's safe because every call
//! site is already inside `tokio::task::spawn_blocking` (see `main.rs`),
//! which means there's an async runtime handle reachable but no async
//! worker is being blocked. Don't call these methods from inside a
//! `#[tokio::main]` future directly — it will panic.

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
    anyhow::{Context, Result},
    sqlx::{postgres::PgPoolOptions, PgPool, Row},
    std::time::Duration,
    tokio::runtime::Handle,
};

#[derive(Clone)]
pub struct PgExplorerStore {
    pool: PgPool,
}

impl PgExplorerStore {
    /// Connect to Postgres and run pending migrations. Honors a small,
    /// fixed connect timeout because Coolify deploys often race the DB
    /// resource on first boot — better to log "DB not ready, retrying"
    /// than to hang forever.
    pub async fn connect(database_url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(16)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(10))
            .connect(database_url)
            .await
            .context("connecting to DATABASE_URL")?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .context("running migrations")?;

        tracing::info!("postgres store ready (migrations applied)");
        Ok(Self { pool })
    }

    fn block_on<F, T>(&self, future: F) -> Result<T>
    where
        F: std::future::Future<Output = Result<T>>,
    {
        Handle::current().block_on(future)
    }
}

// ----------------------------------------------------------------------
//  IndexSink — writes. Every method UPSERTs to be idempotent under reorg
//  / re-sync. Hot-path inserts run in a single transaction so a partial
//  failure doesn't leave a slot half-indexed.
// ----------------------------------------------------------------------

impl IndexSink for PgExplorerStore {
    fn persist_block(&self, block: BlockRecord) -> Result<()> {
        self.block_on(async {
            sqlx::query(
                r#"
                INSERT INTO blocks (slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (slot) DO UPDATE SET
                    blockhash = EXCLUDED.blockhash,
                    parent_slot = EXCLUDED.parent_slot,
                    transaction_count = EXCLUDED.transaction_count,
                    producer = EXCLUDED.producer,
                    unix_timestamp = EXCLUDED.unix_timestamp,
                    indexed_at = NOW()
                "#,
            )
            .bind(block.slot as i64)
            .bind(&block.blockhash)
            .bind(block.parent_slot as i64)
            .bind(block.transaction_count as i64)
            .bind(&block.producer)
            .bind(block.unix_timestamp)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .context("persisting block")
        })
    }

    fn persist_transactions(&self, transactions: Vec<TransactionRecord>) -> Result<()> {
        if transactions.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for record in transactions {
                sqlx::query(
                    r#"
                    INSERT INTO transactions (signature, slot, success, fee, primary_program, signer)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (signature) DO UPDATE SET
                        slot = EXCLUDED.slot,
                        success = EXCLUDED.success,
                        fee = EXCLUDED.fee,
                        primary_program = EXCLUDED.primary_program,
                        signer = EXCLUDED.signer,
                        indexed_at = NOW()
                    "#,
                )
                .bind(&record.signature)
                .bind(record.slot as i64)
                .bind(record.success)
                .bind(record.fee as i64)
                .bind(&record.primary_program)
                .bind(&record.signer)
                .execute(&mut *tx)
                .await
                .context("persisting transaction")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_token_transfers(&self, transfers: Vec<TokenTransferRecord>) -> Result<()> {
        if transfers.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for t in transfers {
                sqlx::query(
                    r#"
                    INSERT INTO token_transfers (mint, source, destination, amount, signature, slot)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (signature, mint, source, destination) DO NOTHING
                    "#,
                )
                .bind(&t.mint)
                .bind(&t.source)
                .bind(&t.destination)
                .bind(&t.amount)
                .bind(&t.signature)
                .bind(t.slot as i64)
                .execute(&mut *tx)
                .await
                .context("persisting token transfer")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_nft_updates(&self, nfts: Vec<NftRecord>) -> Result<()> {
        if nfts.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for n in nfts {
                sqlx::query(
                    r#"
                    INSERT INTO nfts (token_id, collection_id, owner, creator, metadata_uri, frozen)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (token_id) DO UPDATE SET
                        collection_id = EXCLUDED.collection_id,
                        owner = EXCLUDED.owner,
                        creator = EXCLUDED.creator,
                        metadata_uri = EXCLUDED.metadata_uri,
                        frozen = EXCLUDED.frozen,
                        indexed_at = NOW()
                    "#,
                )
                .bind(&n.token_id)
                .bind(&n.collection_id)
                .bind(&n.owner)
                .bind(&n.creator)
                .bind(&n.metadata_uri)
                .bind(n.frozen)
                .execute(&mut *tx)
                .await
                .context("persisting nft")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_social_posts(&self, posts: Vec<SocialPostRecord>) -> Result<()> {
        if posts.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for p in posts {
                sqlx::query(
                    r#"
                    INSERT INTO posts (post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
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
                .bind(&p.post_id)
                .bind(&p.creator)
                .bind(&p.content_uri)
                .bind(&p.post_kind)
                .bind(&p.visibility)
                .bind(&p.moderation_state)
                .bind(p.created_at_unix)
                .execute(&mut *tx)
                .await
                .context("persisting post")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_creator_rewards(&self, rewards: Vec<CreatorRewardRecord>) -> Result<()> {
        if rewards.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for r in rewards {
                sqlx::query(
                    r#"
                    INSERT INTO creator_rewards (creator, epoch, reward_amount, claimable_amount)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (creator, epoch) DO UPDATE SET
                        reward_amount = EXCLUDED.reward_amount,
                        claimable_amount = EXCLUDED.claimable_amount,
                        indexed_at = NOW()
                    "#,
                )
                .bind(&r.creator)
                .bind(r.epoch as i64)
                .bind(r.reward_amount.to_string())
                .bind(r.claimable_amount.to_string())
                .execute(&mut *tx)
                .await
                .context("persisting creator reward")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_engagement_events(&self, events: Vec<EngagementRecord>) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for e in events {
                sqlx::query(
                    r#"
                    INSERT INTO engagement_events
                        (proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (proof_id) DO NOTHING
                    "#,
                )
                .bind(&e.proof_id)
                .bind(&e.actor)
                .bind(&e.target_creator)
                .bind(&e.target_post_id)
                .bind(&e.action_kind)
                .bind(e.action_weight as i64)
                .bind(e.slot as i64)
                .bind(e.unix_timestamp)
                .execute(&mut *tx)
                .await
                .context("persisting engagement event")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_social_stakes(&self, stakes: Vec<SocialStakeRecord>) -> Result<()> {
        if stakes.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for s in stakes {
                sqlx::query(
                    r#"
                    INSERT INTO social_stakes
                        (position_id, staker, creator, staked_amount, state, accumulated_yield, claimed_yield)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
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
                .bind(&s.position_id)
                .bind(&s.staker)
                .bind(&s.creator)
                .bind(s.staked_amount.to_string())
                .bind(&s.state)
                .bind(s.accumulated_yield.to_string())
                .bind(s.claimed_yield.to_string())
                .execute(&mut *tx)
                .await
                .context("persisting social stake")?;
            }
            tx.commit().await.context("commit tx")
        })
    }

    fn persist_wallet_profiles(&self, profiles: Vec<WalletProfileRecord>) -> Result<()> {
        if profiles.is_empty() {
            return Ok(());
        }
        self.block_on(async {
            let mut tx = self.pool.begin().await.context("begin tx")?;
            for p in profiles {
                sqlx::query(
                    r#"
                    INSERT INTO wallet_profiles
                        (address, reputation_score, native_balance, token_count, nft_count)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (address) DO UPDATE SET
                        reputation_score = EXCLUDED.reputation_score,
                        native_balance = EXCLUDED.native_balance,
                        token_count = EXCLUDED.token_count,
                        nft_count = EXCLUDED.nft_count,
                        indexed_at = NOW()
                    "#,
                )
                .bind(&p.address)
                .bind(p.reputation_score.map(|v| v as i32))
                .bind(p.native_balance.map(|v| v.to_string()))
                .bind(p.token_count as i64)
                .bind(p.nft_count as i64)
                .execute(&mut *tx)
                .await
                .context("persisting wallet profile")?;
            }
            tx.commit().await.context("commit tx")
        })
    }
}

// ----------------------------------------------------------------------
//  ExplorerReadStore — reads. Each method maps SQL rows back into the
//  same record types the in-memory store returns, so handlers don't see
//  any difference.
// ----------------------------------------------------------------------

fn parse_u64_or_zero(s: Option<&str>) -> u64 {
    s.and_then(|v| v.parse::<u64>().ok()).unwrap_or(0)
}

impl ExplorerReadStore for PgExplorerStore {
    fn list_blocks(&self, limit: usize) -> Result<Vec<BlockRecord>> {
        self.block_on(async {
            let rows = sqlx::query(
                r#"SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
                   FROM blocks ORDER BY slot DESC LIMIT $1"#,
            )
            .bind(limit as i64)
            .fetch_all(&self.pool)
            .await
            .context("list_blocks")?;
            Ok(rows
                .into_iter()
                .map(|r| BlockRecord {
                    slot: r.get::<i64, _>("slot") as u64,
                    blockhash: r.get("blockhash"),
                    parent_slot: r.get::<i64, _>("parent_slot") as u64,
                    transaction_count: r.get::<i64, _>("transaction_count") as u64,
                    producer: r.get("producer"),
                    unix_timestamp: r.get("unix_timestamp"),
                })
                .collect())
        })
    }

    fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        self.block_on(async {
            let row = sqlx::query(
                r#"SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
                   FROM blocks WHERE slot = $1"#,
            )
            .bind(slot as i64)
            .fetch_optional(&self.pool)
            .await
            .context("get_block")?;
            Ok(row.map(|r| BlockRecord {
                slot: r.get::<i64, _>("slot") as u64,
                blockhash: r.get("blockhash"),
                parent_slot: r.get::<i64, _>("parent_slot") as u64,
                transaction_count: r.get::<i64, _>("transaction_count") as u64,
                producer: r.get("producer"),
                unix_timestamp: r.get("unix_timestamp"),
            }))
        })
    }

    fn list_transactions(&self, limit: usize) -> Result<Vec<TransactionRecord>> {
        self.block_on(async {
            let rows = sqlx::query(
                r#"SELECT signature, slot, success, fee, primary_program, signer
                   FROM transactions ORDER BY slot DESC LIMIT $1"#,
            )
            .bind(limit as i64)
            .fetch_all(&self.pool)
            .await
            .context("list_transactions")?;
            Ok(rows
                .into_iter()
                .map(|r| TransactionRecord {
                    signature: r.get("signature"),
                    slot: r.get::<i64, _>("slot") as u64,
                    success: r.get("success"),
                    fee: r.get::<i64, _>("fee") as u64,
                    primary_program: r.get("primary_program"),
                    signer: r.get("signer"),
                })
                .collect())
        })
    }

    fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>> {
        self.block_on(async {
            let row = sqlx::query(
                r#"SELECT signature, slot, success, fee, primary_program, signer
                   FROM transactions WHERE signature = $1"#,
            )
            .bind(signature)
            .fetch_optional(&self.pool)
            .await
            .context("get_transaction")?;
            Ok(row.map(|r| TransactionRecord {
                signature: r.get("signature"),
                slot: r.get::<i64, _>("slot") as u64,
                success: r.get("success"),
                fee: r.get::<i64, _>("fee") as u64,
                primary_program: r.get("primary_program"),
                signer: r.get("signer"),
            }))
        })
    }

    fn list_token_transfers(
        &self,
        mint: Option<&str>,
        limit: usize,
    ) -> Result<Vec<TokenTransferRecord>> {
        self.block_on(async {
            let rows = match mint {
                Some(mint) => sqlx::query(
                    r#"SELECT mint, source, destination, amount, signature, slot
                       FROM token_transfers WHERE mint = $1
                       ORDER BY slot DESC LIMIT $2"#,
                )
                .bind(mint)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT mint, source, destination, amount, signature, slot
                       FROM token_transfers ORDER BY slot DESC LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_token_transfers")?;
            Ok(rows
                .into_iter()
                .map(|r| TokenTransferRecord {
                    mint: r.get("mint"),
                    source: r.get("source"),
                    destination: r.get("destination"),
                    amount: r.get("amount"),
                    signature: r.get("signature"),
                    slot: r.get::<i64, _>("slot") as u64,
                })
                .collect())
        })
    }

    fn list_nfts(&self, collection_id: Option<&str>, limit: usize) -> Result<Vec<NftRecord>> {
        self.block_on(async {
            let rows = match collection_id {
                Some(c) => sqlx::query(
                    r#"SELECT token_id, collection_id, owner, creator, metadata_uri, frozen
                       FROM nfts WHERE collection_id = $1 LIMIT $2"#,
                )
                .bind(c)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT token_id, collection_id, owner, creator, metadata_uri, frozen
                       FROM nfts LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_nfts")?;
            Ok(rows
                .into_iter()
                .map(|r| NftRecord {
                    token_id: r.get("token_id"),
                    collection_id: r.get("collection_id"),
                    owner: r.get("owner"),
                    creator: r.get("creator"),
                    metadata_uri: r.get("metadata_uri"),
                    frozen: r.get("frozen"),
                })
                .collect())
        })
    }

    fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>> {
        self.block_on(async {
            let row = sqlx::query(
                r#"SELECT token_id, collection_id, owner, creator, metadata_uri, frozen
                   FROM nfts WHERE token_id = $1"#,
            )
            .bind(token_id)
            .fetch_optional(&self.pool)
            .await
            .context("get_nft")?;
            Ok(row.map(|r| NftRecord {
                token_id: r.get("token_id"),
                collection_id: r.get("collection_id"),
                owner: r.get("owner"),
                creator: r.get("creator"),
                metadata_uri: r.get("metadata_uri"),
                frozen: r.get("frozen"),
            }))
        })
    }

    fn list_posts(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialPostRecord>> {
        self.block_on(async {
            let rows = match creator {
                Some(c) => sqlx::query(
                    r#"SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix
                       FROM posts WHERE creator = $1
                       ORDER BY created_at_unix DESC LIMIT $2"#,
                )
                .bind(c)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix
                       FROM posts ORDER BY created_at_unix DESC LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_posts")?;
            Ok(rows
                .into_iter()
                .map(|r| SocialPostRecord {
                    post_id: r.get("post_id"),
                    creator: r.get("creator"),
                    content_uri: r.get("content_uri"),
                    post_kind: r.get("post_kind"),
                    visibility: r.get("visibility"),
                    moderation_state: r.get("moderation_state"),
                    created_at_unix: r.get("created_at_unix"),
                })
                .collect())
        })
    }

    fn get_post(&self, post_id: &str) -> Result<Option<SocialPostRecord>> {
        self.block_on(async {
            let row = sqlx::query(
                r#"SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix
                   FROM posts WHERE post_id = $1"#,
            )
            .bind(post_id)
            .fetch_optional(&self.pool)
            .await
            .context("get_post")?;
            Ok(row.map(|r| SocialPostRecord {
                post_id: r.get("post_id"),
                creator: r.get("creator"),
                content_uri: r.get("content_uri"),
                post_kind: r.get("post_kind"),
                visibility: r.get("visibility"),
                moderation_state: r.get("moderation_state"),
                created_at_unix: r.get("created_at_unix"),
            }))
        })
    }

    fn list_creator_rewards(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CreatorRewardRecord>> {
        self.block_on(async {
            let rows = match creator {
                Some(c) => sqlx::query(
                    r#"SELECT creator, epoch, reward_amount, claimable_amount
                       FROM creator_rewards WHERE creator = $1
                       ORDER BY epoch DESC LIMIT $2"#,
                )
                .bind(c)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT creator, epoch, reward_amount, claimable_amount
                       FROM creator_rewards ORDER BY epoch DESC LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_creator_rewards")?;
            Ok(rows
                .into_iter()
                .map(|r| CreatorRewardRecord {
                    creator: r.get("creator"),
                    epoch: r.get::<i64, _>("epoch") as u64,
                    reward_amount: parse_u64_or_zero(r.get::<Option<String>, _>("reward_amount").as_deref()),
                    claimable_amount: parse_u64_or_zero(
                        r.get::<Option<String>, _>("claimable_amount").as_deref(),
                    ),
                })
                .collect())
        })
    }

    fn list_engagement_events(
        &self,
        creator: Option<&str>,
        limit: usize,
    ) -> Result<Vec<EngagementRecord>> {
        self.block_on(async {
            let rows = match creator {
                Some(c) => sqlx::query(
                    r#"SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp
                       FROM engagement_events WHERE target_creator = $1
                       ORDER BY slot DESC LIMIT $2"#,
                )
                .bind(c)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight, slot, unix_timestamp
                       FROM engagement_events ORDER BY slot DESC LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_engagement_events")?;
            Ok(rows
                .into_iter()
                .map(|r| EngagementRecord {
                    proof_id: r.get("proof_id"),
                    actor: r.get("actor"),
                    target_creator: r.get("target_creator"),
                    target_post_id: r.get("target_post_id"),
                    action_kind: r.get("action_kind"),
                    action_weight: r.get::<i64, _>("action_weight") as u32,
                    slot: r.get::<i64, _>("slot") as u64,
                    unix_timestamp: r.get("unix_timestamp"),
                })
                .collect())
        })
    }

    fn list_social_stakes(
        &self,
        wallet: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SocialStakeRecord>> {
        self.block_on(async {
            let rows = match wallet {
                Some(w) => sqlx::query(
                    r#"SELECT position_id, staker, creator, staked_amount, state, accumulated_yield, claimed_yield
                       FROM social_stakes WHERE staker = $1 OR creator = $1 LIMIT $2"#,
                )
                .bind(w)
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
                None => sqlx::query(
                    r#"SELECT position_id, staker, creator, staked_amount, state, accumulated_yield, claimed_yield
                       FROM social_stakes LIMIT $1"#,
                )
                .bind(limit as i64)
                .fetch_all(&self.pool)
                .await,
            }
            .context("list_social_stakes")?;
            Ok(rows
                .into_iter()
                .map(|r| SocialStakeRecord {
                    position_id: r.get("position_id"),
                    staker: r.get("staker"),
                    creator: r.get("creator"),
                    staked_amount: parse_u64_or_zero(
                        r.get::<Option<String>, _>("staked_amount").as_deref(),
                    ),
                    state: r.get("state"),
                    accumulated_yield: parse_u64_or_zero(
                        r.get::<Option<String>, _>("accumulated_yield").as_deref(),
                    ),
                    claimed_yield: parse_u64_or_zero(
                        r.get::<Option<String>, _>("claimed_yield").as_deref(),
                    ),
                })
                .collect())
        })
    }

    fn get_wallet_profile(&self, address: &str) -> Result<Option<WalletProfileRecord>> {
        self.block_on(async {
            let row = sqlx::query(
                r#"SELECT address, reputation_score, native_balance, token_count, nft_count
                   FROM wallet_profiles WHERE address = $1"#,
            )
            .bind(address)
            .fetch_optional(&self.pool)
            .await
            .context("get_wallet_profile")?;
            Ok(row.map(|r| WalletProfileRecord {
                address: r.get("address"),
                reputation_score: r.get::<Option<i32>, _>("reputation_score").map(|v| v as u16),
                native_balance: r
                    .get::<Option<String>, _>("native_balance")
                    .and_then(|s| s.parse::<u64>().ok()),
                token_count: r.get::<i64, _>("token_count") as usize,
                nft_count: r.get::<i64, _>("nft_count") as usize,
            }))
        })
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>> {
        // First-pass implementation: ILIKE against the most useful columns.
        // Cap at `limit` total across all categories. Move to FTS / pg_trgm
        // when result quality matters; today exact-substring is fine and
        // matches the in-memory behavior the frontend already expects.
        if query.is_empty() {
            return Ok(Vec::new());
        }
        self.block_on(async {
            let pattern = format!("%{}%", query);
            let limit_i = limit as i64;
            let mut out: Vec<SearchResultRecord> = Vec::with_capacity(limit);

            let blocks = sqlx::query(
                r#"SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
                   FROM blocks WHERE blockhash ILIKE $1 OR slot::text = $2
                   ORDER BY slot DESC LIMIT $3"#,
            )
            .bind(&pattern)
            .bind(query)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("search blocks")?;
            for r in blocks {
                if out.len() >= limit {
                    break;
                }
                out.push(SearchResultRecord::Block(BlockRecord {
                    slot: r.get::<i64, _>("slot") as u64,
                    blockhash: r.get("blockhash"),
                    parent_slot: r.get::<i64, _>("parent_slot") as u64,
                    transaction_count: r.get::<i64, _>("transaction_count") as u64,
                    producer: r.get("producer"),
                    unix_timestamp: r.get("unix_timestamp"),
                }));
            }

            if out.len() < limit {
                let txs = sqlx::query(
                    r#"SELECT signature, slot, success, fee, primary_program, signer
                       FROM transactions WHERE signature ILIKE $1
                       ORDER BY slot DESC LIMIT $2"#,
                )
                .bind(&pattern)
                .bind(limit_i)
                .fetch_all(&self.pool)
                .await
                .context("search transactions")?;
                for r in txs {
                    if out.len() >= limit {
                        break;
                    }
                    out.push(SearchResultRecord::Transaction(TransactionRecord {
                        signature: r.get("signature"),
                        slot: r.get::<i64, _>("slot") as u64,
                        success: r.get("success"),
                        fee: r.get::<i64, _>("fee") as u64,
                        primary_program: r.get("primary_program"),
                        signer: r.get("signer"),
                    }));
                }
            }

            if out.len() < limit {
                let posts = sqlx::query(
                    r#"SELECT post_id, creator, content_uri, post_kind, visibility, moderation_state, created_at_unix
                       FROM posts WHERE post_id ILIKE $1 OR creator ILIKE $1
                       ORDER BY created_at_unix DESC LIMIT $2"#,
                )
                .bind(&pattern)
                .bind(limit_i)
                .fetch_all(&self.pool)
                .await
                .context("search posts")?;
                for r in posts {
                    if out.len() >= limit {
                        break;
                    }
                    out.push(SearchResultRecord::SocialPost(SocialPostRecord {
                        post_id: r.get("post_id"),
                        creator: r.get("creator"),
                        content_uri: r.get("content_uri"),
                        post_kind: r.get("post_kind"),
                        visibility: r.get("visibility"),
                        moderation_state: r.get("moderation_state"),
                        created_at_unix: r.get("created_at_unix"),
                    }));
                }
            }

            Ok(out)
        })
    }
}
