use {
    super::{parse_u64_text, PostgresRepository},
    crate::models::{
        AssetSnapshot, CollectionSummaryRecord, NftRecord, TokenMintRecord, TokenSummaryRecord,
        TokenTransferRecord,
    },
    anyhow::{Context, Result},
    sqlx::Row,
};

#[derive(Clone, Debug, Default)]
pub struct TokenTransferQuery {
    pub mint: Option<String>,
    pub address: Option<String>,
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct NftQuery {
    pub collection: Option<String>,
    pub owner: Option<String>,
    pub creator: Option<String>,
    pub limit: usize,
}

impl PostgresRepository {
    pub async fn persist_asset_snapshot(&self, snapshot: AssetSnapshot) -> Result<()> {
        let snapshot_slot = i64::try_from(snapshot.slot).context("asset snapshot slot exceeds BIGINT")?;
        let mut tx = self.pool.begin().await.context("begin asset snapshot transaction")?;

        for mint in snapshot.token_mints {
            sqlx::query(
                r#"
                INSERT INTO token_mints
                    (mint, mint_authority, freeze_authority, name, symbol, decimals,
                     total_supply, supply_cap, metadata_uri, mint_policy, last_seen_slot)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (mint) DO UPDATE SET
                    mint_authority = EXCLUDED.mint_authority,
                    freeze_authority = EXCLUDED.freeze_authority,
                    name = EXCLUDED.name,
                    symbol = EXCLUDED.symbol,
                    decimals = EXCLUDED.decimals,
                    total_supply = EXCLUDED.total_supply,
                    supply_cap = EXCLUDED.supply_cap,
                    metadata_uri = EXCLUDED.metadata_uri,
                    mint_policy = EXCLUDED.mint_policy,
                    last_seen_slot = EXCLUDED.last_seen_slot,
                    indexed_at = NOW()
                "#,
            )
            .bind(&mint.mint)
            .bind(&mint.mint_authority)
            .bind(&mint.freeze_authority)
            .bind(&mint.name)
            .bind(&mint.symbol)
            .bind(i32::from(mint.decimals))
            .bind(&mint.total_supply)
            .bind(&mint.supply_cap)
            .bind(&mint.metadata_uri)
            .bind(&mint.mint_policy)
            .bind(snapshot_slot)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting token mint {}", mint.mint))?;
        }

        for account in snapshot.token_accounts {
            sqlx::query(
                r#"
                INSERT INTO token_accounts
                    (address, owner, mint, balance, frozen, last_seen_slot)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (address) DO UPDATE SET
                    owner = EXCLUDED.owner,
                    mint = EXCLUDED.mint,
                    balance = EXCLUDED.balance,
                    frozen = EXCLUDED.frozen,
                    last_seen_slot = EXCLUDED.last_seen_slot,
                    indexed_at = NOW()
                "#,
            )
            .bind(&account.address)
            .bind(&account.owner)
            .bind(&account.mint)
            .bind(&account.balance)
            .bind(account.frozen)
            .bind(snapshot_slot)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting token account {}", account.address))?;
        }

        for collection in snapshot.nft_collections {
            sqlx::query(
                r#"
                INSERT INTO nft_collections
                    (collection_id, authority, name, symbol, base_uri, total_minted, last_seen_slot)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (collection_id) DO UPDATE SET
                    authority = EXCLUDED.authority,
                    name = EXCLUDED.name,
                    symbol = EXCLUDED.symbol,
                    base_uri = EXCLUDED.base_uri,
                    total_minted = EXCLUDED.total_minted,
                    last_seen_slot = EXCLUDED.last_seen_slot,
                    indexed_at = NOW()
                "#,
            )
            .bind(&collection.collection_id)
            .bind(&collection.authority)
            .bind(&collection.name)
            .bind(&collection.symbol)
            .bind(&collection.base_uri)
            .bind(i64::try_from(collection.total_minted).context("NFT total_minted exceeds BIGINT")?)
            .bind(snapshot_slot)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting NFT collection {}", collection.collection_id))?;
        }

        for nft in snapshot.nfts {
            sqlx::query(
                r#"
                INSERT INTO nfts
                    (token_id, collection_id, owner, creator, metadata_uri, frozen, last_seen_slot)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (token_id) DO UPDATE SET
                    collection_id = EXCLUDED.collection_id,
                    owner = EXCLUDED.owner,
                    creator = EXCLUDED.creator,
                    metadata_uri = EXCLUDED.metadata_uri,
                    frozen = EXCLUDED.frozen,
                    last_seen_slot = EXCLUDED.last_seen_slot,
                    indexed_at = NOW()
                "#,
            )
            .bind(&nft.token_id)
            .bind(&nft.collection_id)
            .bind(&nft.owner)
            .bind(&nft.creator)
            .bind(&nft.metadata_uri)
            .bind(nft.frozen)
            .bind(snapshot_slot)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting NFT {}", nft.token_id))?;
        }

        // A successful getProgramAccounts response is a complete current-state
        // snapshot. Rows not observed in this snapshot are closed/removed and
        // must not continue to appear as current holdings.
        for table in ["token_mints", "token_accounts", "nft_collections", "nfts"] {
            let statement = format!("DELETE FROM {table} WHERE last_seen_slot < $1");
            sqlx::query(&statement)
                .bind(snapshot_slot)
                .execute(&mut *tx)
                .await
                .with_context(|| format!("pruning stale {table} snapshot rows"))?;
        }

        tx.commit().await.context("commit asset snapshot transaction")
    }

    pub async fn list_token_transfers(
        &self,
        query: &TokenTransferQuery,
    ) -> Result<Vec<TokenTransferRecord>> {
        let before = query.before.map(i64::try_from).transpose().context("before slot exceeds BIGINT")?;
        let after = query.after.map(i64::try_from).transpose().context("after slot exceeds BIGINT")?;
        let rows = sqlx::query(
            r#"
            SELECT mint, source, destination, amount, signature, event_index, slot
            FROM token_transfers
            WHERE ($1::TEXT IS NULL OR mint = $1)
              AND ($2::TEXT IS NULL OR source = $2 OR destination = $2)
              AND ($3::BIGINT IS NULL OR slot < $3)
              AND ($4::BIGINT IS NULL OR slot > $4)
            ORDER BY slot DESC, signature ASC, event_index ASC
            LIMIT $5
            "#,
        )
        .bind(query.mint.as_deref())
        .bind(query.address.as_deref())
        .bind(before)
        .bind(after)
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing token transfers")?;
        rows.into_iter().map(token_transfer_from_row).collect()
    }

    pub async fn get_token_mint(&self, mint: &str) -> Result<Option<TokenMintRecord>> {
        let row = sqlx::query(
            r#"
            SELECT mint, mint_authority, freeze_authority, name, symbol, decimals,
                   total_supply, supply_cap, metadata_uri, mint_policy, last_seen_slot
            FROM token_mints WHERE mint = $1
            "#,
        )
        .bind(mint)
        .fetch_optional(&self.pool)
        .await
        .context("getting token mint")?;
        row.map(token_mint_from_row).transpose()
    }

    pub async fn get_token_summary(
        &self,
        mint: &str,
        transfer_limit: usize,
    ) -> Result<Option<TokenSummaryRecord>> {
        let Some(mint_record) = self.get_token_mint(mint).await? else {
            return Ok(None);
        };
        let holder_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(DISTINCT owner) FROM token_accounts WHERE mint = $1 AND balance <> '0'",
        )
        .bind(mint)
        .fetch_one(&self.pool)
        .await
        .context("counting token holders")?;
        let recent_transfers = self
            .list_token_transfers(&TokenTransferQuery {
                mint: Some(mint.to_string()),
                limit: transfer_limit,
                ..TokenTransferQuery::default()
            })
            .await?;
        Ok(Some(TokenSummaryRecord {
            mint: mint_record.mint,
            name: mint_record.name,
            symbol: mint_record.symbol,
            decimals: mint_record.decimals,
            holder_count: usize::try_from(holder_count).context("negative token holder count")?,
            total_supply: mint_record.total_supply,
            recent_transfers,
        }))
    }

    pub async fn list_nfts(&self, query: &NftQuery) -> Result<Vec<NftRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT token_id, collection_id, owner, creator, metadata_uri, frozen, last_seen_slot
            FROM nfts
            WHERE ($1::TEXT IS NULL OR collection_id = $1)
              AND ($2::TEXT IS NULL OR owner = $2)
              AND ($3::TEXT IS NULL OR creator = $3)
            ORDER BY token_id ASC
            LIMIT $4
            "#,
        )
        .bind(query.collection.as_deref())
        .bind(query.owner.as_deref())
        .bind(query.creator.as_deref())
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing NFTs")?;
        rows.into_iter().map(nft_from_row).collect()
    }

    pub async fn get_nft(&self, token_id: &str) -> Result<Option<NftRecord>> {
        let row = sqlx::query(
            "SELECT token_id, collection_id, owner, creator, metadata_uri, frozen, last_seen_slot FROM nfts WHERE token_id = $1",
        )
        .bind(token_id)
        .fetch_optional(&self.pool)
        .await
        .context("getting NFT")?;
        row.map(nft_from_row).transpose()
    }

    pub async fn get_collection_summary(
        &self,
        collection_id: &str,
        item_limit: usize,
    ) -> Result<Option<CollectionSummaryRecord>> {
        let collection = sqlx::query(
            "SELECT name, symbol, base_uri, total_minted FROM nft_collections WHERE collection_id = $1",
        )
        .bind(collection_id)
        .fetch_optional(&self.pool)
        .await
        .context("getting NFT collection")?;
        let Some(collection) = collection else {
            return Ok(None);
        };
        let counts = sqlx::query(
            r#"
            SELECT COUNT(*) AS item_count,
                   COUNT(DISTINCT owner) AS owner_count,
                   COUNT(DISTINCT creator) AS creator_count
            FROM nfts WHERE collection_id = $1
            "#,
        )
        .bind(collection_id)
        .fetch_one(&self.pool)
        .await
        .context("aggregating NFT collection")?;
        let items = self
            .list_nfts(&NftQuery {
                collection: Some(collection_id.to_string()),
                limit: item_limit,
                ..NftQuery::default()
            })
            .await?;
        Ok(Some(CollectionSummaryRecord {
            collection_id: collection_id.to_string(),
            name: collection.get("name"),
            symbol: collection.get("symbol"),
            base_uri: collection.get("base_uri"),
            total_minted: u64::try_from(collection.get::<i64, _>("total_minted"))
                .context("negative NFT total_minted")?,
            item_count: usize::try_from(counts.get::<i64, _>("item_count"))
                .context("negative NFT item_count")?,
            owner_count: usize::try_from(counts.get::<i64, _>("owner_count"))
                .context("negative NFT owner_count")?,
            creator_count: usize::try_from(counts.get::<i64, _>("creator_count"))
                .context("negative NFT creator_count")?,
            items,
        }))
    }
}

fn token_transfer_from_row(row: sqlx::postgres::PgRow) -> Result<TokenTransferRecord> {
    Ok(TokenTransferRecord {
        mint: row.get("mint"),
        source: row.get("source"),
        destination: row.get("destination"),
        amount: row.get("amount"),
        signature: row.get("signature"),
        event_index: row.get("event_index"),
        slot: u64::try_from(row.get::<i64, _>("slot")).context("negative token transfer slot")?,
    })
}

fn token_mint_from_row(row: sqlx::postgres::PgRow) -> Result<TokenMintRecord> {
    let decimals = u8::try_from(row.get::<i32, _>("decimals")).context("invalid token decimals")?;
    let total_supply: String = row.get("total_supply");
    // Validate persisted decimal strings before returning them to clients.
    total_supply
        .parse::<u128>()
        .with_context(|| format!("invalid token total_supply {total_supply:?}"))?;
    let supply_cap: Option<String> = row.get("supply_cap");
    if let Some(value) = supply_cap.as_deref() {
        value
            .parse::<u128>()
            .with_context(|| format!("invalid token supply_cap {value:?}"))?;
    }
    Ok(TokenMintRecord {
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
    })
}

fn nft_from_row(row: sqlx::postgres::PgRow) -> Result<NftRecord> {
    Ok(NftRecord {
        token_id: row.get("token_id"),
        collection_id: row.get("collection_id"),
        owner: row.get("owner"),
        creator: row.get("creator"),
        metadata_uri: row.get("metadata_uri"),
        frozen: row.get("frozen"),
        last_seen_slot: u64::try_from(row.get::<i64, _>("last_seen_slot"))
            .context("negative NFT last_seen_slot")?,
    })
}
