# Phase 4 SDK Release Steps

This document turns the Phase 4 SDK publication checklist into an operator-facing release flow.

Use it together with:

- [`docs/developer-sdk/phase4-sdk-publication.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-publication.md)
- [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Release Order

1. `@aeko-chain/web3.js`
2. `@aeko-chain/sdk`
3. `aeko-rust-sdk`
4. `aeko-sdk` for Python

## Pre-Release Checks

Before publishing any SDK:

- confirm package name and version
- confirm README install instructions are current
- confirm at least one example runs or compiles cleanly
- confirm AEKO testnet endpoint references are current
- record the target git commit or release tag

## JavaScript / TypeScript

Package:

- [`sdk/js/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/js/package.json)

Verification:

```bash
npm --prefix sdk/js install
npm --prefix sdk/js run typecheck
npm --prefix sdk/js run build
```

Publish sequence:

1. set the release version in [`sdk/js/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/js/package.json)
2. build the package
3. inspect the final `dist` output
4. publish to npm
5. record the published version and registry URL in the Phase 4 closeout record

## Node.js

Package:

- [`sdk/node/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/node/package.json)

Verification:

```bash
npm --prefix sdk/node install
npm --prefix sdk/node run typecheck
npm --prefix sdk/node run build
```

Publish sequence:

1. confirm the dependency on `@aeko-chain/web3.js` points to the intended published version
2. set the release version in [`sdk/node/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/node/package.json)
3. run typecheck and build
4. publish to npm
5. record the published version and registry URL

## Rust

Crate:

- [`sdk/rust-client/Cargo.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml)
- [`docs/developer-sdk/rust-publish-dry-run.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/rust-publish-dry-run.md)

Verification:

```bash
cargo check -p aeko-rust-sdk
cargo check -p aeko-rust-sdk --examples
cargo publish -p aeko-rust-sdk --dry-run --allow-dirty
```

Current status:

- the unpublished AEKO dependency-chain blocker has been removed
- the crate now passes `cargo check`, example compilation, and `cargo publish --dry-run --allow-dirty`
- the crate has now been published to crates.io as `aeko-rust-sdk@2.0.0`
- the next prepared patch release is `2.0.2` for docs.rs metadata and crate landing docs

Publish sequence:

1. confirm crate metadata is correct in [`sdk/rust-client/Cargo.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml)
2. confirm README example paths still match the crate surface
3. rerun the dry-run checklist in [`docs/developer-sdk/rust-publish-dry-run.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/rust-publish-dry-run.md) for future releases
4. publish to crates.io
5. confirm docs.rs build status
6. record the version, crates.io URL, and docs.rs URL

## Python

Package:

- [`sdk/python/pyproject.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/python/pyproject.toml)

Verification:

```bash
python3 -m compileall sdk/python/src sdk/python/examples
```

Optional local install check:

```bash
pip install -e sdk/python
```

Publish sequence:

1. set the release version in [`sdk/python/pyproject.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/python/pyproject.toml)
2. confirm README install guidance is current
3. build the distribution artifacts
4. publish to PyPI
5. record the published version and registry URL

## Final Phase 4 Closeout

Phase 4 SDK publication is complete when:

- all four SDKs that are intended for public release are published
- publication URLs and versions are recorded
- wallet docs still match the shipped SDK surfaces
- the Phase 4 task tracker is updated to reflect live publication
