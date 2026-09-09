use {
    super::PostgresRepository,
    anyhow::{Context, Result},
    sqlx::Row,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ExplorerOverviewCounts {
    pub indexed_blocks: u64,
    pub indexed_transactions: u64,
    pub indexed_tokens: u64,
    pub indexed_nfts: u64,
    pub indexed_posts: u64,
    pub indexed_stakes: u64,
}

impl PostgresRepository {
    pub async fn explorer_overview_counts(&self) -> Result<ExplorerOverviewCounts> {
        let row = sqlx::query(
            r#"
            SELECT
                (SELECT COUNT(*) FROM blocks) AS indexed_blocks,
                (SELECT COUNT(*) FROM transactions) AS indexed_transactions,
                (SELECT COUNT(*) FROM token_mints) AS indexed_tokens,
                (SELECT COUNT(*) FROM nfts) AS indexed_nfts,
                (SELECT COUNT(*) FROM posts) AS indexed_posts,
                (SELECT COUNT(*) FROM social_stakes) AS indexed_stakes
            "#,
        )
        .fetch_one(&self.pool)
        .await
        .context("reading Explorer overview counts")?;

        Ok(ExplorerOverviewCounts {
            indexed_blocks: non_negative_count(row.get("indexed_blocks"), "blocks")?,
            indexed_transactions: non_negative_count(
                row.get("indexed_transactions"),
                "transactions",
            )?,
            indexed_tokens: non_negative_count(row.get("indexed_tokens"), "token_mints")?,
            indexed_nfts: non_negative_count(row.get("indexed_nfts"), "nfts")?,
            indexed_posts: non_negative_count(row.get("indexed_posts"), "posts")?,
            indexed_stakes: non_negative_count(row.get("indexed_stakes"), "social_stakes")?,
        })
    }
}

fn non_negative_count(value: i64, table: &'static str) -> Result<u64> {
    u64::try_from(value).with_context(|| format!("negative row count returned for {table}"))
}
