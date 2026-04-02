# Rust Publish Dry-Run Checklist

Use this checklist before publishing [`aeko-rust-sdk`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml) to crates.io.

## Metadata Check

Confirm the following in [`sdk/rust-client/Cargo.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml):

- package name is correct
- version is correct
- description is correct
- `readme = "README.md"` is present
- repository, homepage, and documentation URLs are correct

## Local Verification

Run:

```bash
cargo check -p aeko-rust-sdk
cargo check -p aeko-rust-sdk --examples
```

## Dry Run

From the repo root:

```bash
cargo publish -p aeko-rust-sdk --dry-run
```

Or from the crate directory:

```bash
cd sdk/rust-client
cargo publish --dry-run
```

## What To Inspect

During the dry run, confirm that:

- Cargo packages the expected crate files
- no path/dependency errors appear
- the README renders cleanly enough for crates.io
- examples and exported crate surface are still aligned

Current repo status:

- the dry run has already been attempted for `aeko-rust-sdk`
- the original crates.io blocker was unpublished AEKO workspace dependencies such as `aeko-rpc-client`
- that blocker has now been removed by refactoring `aeko-rust-sdk` to use a standalone RPC client and local AEKO builders/decoders
- `cargo publish -p aeko-rust-sdk --dry-run --allow-dirty` now passes locally
- before live publish, either commit the Rust SDK changes or keep using `--allow-dirty` only for verification, not the real release

## Live Publish

After the dry run passes:

```bash
cargo login
cargo publish -p aeko-rust-sdk
```

## After Publish

Record the following in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md):

- crate version
- crates.io URL
- docs.rs URL
- publish date
- release owner
