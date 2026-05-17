//! Response envelope shared by every handler:
//!
//! ```json
//! {
//!   "data": <T>,
//!   "meta": { "cursor": null, "nextCursor": null, "network": "...", "source": "indexer" }
//! }
//! ```
//!
//! The shape is identical to what the pre-axum hyper layer returned, so the
//! web UI keeps working without changes. `cursor`/`nextCursor` are wired up
//! as `null` for now — they exist in the schema so paginating endpoints can
//! fill them in once the durable store lands without breaking the contract.

use {
    axum::Json,
    serde::Serialize,
    serde_json::{json, Value},
};

#[derive(Serialize)]
pub struct DataEnvelope<T: Serialize> {
    pub data: T,
    pub meta: Value,
}

pub fn data<T: Serialize>(network: &str, payload: T) -> Json<DataEnvelope<T>> {
    Json(DataEnvelope {
        data: payload,
        meta: meta(network, None),
    })
}

pub fn data_with_cursor<T: Serialize>(
    network: &str,
    payload: T,
    next_cursor: Option<String>,
) -> Json<DataEnvelope<T>> {
    Json(DataEnvelope {
        data: payload,
        meta: meta(network, next_cursor),
    })
}

fn meta(network: &str, next_cursor: Option<String>) -> Value {
    json!({
        "cursor": Value::Null,
        "nextCursor": next_cursor.map(Value::String).unwrap_or(Value::Null),
        "network": network,
        "source": "indexer",
    })
}
