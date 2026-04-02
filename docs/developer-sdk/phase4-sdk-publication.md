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

Remaining:

- decide first public version
- add publish script and release instructions
- confirm package export surface is final for first release
- publish to npm

## Node.js

Package:

- [`sdk/node/package.json`](/Users/ok/Documents/projects/aeko-chain/sdk/node/package.json)

Current readiness:

- package scaffold complete
- examples present
- local `install`, `typecheck`, and `build` verified

Remaining:

- add publish script and release instructions
- decide first public version
- publish to npm

## Rust

Crate:

- [`sdk/rust-client/Cargo.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/Cargo.toml)

Current readiness:

- crate scaffold complete
- examples present
- `cargo check -p aeko-rust-sdk` verified
- `cargo check -p aeko-rust-sdk --examples` verified

Remaining:

- add fuller read/write examples against live testnet accounts
- decide docs.rs and crates.io release metadata policy
- publish to crates.io

## Python

Package:

- [`sdk/python/pyproject.toml`](/Users/ok/Documents/projects/aeko-chain/sdk/python/pyproject.toml)

Current readiness:

- package scaffold complete
- examples present
- syntax compilation verified with `python3 -m compileall`

Remaining:

- add install and smoke-test commands to CI or release notes
- add richer analytics and protocol helpers for first public cut
- decide first public version
- publish to PyPI

## Publication Record

When each SDK is published, record:

- package version
- publication date
- package registry URL
- git commit or tag
- release owner

Use [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md) as the final fill-in record.
