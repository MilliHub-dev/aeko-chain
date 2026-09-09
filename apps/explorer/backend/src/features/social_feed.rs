use {
    crate::{
        error::{ApiError, ApiResult},
        features::clamp_limit,
        infrastructure::persistence::social_feed::SocialFeedCursor,
        models::SocialPostRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{extract::{Query, State}, routing::get, Json, Router},
    serde::{Deserialize, Serialize},
};

pub fn router() -> Router<SharedState> {
    Router::new().route("/social/feed", get(list_feed))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedParams {
    creator: Option<String>,
    cursor: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedPage {
    items: Vec<SocialPostRecord>,
    next_cursor: Option<String>,
    has_more: bool,
}

async fn list_feed(
    State(state): State<SharedState>,
    Query(params): Query<FeedParams>,
) -> ApiResult<Json<DataEnvelope<FeedPage>>> {
    let limit = clamp_limit(params.limit).min(100);
    let cursor = params.cursor.as_deref().map(parse_cursor).transpose()?;
    let mut items = state.repository
        .list_social_feed_page(params.creator.as_deref(), cursor.as_ref(), limit.saturating_add(1))
        .await?;
    let has_more = items.len() > limit;
    if has_more { items.truncate(limit); }
    let next_cursor = if has_more {
        items.last().map(|post| format_cursor(post.created_at_unix, &post.post_id))
    } else { None };
    Ok(response::data(&state.network, FeedPage { items, next_cursor, has_more }))
}

fn parse_cursor(value: &str) -> ApiResult<SocialFeedCursor> {
    let (timestamp, post_id) = value.split_once(':').ok_or_else(|| ApiError::BadRequest("invalid social feed cursor".to_string()))?;
    let created_at_unix = timestamp.parse::<i64>().map_err(|_| ApiError::BadRequest("invalid social feed cursor timestamp".to_string()))?;
    if post_id.is_empty() { return Err(ApiError::BadRequest("invalid social feed cursor post id".to_string())); }
    Ok(SocialFeedCursor { created_at_unix, post_id: post_id.to_string() })
}

fn format_cursor(timestamp: i64, post_id: &str) -> String {
    format!("{timestamp}:{post_id}")
}

#[cfg(test)]
mod tests {
    use super::{format_cursor, parse_cursor};

    #[test]
    fn cursor_round_trip_preserves_timestamp_and_tie_breaker() {
        let value = format_cursor(123, "postABC");
        let decoded = parse_cursor(&value).expect("cursor");
        assert_eq!(decoded.created_at_unix, 123);
        assert_eq!(decoded.post_id, "postABC");
    }
}
