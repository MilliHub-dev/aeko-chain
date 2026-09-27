# Rust SDK

AEKO Chain now has two Rust-facing layers:

- `aeko-program` for on-chain smart contracts
- `aeko-rust-sdk` for off-chain app and service clients

The repo used to document only the on-chain side. Phase 4 adds a higher-level Rust client surface for async RPC, transaction submission, and typed AEKO account builders and decoders.

## Current Repo Status

- low-level Rust primitives still live in [`sdk`](../../sdk/), [`rpc-client`](../../rpc-client/), and [`client`](../../client/)
- the new high-level Rust developer crate now lives in [`sdk/rust-client`](../../sdk/rust-client/)
- it currently covers:
  - `AekoDeveloperClient` async JSON-RPC wrapper built on `reqwest`
  - latest blockhash, balance, account, program-account, signature-status, and base64 transaction submission helpers
  - AEKO-721 instruction builders
  - wallet-permissions instruction builders
  - typed decoders for AEKO-721 and wallet-permissions accounts
- runnable examples now live in [`sdk/rust-client/examples`](../../sdk/rust-client/examples/)
- a dedicated publish dry-run checklist now lives in [`rust-publish-dry-run.md`](./rust-publish-dry-run.md)
- the crate is now published on crates.io as `aeko-rust-sdk@2.0.0`
- the next patch release prepared in repo is `2.0.2`, intended to refresh docs.rs with crate-level docs and docs.rs-specific metadata

## Off-Chain Client Example

```rust
use aeko_rust_sdk::AekoDeveloperClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = AekoDeveloperClient::new("https://rpc.aeko.online".to_string());
    let balance = client
        .get_balance("11111111111111111111111111111111")
        .await?;
    println!("balance: {balance}");
    Ok(())
}
```

See also:

- [`basic_client.rs`](../../sdk/rust-client/examples/basic_client.rs)
- [`nft_permissions_flow.rs`](../../sdk/rust-client/examples/nft_permissions_flow.rs)

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

1. Build the SBF artifact with the repository wrapper:

```bash
./cargo-build-sbf --manifest-path path/to/your-program/Cargo.toml
```

2. Deploy the resulting SBF artifact:

```bash
aeko program deploy path/to/your-program/target/deploy/my_program.so
```

For the repository-owned end-to-end example, use
[`contracts/hello-aeko-program`](../../contracts/hello-aeko-program/) and the
[`deploy-and-invoke-testnet.md`](./deploy-and-invoke-testnet.md) walkthrough.
CI builds, deploys and invokes that starter against `aeko-test-validator`.

## External Developer Starter

For a cleaner external onboarding path, see:

- [`write-your-first-program.md`](./write-your-first-program.md)
- [`deploy-and-invoke-testnet.md`](./deploy-and-invoke-testnet.md)
- [`contracts/hello-aeko-program`](../../contracts/hello-aeko-program/)
