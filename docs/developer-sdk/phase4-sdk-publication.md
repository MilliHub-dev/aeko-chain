# Phase 4 SDK Publication Checklist

This document tracks what remains before the Phase 4 SDK surfaces can be published externally.

It complements the implementation tracker in [`docs/wallet/phase4-task.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-task.md) by focusing on packaging, verification, and release readiness.

Execution details for publishing live releases are tracked in [`docs/developer-sdk/phase4-sdk-release-steps.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-release-steps.md).

## Release Order

1. `@aeko-chain/web3.js`
2. `@aeko-chain/sdk`
3. `aeko-rust-sdk`
4. `aeko-sdk` for Python

## Cross-SDK Requirements

Every SDK should ship with:

- stable package name and versioning strategy
- install instructions
- at least one end-to-end example
- changelog or release-notes process
- publication owner and credentials
- compatibility notes for AEKO testnet and wallet flows

## JavaScript / TypeScript

Package:

- [`sdk/js/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/js/package.json)

Current readiness:

- package scaffold complete
- examples present
- local `install`, `typecheck`, and `build` verified
- published to npm as `@aeko-chain/web3.js@0.1.0`

Remaining:

- confirm package export surface is final for first release
- cut the next release when API changes warrant it

## Node.js

Package:

- [`sdk/node/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/node/package.json)

Current readiness:

- package scaffold complete
- examples present
- local `install`, `typecheck`, and `build` verified
- published to npm as `@aeko-chain/sdk@0.1.0`

Remaining:

- cut the next release when the server-side SDK surface changes materially

## Rust

Crate:

- [`sdk/rust-client/Cargo.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml)

Current readiness:

- crate scaffold complete
- examples present
- `cargo check -p aeko-rust-sdk` verified
- `cargo check -p aeko-rust-sdk --examples` verified
- `cargo publish -p aeko-rust-sdk --dry-run --allow-dirty` verified after removing unpublished workspace dependencies
- published to crates.io as `aeko-rust-sdk@2.0.0`

Remaining:

- add fuller read/write examples against live testnet accounts
- confirm docs.rs build health and document the public API surface after first live release

## Python

Package:

- [`sdk/python/pyproject.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/python/pyproject.toml)

Current readiness:

- package scaffold complete
- examples present
- syntax compilation verified with `python3 -m compileall`
- published to PyPI as `aeko-sdk==0.1.0`

Remaining:

- add install and smoke-test commands to CI or release notes
- add richer analytics and protocol helpers for first public cut
- cut the next release when the public API changes materially

## Publication Record

When each SDK is published, record:

- package version
- publication date
- package registry URL
- git commit or tag
- release owner

Use [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md) as the final fill-in record.
