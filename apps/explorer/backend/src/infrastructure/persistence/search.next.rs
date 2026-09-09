use {
    super::PostgresRepository,
    crate::models::{
        BlockRecord, EngagementRecord, NftRecord, SearchResultRecord, SocialPostRecord,
        TokenTransferRecord, TransactionRecord, WalletProfileRecord,
    },
    anyhow::{Context, Result},
    sqlx::Row,
};

impl PostgresRepository {
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>> {
        let query = query.trim();
        if query.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let escaped = query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        let limit_i = limit as i64;
        let mut out = Vec::with_capacity(limit);

        let blocks = sqlx::query(
            r#"
            SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
            FROM blocks
            WHERE blockhash ILIKE $1 ESCAPE '\\' OR slot::TEXT = $2
            ORDER BY slot DESC LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching blocks")?;
        for row in blocks {
            if out.len() >= limit { break; }
            out.push(SearchResultRecord::Block(BlockRecord {
                slot: u64::try_from(row.get::<i64, _>("slot")).context("negative block slot")?,
                blockhash: row.get("blockhash"),
                parent_slot: u64::try_from(row.get::<i64, _>("parent_slot")).context("negative parent slot")?,
                transaction_count: u64::try_from(row.get::<i64, _>("transaction_count")).context("negative transaction count")?,
                producer: row.get("producer"),
                unix_timestamp: row.get("unix_timestamp"),
            }));
        }

        if out.len() < limit {
            let rows = sqlx::query(
                "SELECT signature, slot, success, fee, primary_program, signer FROM transactions WHERE signature ILIKE $1 ESCAPE '\\' ORDER BY slot DESC LIMIT $2",
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching transactions")?;
            for row in rows {
                if out.len() >= limit { break; }
                out.push(SearchResultRecord::Transaction(TransactionRecord {
                    signature: row.get("signature"),
                    slot: u64::try_from(row.get::<i64, _>("slot")).context("negative transaction slot")?,
                    success: row.get("success"),
                    fee: u64::try_from(row.get::<i64, _>("fee")).context("negative transaction fee")?,
                    primary_program: row.get("primary_program"),
                    signer: row.get("signer"),
                }));
            }
        }

        if out.len() < limit {
            let rows = sqlx::query(
                "SELECT address, reputation_score, native_balance, token_count, nft_count FROM wallet_profiles WHERE address ILIKE $1 ESCAPE '\\' LIMIT $2",
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching wallet profiles")?;
            for row in rows {
                if out.len() >= limit { break; }
                let native_balance = row
                    .get::<Option<String>, _>("native_balance")
                    .map(|value| super::parse_u64_text(&value, "wallet_profiles.native_balance"))
                    .transpose()?;
                out.push(SearchResultRecord::Wallet(WalletProfileRecord {
                    address: row.get("address"),
                    reputation_score: row
                        .get::<Option<i32>, _>("reputation_score")
                        .map(u16::try_from)
                        .transpose()
                        .context("invalid reputation score")?,
                    native_balance,
                    token_count: usize::try_from(row.get::<i64, _>("token_count")).context("negative token count")?,
                    nft_count: usize::try_from(row.get::<i64, _>("nft_count")).context("negative NFT count")?,
                }));
            }
        }

        if out.len() < limit {
            let rows = sqlx::query(
                r#"
                SELECT mint, source, destination, amount, signature, event_index, slot
                FROM token_transfers
                WHERE mint ILIKE $1 ESCAPE '\\'
                   OR source ILIKE $1 ESCAPE '\\'
                   OR destination ILIKE $1 ESCAPE '\\'
                   OR signature ILIKE $1 ESCAPE '\\'
                ORDER BY slot DESC LIMIT $2
                "#,
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching token transfers")?;
            for row in rows {
                if out.len() >= limit { break; }
                let amount: String = row.get("amount");
                super::parse_u64_text(&amount, "token_transfers.amount")?;
                out.push(SearchResultRecord::TokenTransfer(TokenTransferRecord {
                    mint: row.get("mint"),
                    source: row.get("source"),
                    destination: row.get("destination"),
                    amount,
                    signature: row.get("signature"),
                    event_index: row.get("event_index"),
                    slot: u64::try_from(row.get::<i64, _>("slot")).context("negative transfer slot")?,
                }));
            }
        }

        if out.len() < limit {
            let rows = sqlx::query(
                r#"
                SELECT token_id, collection_id, owner, creator, metadata_uri, frozen, last_seen_slot
                FROM nfts
                WHERE token_id ILIKE $1 ESCAPE '\\'
                   OR owner ILIKE $1 ESCAPE '\\'
                   OR creator ILIKE $1 ESCAPE '\\'
                   OR collection_id ILIKE $1 ESCAPE '\\'
                LIMIT $2
                "#,
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching NFTs")?;
            for row in rows {
                if out.len() >= limit { break; }
                out.push(SearchResultRecord::Nft(NftRecord {
                    token_id: row.get("token_id"),
                    collection_id: row.get("collection_id"),
                    owner: row.get("owner"),
                    creator: row.get("creator"),
                    metadata_uri: row.get("metadata_uri"),
                    frozen: row.get("frozen"),
                    last_seen_slot: u64::try_from(row.get::<i64, _>("last_seen_slot")).context("negative NFT last_seen_slot")?,
                }));
            }
        }

        if out.len() < limit {
            let rows = sqlx::query(
                r#"
                SELECT post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id,
                       post_kind, created_at_unix, edited_at_unix, visibility, moderation_state,
                       signature_ref, observed_slot
                FROM posts
                WHERE post_id ILIKE $1 ESCAPE '\\' OR creator ILIKE $1 ESCAPE '\\'
                ORDER BY created_at_unix DESC LIMIT $2
                "#,
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching social posts")?;
            for row in rows {
                if out.len() >= limit { break; }
                out.push(SearchResultRecord::SocialPost(SocialPostRecord {
                    post_id: row.get("post_id"),
                    creator: row.get("creator"),
                    content_hash: row.get("content_hash"),
                    metadata_hash: row.get("metadata_hash"),
                    content_uri: row.get("content_uri"),
                    parent_post_id: row.get("parent_post_id"),
                    post_kind: row.get("post_kind"),
                    created_at_unix: row.get("created_at_unix"),
                    edited_at_unix: row.get("edited_at_unix"),
                    visibility: row.get("visibility"),
                    moderation_state: row.get("moderation_state"),
                    signature_ref: row.get("signature_ref"),
                    observed_slot: u64::try_from(row.get::<i64, _>("observed_slot")).context("negative post observed_slot")?,
                }));
            }
        }

        if out.len() < limit {
            let rows = sqlx::query(
                r#"
                SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight,
                       slot, unix_timestamp, replay_guard, observed_slot
                FROM engagement_events
                WHERE proof_id ILIKE $1 ESCAPE '\\'
                   OR actor ILIKE $1 ESCAPE '\\'
                   OR target_creator ILIKE $1 ESCAPE '\\'
                   OR target_post_id ILIKE $1 ESCAPE '\\'
                ORDER BY slot DESC LIMIT $2
                "#,
            )
            .bind(&pattern)
            .bind(limit_i)
            .fetch_all(&self.pool)
            .await
            .context("searching engagement events")?;
            for row in rows {
                if out.len() >= limit { break; }
                out.push(SearchResultRecord::Engagement(EngagementRecord {
                    proof_id: row.get("proof_id"),
                    actor: row.get("actor"),
                    target_creator: row.get("target_creator"),
                    target_post_id: row.get("target_post_id"),
                    action_kind: row.get("action_kind"),
                    action_weight: u32::try_from(row.get::<i64, _>("action_weight")).context("invalid action weight")?,
                    slot: u64::try_from(row.get::<i64, _>("slot")).context("negative engagement slot")?,
                    unix_timestamp: row.get("unix_timestamp"),
                    replay_guard: row.get("replay_guard"),
                    observed_slot: u64::try_from(row.get::<i64, _>("observed_slot")).context("negative engagement observed_slot")?,
                }));
            }
        }

        Ok(out)
    }
}
