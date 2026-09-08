use {
    super::PostgresRepository,
    crate::models::{BlockRecord, CoreSlotRecord, TransactionRecord},
    anyhow::{bail, Context, Result},
    sqlx::Row,
    std::collections::HashSet,
};

#[derive(Clone, Debug, Default)]
pub struct BlockQuery {
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub limit: usize,
}

#[derive(Clone, Debug, Default)]
pub struct TransactionQuery {
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub address: Option<String>,
    pub primary_program: Option<String>,
    pub success: Option<bool>,
    pub limit: usize,
}

impl PostgresRepository {
    pub async fn persist_core_slot(&self, record: CoreSlotRecord) -> Result<()> {
        let CoreSlotRecord {
            slot,
            block,
            transactions,
            transaction_accounts,
            token_transfers,
        } = record;

        if block.as_ref().is_some_and(|value| value.slot != slot) {
            bail!("core slot record contains a block from a different slot");
        }
        if transactions.iter().any(|value| value.slot != slot) {
            bail!("core slot record contains a transaction from a different slot");
        }
        if token_transfers.iter().any(|value| value.slot != slot) {
            bail!("core slot record contains a token transfer from a different slot");
        }
        let transaction_signatures = transactions
            .iter()
            .map(|value| value.signature.clone())
            .collect::<HashSet<_>>();
        if transaction_signatures.len() != transactions.len() {
            bail!("core slot record contains duplicate transaction signatures");
        }
        if transaction_accounts
            .iter()
            .any(|value| !transaction_signatures.contains(&value.signature))
        {
            bail!("core slot record contains an account for a transaction outside the slot");
        }
        if token_transfers
            .iter()
            .any(|value| !transaction_signatures.contains(&value.signature))
        {
            bail!("core slot record contains a token transfer for a transaction outside the slot");
        }

        let slot_i64 = i64::try_from(slot).context("core slot exceeds PostgreSQL BIGINT")?;
        let mut tx = self.pool.begin().await.context("begin core-slot transaction")?;

        // A finalized slot is an authoritative replacement, not an upsert onto
        // whatever was previously observed at confirmed commitment. Clearing
        // the old slot projection prevents fork-only blocks, transactions,
        // participant rows, or transfer events from surviving the finalized
        // replay. The enclosing transaction makes the replacement atomic.
        sqlx::query("DELETE FROM token_transfers WHERE slot = $1")
            .bind(slot_i64)
            .execute(&mut *tx)
            .await
            .context("clearing prior token transfers for finalized slot")?;
        sqlx::query("DELETE FROM transactions WHERE slot = $1")
            .bind(slot_i64)
            .execute(&mut *tx)
            .await
            .context("clearing prior transactions for finalized slot")?;
        sqlx::query("DELETE FROM blocks WHERE slot = $1")
            .bind(slot_i64)
            .execute(&mut *tx)
            .await
            .context("clearing prior block for finalized slot")?;

        if let Some(block) = block {
            sqlx::query(
                r#"
                INSERT INTO blocks
                    (slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp)
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
            .bind(i64::try_from(block.slot).context("block slot exceeds PostgreSQL BIGINT")?)
            .bind(&block.blockhash)
            .bind(i64::try_from(block.parent_slot).context("parent slot exceeds PostgreSQL BIGINT")?)
            .bind(i64::try_from(block.transaction_count).context("transaction count exceeds PostgreSQL BIGINT")?)
            .bind(&block.producer)
            .bind(block.unix_timestamp)
            .execute(&mut *tx)
            .await
            .context("persisting block")?;
        }

        for transaction in transactions {
            sqlx::query(
                r#"
                INSERT INTO transactions
                    (signature, slot, success, fee, primary_program, signer)
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
            .bind(&transaction.signature)
            .bind(i64::try_from(transaction.slot).context("transaction slot exceeds PostgreSQL BIGINT")?)
            .bind(transaction.success)
            .bind(i64::try_from(transaction.fee).context("transaction fee exceeds PostgreSQL BIGINT")?)
            .bind(&transaction.primary_program)
            .bind(&transaction.signer)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("persisting transaction {}", transaction.signature))?;

            // A signature may have been observed on a different confirmed slot,
            // or parser rules may have changed. Rebuild its child projections
            // from the finalized transaction instead of retaining stale rows.
            sqlx::query("DELETE FROM transaction_accounts WHERE signature = $1")
                .bind(&transaction.signature)
                .execute(&mut *tx)
                .await
                .with_context(|| {
                    format!("clearing transaction accounts for {}", transaction.signature)
                })?;
            sqlx::query("DELETE FROM token_transfers WHERE signature = $1")
                .bind(&transaction.signature)
                .execute(&mut *tx)
                .await
                .with_context(|| {
                    format!("clearing token transfers for {}", transaction.signature)
                })?;
        }

        for account in transaction_accounts {
            sqlx::query(
                r#"
                INSERT INTO transaction_accounts (signature, account_index, address)
                VALUES ($1, $2, $3)
                ON CONFLICT (signature, account_index) DO UPDATE SET
                    address = EXCLUDED.address
                "#,
            )
            .bind(&account.signature)
            .bind(i32::try_from(account.account_index).context("transaction account index exceeds INTEGER")?)
            .bind(&account.address)
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "persisting transaction account {}:{}",
                    account.signature, account.account_index
                )
            })?;
        }

        for transfer in token_transfers {
            sqlx::query(
                r#"
                INSERT INTO token_transfers
                    (mint, source, destination, amount, signature, event_index, slot)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (signature, event_index) DO UPDATE SET
                    mint = EXCLUDED.mint,
                    source = EXCLUDED.source,
                    destination = EXCLUDED.destination,
                    amount = EXCLUDED.amount,
                    slot = EXCLUDED.slot,
                    indexed_at = NOW()
                "#,
            )
            .bind(&transfer.mint)
            .bind(&transfer.source)
            .bind(&transfer.destination)
            .bind(&transfer.amount)
            .bind(&transfer.signature)
            .bind(&transfer.event_index)
            .bind(i64::try_from(transfer.slot).context("token transfer slot exceeds PostgreSQL BIGINT")?)
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "persisting token transfer {}:{}",
                    transfer.signature, transfer.event_index
                )
            })?;
        }

        let next_slot = slot.checked_add(1).context("core slot cursor overflow")?;
        sqlx::query(
            r#"
            INSERT INTO indexer_cursors (stream, next_slot)
            VALUES ('core', $1)
            ON CONFLICT (stream) DO UPDATE SET
                next_slot = EXCLUDED.next_slot,
                updated_at = NOW()
            "#,
        )
        .bind(i64::try_from(next_slot).context("core cursor exceeds PostgreSQL BIGINT")?)
        .execute(&mut *tx)
        .await
        .context("persisting core indexer cursor")?;

        tx.commit().await.context("commit core-slot transaction")
    }

    pub async fn list_blocks(&self, query: &BlockQuery) -> Result<Vec<BlockRecord>> {
        let before = query.before.map(i64::try_from).transpose().context("before slot exceeds BIGINT")?;
        let after = query.after.map(i64::try_from).transpose().context("after slot exceeds BIGINT")?;
        let rows = sqlx::query(
            r#"
            SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp
            FROM blocks
            WHERE ($1::BIGINT IS NULL OR slot < $1)
              AND ($2::BIGINT IS NULL OR slot > $2)
            ORDER BY slot DESC
            LIMIT $3
            "#,
        )
        .bind(before)
        .bind(after)
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing blocks")?;
        rows.into_iter().map(block_from_row).collect()
    }

    pub async fn get_block(&self, slot: u64) -> Result<Option<BlockRecord>> {
        let slot = i64::try_from(slot).context("slot exceeds PostgreSQL BIGINT")?;
        let row = sqlx::query(
            "SELECT slot, blockhash, parent_slot, transaction_count, producer, unix_timestamp FROM blocks WHERE slot = $1",
        )
        .bind(slot)
        .fetch_optional(&self.pool)
        .await
        .context("getting block")?;
        row.map(block_from_row).transpose()
    }

    pub async fn list_transactions(&self, query: &TransactionQuery) -> Result<Vec<TransactionRecord>> {
        let before = query.before.map(i64::try_from).transpose().context("before slot exceeds BIGINT")?;
        let after = query.after.map(i64::try_from).transpose().context("after slot exceeds BIGINT")?;
        let rows = sqlx::query(
            r#"
            SELECT t.signature, t.slot, t.success, t.fee, t.primary_program, t.signer
            FROM transactions t
            WHERE ($1::BIGINT IS NULL OR t.slot < $1)
              AND ($2::BIGINT IS NULL OR t.slot > $2)
              AND (
                    $3::TEXT IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM transaction_accounts ta
                        WHERE ta.signature = t.signature
                          AND ta.address = $3
                    )
                  )
              AND ($4::TEXT IS NULL OR t.primary_program = $4)
              AND ($5::BOOLEAN IS NULL OR t.success = $5)
            ORDER BY t.slot DESC, t.signature ASC
            LIMIT $6
            "#,
        )
        .bind(before)
        .bind(after)
        .bind(query.address.as_deref())
        .bind(query.primary_program.as_deref())
        .bind(query.success)
        .bind(query.limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("listing transactions")?;
        rows.into_iter().map(transaction_from_row).collect()
    }

    pub async fn get_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>> {
        let row = sqlx::query(
            "SELECT signature, slot, success, fee, primary_program, signer FROM transactions WHERE signature = $1",
        )
        .bind(signature)
        .fetch_optional(&self.pool)
        .await
        .context("getting transaction")?;
        row.map(transaction_from_row).transpose()
    }
}

fn block_from_row(row: sqlx::postgres::PgRow) -> Result<BlockRecord> {
    Ok(BlockRecord {
        slot: u64::try_from(row.get::<i64, _>("slot")).context("negative block slot in PostgreSQL")?,
        blockhash: row.get("blockhash"),
        parent_slot: u64::try_from(row.get::<i64, _>("parent_slot"))
            .context("negative parent slot in PostgreSQL")?,
        transaction_count: u64::try_from(row.get::<i64, _>("transaction_count"))
            .context("negative transaction count in PostgreSQL")?,
        producer: row.get("producer"),
        unix_timestamp: row.get("unix_timestamp"),
    })
}

fn transaction_from_row(row: sqlx::postgres::PgRow) -> Result<TransactionRecord> {
    Ok(TransactionRecord {
        signature: row.get("signature"),
        slot: u64::try_from(row.get::<i64, _>("slot")).context("negative transaction slot in PostgreSQL")?,
        success: row.get("success"),
        fee: u64::try_from(row.get::<i64, _>("fee")).context("negative transaction fee in PostgreSQL")?,
        primary_program: row.get("primary_program"),
        signer: row.get("signer"),
    })
}
