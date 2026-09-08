use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::{ApiError, ApiResult},
        models::SocialPostRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Path, Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/posts", get(list_posts))
        .route("/posts/:post_id", get(get_post))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    creator: Option<String>,
    before: Option<i64>,
    after: Option<i64>,
    #[serde(rename = "postKind")]
    post_kind: Option<String>,
    visibility: Option<String>,
    limit: Option<usize>,
}

async fn list_posts(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<SocialPostRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_posts(params.creator.as_deref(), over_fetch(limit))?;

    if let Some(before) = params.before {
        items.retain(|item| item.created_at_unix < before);
    }
    if let Some(after) = params.after {
        items.retain(|item| item.created_at_unix > after);
    }
    if let Some(kind) = params.post_kind.as_deref() {
        items.retain(|item| item.post_kind == kind);
    }
    if let Some(visibility) = params.visibility.as_deref() {
        items.retain(|item| item.visibility == visibility);
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}

async fn get_post(
    State(state): State<SharedState>,
    Path(post_id): Path<String>,
) -> ApiResult<Json<DataEnvelope<SocialPostRecord>>> {
    match state.api.get_post(&post_id)? {
        Some(post) => Ok(response::data(&state.network, post)),
        None => Err(ApiError::NotFound("post")),
    }
}
