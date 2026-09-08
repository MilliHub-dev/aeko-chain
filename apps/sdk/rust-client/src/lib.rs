//! High-level Rust developer SDK for AEKO Chain application clients.
//!
//! This crate is intended for off-chain integrations such as:
//!
//! - async JSON-RPC access to AEKO nodes
//! - AEKO-721 instruction planning
//! - wallet-permissions instruction planning
//! - typed decoding of current AEKO NFT and wallet-permissions accounts
//!
//! # Quick Start
//!
//! ```no_run
//! use aeko_rust_sdk::AekoDeveloperClient;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = AekoDeveloperClient::new("https://api.testnet.aeko.chain".to_string());
//!     let balance = client
//!         .get_balance("11111111111111111111111111111111")
//!         .await?;
//!     println!("balance: {balance}");
//!     Ok(())
//! }
//! ```
//!
//! See the individual builder and client exports below for the current public surface.

pub mod builders;
pub mod client;
pub mod error;

pub use {
    builders::*,
    client::AekoDeveloperClient,
    error::{AekoRustSdkError, AekoRustSdkResult},
};
