# Rust SDK

AEKO Chain now has two Rust-facing layers:

- `aeko-program` for on-chain smart contracts
- `aeko-rust-sdk` for off-chain app and service clients

The repo used to document only the on-chain side. Phase 4 adds a higher-level Rust client surface for async RPC, transaction submission, and typed AEKO account builders and decoders.

## Current Repo Status

- low-level Rust primitives still live in [`sdk`](/Users/ok/Documents/projects/aeko-chain/sdk), [`rpc-client`](/Users/ok/Documents/projects/aeko-chain/rpc-client), and [`client`](/Users/ok/Documents/projects/aeko-chain/client)
- the new high-level Rust developer crate now lives in [`sdk/rust-client`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client)
- it currently covers:
  - `AekoDeveloperClient` async JSON-RPC wrapper built on `reqwest`
  - latest blockhash, balance, account, program-account, signature-status, and base64 transaction submission helpers
  - AEKO-721 instruction builders
  - wallet-permissions instruction builders
  - typed decoders for AEKO-721 and wallet-permissions accounts
- runnable examples now live in [`sdk/rust-client/examples`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples)
- a dedicated publish dry-run checklist now lives in [`docs/developer-sdk/rust-publish-dry-run.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/rust-publish-dry-run.md)
- the crate now passes `cargo publish --dry-run --allow-dirty` as a standalone public crate candidate

## Off-Chain Client Example

```rust
use aeko_rust_sdk::AekoDeveloperClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = AekoDeveloperClient::new("https://api.testnet.aeko.chain".to_string());
    let balance = client
        .get_balance("11111111111111111111111111111111")
        .await?;
    println!("balance: {balance}");
    Ok(())
}
```

See also:

- [`sdk/rust-client/examples/basic_client.rs`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples/basic_client.rs)
- [`sdk/rust-client/examples/nft_permissions_flow.rs`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples/nft_permissions_flow.rs)

## On-Chain Program Example

```rust
use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Hello AEKO Chain!");
    Ok(())
}
```

## Building and Deploying Programs

1. Build:

```bash
cargo build-bpf
```

2. Deploy:

```bash
aeko program deploy target/deploy/my_program.so
```
