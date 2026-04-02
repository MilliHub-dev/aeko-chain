use thiserror::Error;

pub type AekoRustSdkResult<T> = Result<T, AekoRustSdkError>;

#[derive(Debug, Error)]
pub enum AekoRustSdkError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error("{label} account owner mismatch: expected {expected}, found {found}")]
    InvalidAccountOwner {
        label: &'static str,
        expected: String,
        found: String,
    },

    #[error("failed to decode {label} account data")]
    DecodeAccount { label: &'static str },

    #[error("AEKO RPC request failed: {0}")]
    Rpc(String),
}
