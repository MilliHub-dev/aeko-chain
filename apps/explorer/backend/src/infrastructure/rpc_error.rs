use serde_json::Value;

/// Structured JSON-RPC server failure preserved across the Explorer RPC boundary.
///
/// Indexing policy must make decisions from the RPC method/code, never from the
/// human-readable error message. The message/data remain available for logs and
/// diagnostics without being exposed by public API error responses.
#[derive(Clone, Debug, thiserror::Error)]
#[error("RPC {method} failed ({code}): {message}")]
pub struct RpcRequestError {
    pub method: String,
    pub code: i64,
    pub message: String,
    pub data: Option<Value>,
}

impl RpcRequestError {
    pub fn new(
        method: impl Into<String>,
        code: i64,
        message: impl Into<String>,
        data: Option<Value>,
    ) -> Self {
        Self {
            method: method.into(),
            code,
            message: message.into(),
            data,
        }
    }
}
