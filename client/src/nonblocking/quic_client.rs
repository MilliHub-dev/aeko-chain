#[deprecated(
    since = "1.15.0",
    note = "Please use `aeko_quic_client::nonblocking::quic_client::QuicClientConnection` instead."
)]
pub use aeko_quic_client::nonblocking::quic_client::QuicClientConnection as QuicTpuConnection;
pub use aeko_quic_client::nonblocking::quic_client::{
    QuicClient, QuicClientCertificate, QuicLazyInitializedEndpoint,
};
