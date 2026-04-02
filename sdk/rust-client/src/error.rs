use {
    aeko_rpc_client_api::client_error::Error as RpcClientError,
    aeko_sdk::pubkey::Pubkey,
    thiserror::Error,
};

pub type AekoRustSdkResult<T> = Result<T, AekoRustSdkError>;

#[derive(Debug, Error)]
pub enum AekoRustSdkError {
    #[error(transparent)]
    Rpc(#[from] RpcClientError),

    #[error("{label} account owner mismatch: expected {expected}, found {found}")]
    InvalidAccountOwner {
        label: &'static str,
        expected: Pubkey,
        found: Pubkey,
    },

    #[error("failed to decode {label} account data")]
    DecodeAccount { label: &'static str },
}
