# AEKO Rust SDK

`aeko-rust-sdk` is the high-level Rust developer SDK for AEKO Chain application clients.

Published crate:

- `aeko-rust-sdk = "2.0.0"`

It complements:

- `aeko-program` for on-chain program development
- `aeko-sdk` for low-level shared Rust primitives

This crate focuses on off-chain app flows:

- async RPC access
- transaction submission
- AEKO-721 instruction builders
- wallet-permissions instruction builders
- typed account decoders for current AEKO wallet and NFT accounts

## Current Surface

- `AekoDeveloperClient`
- AEKO-721 instruction builders
- wallet-permissions instruction builders
- signed and unsigned transaction helpers
- typed decoders for:
  - `Aeko721Collection`
  - `Aeko721Token`
  - `WalletPermissionAccount`
  - `WalletPermissionAuditLogAccount`

## Examples

- [`examples/basic_client.rs`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples/basic_client.rs)
- [`examples/nft_permissions_flow.rs`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples/nft_permissions_flow.rs)

## Local Verification

```bash
cargo check -p aeko-rust-sdk
cargo check -p aeko-rust-sdk --examples
```
