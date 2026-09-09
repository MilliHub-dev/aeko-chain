use {
    super::PostgresRepository,
    crate::models::SocialPostRecord,
    anyhow::{Context, Result},
    sqlx::Row,
};

#[derive(Clone, Debug)]
pub struct SocialFeedCursor {
    pub created_at_unix: i64,
    pub post_id: String,
}

impl PostgresRepository {
    pub async fn list_social_feed_page(
        &self,
        creator: Option<&str>,
        cursor: Option<&SocialFeedCursor>,
        limit: usize,
    ) -> Result<Vec<SocialPostRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT post_id, creator, content_hash, metadata_hash, content_uri, parent_post_id,
                   post_kind, created_at_unix, edited_at_unix, visibility, moderation_state, signature_ref
            FROM posts
            WHERE ($1::TEXT IS NULL OR creator = $1)
              AND (
                    $2::BIGINT IS NULL
                    OR created_at_unix < $2
                    OR (created_at_unix = $2 AND post_id > $3)
                  )
            ORDER BY created_at_unix DESC, post_id ASC
            LIMIT $4
            "#,
        )
        .bind(creator)
        .bind(cursor.map(|value| value.created_at_unix))
        .bind(cursor.map(|value| value.post_id.as_str()))
        .bind(i64::try_from(limit).context("social feed limit exceeds BIGINT")?)
        .fetch_all(&self.pool)
        .await
        .context("listing cursor-paginated Social feed")?;

        rows.into_iter().map(post_from_row).collect()
    }
}

fn post_from_row(row: sqlx::postgres::PgRow) -> Result<SocialPostRecord> {
    Ok(SocialPostRecord {
        post_id: row.try_get("post_id")?,
        creator: row.try_get("creator")?,
        content_hash: row.try_get("content_hash")?,
        metadata_hash: row.try_get("metadata_hash")?,
        content_uri: row.try_get("content_uri")?,
        parent_post_id: row.try_get("parent_post_id")?,
        post_kind: row.try_get("post_kind")?,
        created_at_unix: row.try_get("created_at_unix")?,
        edited_at_unix: row.try_get("edited_at_unix")?,
        visibility: row.try_get("visibility")?,
        moderation_state: row.try_get("moderation_state")?,
        signature_ref: row.try_get("signature_ref")?,
    })
}
