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
    data_from_source(network, payload, "indexer")
}

pub fn data_from_source<T: Serialize>(
    network: &str,
    payload: T,
    source: &str,
) -> Json<DataEnvelope<T>> {
    Json(DataEnvelope {
        data: payload,
        meta: meta(network, None, source),
    })
}

pub fn data_with_cursor<T: Serialize>(
    network: &str,
    payload: T,
    next_cursor: Option<String>,
) -> Json<DataEnvelope<T>> {
    Json(DataEnvelope {
        data: payload,
        meta: meta(network, next_cursor, "indexer"),
    })
}

fn meta(network: &str, next_cursor: Option<String>, source: &str) -> Value {
    json!({
        "cursor": Value::Null,
        "nextCursor": next_cursor.map(Value::String).unwrap_or(Value::Null),
        "network": network,
        "source": source,
    })
}
