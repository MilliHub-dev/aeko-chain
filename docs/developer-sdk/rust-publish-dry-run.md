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
