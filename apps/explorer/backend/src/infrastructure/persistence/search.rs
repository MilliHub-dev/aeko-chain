use {
    super::PostgresRepository,
    crate::models::{
        BlockRecord, EngagementRecord, NftCollectionRecord, NftRecord, SearchResultRecord,
        SocialPostRecord, TokenMintRecord, TokenTransferRecord, TransactionRecord,
    },
    anyhow::{Context, Result},
    sqlx::Row,
    std::collections::VecDeque,
};

impl PostgresRepository {
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultRecord>> {
        let query = query.trim();
        if query.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }

        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        let limit_i = i64::try_from(limit).context("search limit exceeds BIGINT")?;
        let mut groups = Vec::<Vec<SearchResultRecord>>::new();

        let rows = sqlx::query(
            r#"
            SELECT signature, slot, success, fee, primary_program, signer
            FROM transactions
            WHERE signature ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (signature = $2) DESC, slot DESC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching transactions")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::Transaction(TransactionRecord {
                        signature: row.get("signature"),
                        slot: u64::try_from(row.get::<i64, _>("slot"))
                            .context("negative transaction slot")?,
                        success: row.get("success"),
                        fee: u64::try_from(row.get::<i64, _>("fee"))
                            .context("negative transaction fee")?,
                        primary_program: row.get("primary_program"),
                        signer: row.get("signer"),
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
            FROM blocks
            WHERE blockhash ILIKE $1 ESCAPE E'\\\\' OR slot::TEXT = $2
            ORDER BY (blockhash = $2 OR slot::TEXT = $2) DESC, slot DESC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching blocks")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::Block(BlockRecord {
                        slot: u64::try_from(row.get::<i64, _>("slot"))
                            .context("negative block slot")?,
                        blockhash: row.get("blockhash"),
                        parent_slot: u64::try_from(row.get::<i64, _>("parent_slot"))
                            .context("negative parent slot")?,
                        transaction_count: u64::try_from(row.get::<i64, _>("transaction_count"))
                            .context("negative transaction count")?,
                        producer: row.get("producer"),
                        unix_timestamp: row.get("unix_timestamp"),
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT mint, mint_authority, freeze_authority, name, symbol, decimals,
                   total_supply, supply_cap, metadata_uri, mint_policy, last_seen_slot
            FROM token_mints
            WHERE mint ILIKE $1 ESCAPE E'\\\\'
               OR name ILIKE $1 ESCAPE E'\\\\'
               OR symbol ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (mint = $2) DESC,
                     (LOWER(symbol) = LOWER($2)) DESC,
                     last_seen_slot DESC,
                     mint ASC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching token mints")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    let decimals =
                        u8::try_from(row.get::<i32, _>("decimals")).context("invalid token decimals")?;
                    let total_supply: String = row.get("total_supply");
                    total_supply
                        .parse::<u128>()
                        .with_context(|| format!("invalid token total_supply {total_supply:?}"))?;
                    let supply_cap: Option<String> = row.get("supply_cap");
                    if let Some(value) = supply_cap.as_deref() {
                        value
                            .parse::<u128>()
                            .with_context(|| format!("invalid token supply_cap {value:?}"))?;
                    }
                    Ok(SearchResultRecord::TokenMint(TokenMintRecord {
                        mint: row.get("mint"),
                        mint_authority: row.get("mint_authority"),
                        freeze_authority: row.get("freeze_authority"),
                        name: row.get("name"),
                        symbol: row.get("symbol"),
                        decimals,
                        total_supply,
                        supply_cap,
                        metadata_uri: row.get("metadata_uri"),
                        mint_policy: row.get("mint_policy"),
                        last_seen_slot: u64::try_from(row.get::<i64, _>("last_seen_slot"))
                            .context("negative token mint last_seen_slot")?,
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT collection_id, authority, name, symbol, base_uri, total_minted, last_seen_slot
            FROM nft_collections
            WHERE collection_id ILIKE $1 ESCAPE E'\\\\'
               OR authority ILIKE $1 ESCAPE E'\\\\'
               OR name ILIKE $1 ESCAPE E'\\\\'
               OR symbol ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (collection_id = $2) DESC,
                     (LOWER(symbol) = LOWER($2)) DESC,
                     last_seen_slot DESC,
                     collection_id ASC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching NFT collections")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::Collection(NftCollectionRecord {
                        collection_id: row.get("collection_id"),
                        authority: row.get("authority"),
                        name: row.get("name"),
                        symbol: row.get("symbol"),
                        base_uri: row.get("base_uri"),
                        total_minted: u64::try_from(row.get::<i64, _>("total_minted"))
                            .context("negative NFT collection total_minted")?,
                        last_seen_slot: u64::try_from(row.get::<i64, _>("last_seen_slot"))
                            .context("negative NFT collection last_seen_slot")?,
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT token_id, collection_id, owner, creator, metadata_uri, frozen, last_seen_slot
            FROM nfts
            WHERE token_id ILIKE $1 ESCAPE E'\\\\'
               OR owner ILIKE $1 ESCAPE E'\\\\'
               OR creator ILIKE $1 ESCAPE E'\\\\'
               OR collection_id ILIKE $1 ESCAPE E'\\\\'
               OR metadata_uri ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (token_id = $2) DESC, last_seen_slot DESC, token_id ASC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching NFTs")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::Nft(NftRecord {
                        token_id: row.get("token_id"),
                        collection_id: row.get("collection_id"),
                        owner: row.get("owner"),
                        creator: row.get("creator"),
                        metadata_uri: row.get("metadata_uri"),
                        frozen: row.get("frozen"),
                        last_seen_slot: u64::try_from(row.get::<i64, _>("last_seen_slot"))
                            .context("negative NFT last_seen_slot")?,
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id,
                   post_kind, created_at_unix, edited_at_unix, visibility, moderation_state, signature_ref
            FROM posts
            WHERE post_id ILIKE $1 ESCAPE E'\\\\'
               OR creator ILIKE $1 ESCAPE E'\\\\'
               OR content_uri ILIKE $1 ESCAPE E'\\\\'
               OR signature_ref ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (post_id = $2) DESC, created_at_unix DESC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching social posts")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::SocialPost(SocialPostRecord {
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
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT mint, source, destination, amount, signature, event_index, slot
            FROM token_transfers
            WHERE mint ILIKE $1 ESCAPE E'\\\\'
               OR source ILIKE $1 ESCAPE E'\\\\'
               OR destination ILIKE $1 ESCAPE E'\\\\'
               OR signature ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (signature = $2) DESC, slot DESC, event_index ASC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching token transfers")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::TokenTransfer(TokenTransferRecord {
                        mint: row.get("mint"),
                        source: row.get("source"),
                        destination: row.get("destination"),
                        amount: row.get("amount"),
                        signature: row.get("signature"),
                        event_index: row.get("event_index"),
                        slot: u64::try_from(row.get::<i64, _>("slot"))
                            .context("negative transfer slot")?,
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        let rows = sqlx::query(
            r#"
            SELECT proof_id, actor, target_creator, target_post_id, action_kind, action_weight,
                   slot, unix_timestamp, replay_guard
            FROM engagement_events
            WHERE proof_id ILIKE $1 ESCAPE E'\\\\'
               OR actor ILIKE $1 ESCAPE E'\\\\'
               OR target_creator ILIKE $1 ESCAPE E'\\\\'
               OR target_post_id ILIKE $1 ESCAPE E'\\\\'
               OR replay_guard ILIKE $1 ESCAPE E'\\\\'
            ORDER BY (proof_id = $2) DESC, slot DESC
            LIMIT $3
            "#,
        )
        .bind(&pattern)
        .bind(query)
        .bind(limit_i)
        .fetch_all(&self.pool)
        .await
        .context("searching engagement events")?;
        groups.push(
            rows.into_iter()
                .map(|row| {
                    Ok(SearchResultRecord::Engagement(EngagementRecord {
                        proof_id: row.get("proof_id"),
                        actor: row.get("actor"),
                        target_creator: row.get("target_creator"),
                        target_post_id: row.get("target_post_id"),
                        action_kind: row.get("action_kind"),
                        action_weight: u32::try_from(row.get::<i64, _>("action_weight"))
                            .context("invalid action weight")?,
                        slot: u64::try_from(row.get::<i64, _>("slot"))
                            .context("negative engagement slot")?,
                        unix_timestamp: row.get("unix_timestamp"),
                        replay_guard: row.get("replay_guard"),
                    }))
                })
                .collect::<Result<Vec<_>>>()?,
        );

        Ok(merge_search_groups(groups, limit))
    }
}

fn merge_search_groups(
    groups: Vec<Vec<SearchResultRecord>>,
    limit: usize,
) -> Vec<SearchResultRecord> {
    if limit == 0 {
        return Vec::new();
    }

    let mut queues = groups
        .into_iter()
        .map(VecDeque::from)
        .collect::<Vec<VecDeque<SearchResultRecord>>>();
    let mut out = Vec::with_capacity(limit);

    while out.len() < limit {
        let mut progressed = false;
        for queue in &mut queues {
            if let Some(item) = queue.pop_front() {
                out.push(item);
                progressed = true;
                if out.len() == limit {
                    break;
                }
            }
        }
        if !progressed {
            break;
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(slot: u64) -> SearchResultRecord {
        SearchResultRecord::Block(BlockRecord {
            slot,
            blockhash: format!("block-{slot}"),
            parent_slot: slot.saturating_sub(1),
            transaction_count: 0,
            producer: None,
            unix_timestamp: None,
        })
    }

    fn transaction(signature: &str, slot: u64) -> SearchResultRecord {
        SearchResultRecord::Transaction(TransactionRecord {
            signature: signature.to_string(),
            slot,
            success: true,
            fee: 5_000,
            primary_program: None,
            signer: None,
        })
    }

    #[test]
    fn search_group_merge_does_not_let_first_category_starve_later_categories() {
        let merged = merge_search_groups(
            vec![
                vec![transaction("tx-1", 3)],
                vec![block(3), block(2), block(1)],
            ],
            3,
        );

        assert!(matches!(
            merged.first(),
            Some(SearchResultRecord::Transaction(item)) if item.signature == "tx-1"
        ));
        assert!(matches!(
            merged.get(1),
            Some(SearchResultRecord::Block(item)) if item.slot == 3
        ));
        assert!(matches!(
            merged.get(2),
            Some(SearchResultRecord::Block(item)) if item.slot == 2
        ));
    }

    #[test]
    fn search_group_merge_respects_global_limit() {
        let merged = merge_search_groups(
            vec![
                vec![transaction("tx-1", 2), transaction("tx-2", 1)],
                vec![block(2), block(1)],
            ],
            2,
        );
        assert_eq!(merged.len(), 2);
    }
}
