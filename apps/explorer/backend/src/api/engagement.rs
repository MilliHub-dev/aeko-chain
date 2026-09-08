use {
    crate::{
        api::query::{clamp_limit, over_fetch},
        error::ApiResult,
        models::EngagementRecord,
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{
        extract::{Query, State},
        routing::get,
        Json, Router,
    },
    serde::Deserialize,
};

pub fn router() -> Router<SharedState> {
    Router::new().route("/engagement", get(list_engagement))
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    creator: Option<String>,
    actor: Option<String>,
    #[serde(rename = "postId")]
    post_id: Option<String>,
    #[serde(rename = "actionKind")]
    action_kind: Option<String>,
    before: Option<u64>,
    after: Option<u64>,
    limit: Option<usize>,
}

async fn list_engagement(
    State(state): State<SharedState>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<DataEnvelope<Vec<EngagementRecord>>>> {
    let limit = clamp_limit(params.limit);
    let mut items = state
        .api
        .list_engagement_events(params.creator.as_deref(), over_fetch(limit))?;

    if let Some(actor) = params.actor.as_deref() {
        items.retain(|item| item.actor == actor);
    }
    if let Some(post_id) = params.post_id.as_deref() {
        items.retain(|item| item.target_post_id.as_deref() == Some(post_id));
    }
    if let Some(action_kind) = params.action_kind.as_deref() {
        items.retain(|item| item.action_kind == action_kind);
    }
    if let Some(before) = params.before {
        items.retain(|item| item.slot < before);
    }
    if let Some(after) = params.after {
        items.retain(|item| item.slot > after);
    }

    items.truncate(limit);
    Ok(response::data(&state.network, items))
}
