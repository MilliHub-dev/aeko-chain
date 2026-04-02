# Phase 4 Closeout Record

Status: SDK publication complete, live wallet testnet validation still pending

Use this document as the single source of truth for the final Phase 4 release values and verification artifacts.

## Environment

- closeout date: `2026-04-02`
- operator: `aeko_foundation`
- release tag or commit:
- testnet RPC: `https://api.testnet.aeko.chain`

## Wallet Core

- wallet-core testnet validation date: `2026-04-02`
- wallet-core operator: `aeko_foundation`
- wallet-core transaction signature(s): `not yet submitted on AEKO testnet; helper currently verifies local signing only`
- wallet-core stateless signing verification: `local helper output hash 2HZ8bofMZz3uxZA8Sz3S59sATMHBfoabAXaJnDACNueF`
- Ledger validation note: `not yet executed with hardware device`
- wallet-core verification notes: `local helper executed successfully; wallet pubkey HaS1EAF12jbTxANJc72R27NoZ4mU5Z3EGvsYbmWRcFZY, DID did:aeko:HaS1EAF12jbTxANJc72R27NoZ4mU5Z3EGvsYbmWRcFZY, signed message pubkey matched wallet, single signed transaction count 1, batch signed transaction count 2`

## Wallet Permissions

- wallet-permissions testnet validation date: `2026-04-02`
- initialization tx: `not yet submitted on AEKO testnet; helper produced locally signed init transaction with 1 signature`
- permission state verification tx: `not yet submitted on AEKO testnet; helper planned permission state 1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM`
- audit-log verification tx: `not yet submitted on AEKO testnet; helper planned audit log 1111111ogCyDbaRMvkdsHB3qfdyFYaG1WtRUAfdh`
- freeze / unfreeze verification tx: `freeze plan signed locally with 1 signature; no live freeze/unfreeze tx signatures recorded yet`
- over-cap rejection note: `processor tests cover rejection; no live testnet rejection tx recorded yet`
- allowlist rejection note: `processor tests cover deny-by-default and allowlist rejection; no live testnet rejection tx recorded yet`

## JavaScript SDK

- planned first public version: `0.1.0`
- package version: `0.1.0`
- npm package URL: `https://www.npmjs.com/package/@aeko-chain/web3.js`
- publish date: `2026-04-02`
- release owner: `aeko_foundation`

## Node.js SDK

- planned first public version: `0.1.0`
- package version: `0.1.0`
- npm package URL: `https://www.npmjs.com/package/@aeko-chain/sdk`
- publish date: `2026-04-02`
- release owner: `aeko_foundation`

## Rust SDK

- planned first public version: `2.0.0`
- current publish status: published to crates.io
- crate version: `2.0.0`
- crates.io URL: `https://crates.io/crates/aeko-rust-sdk`
- docs.rs URL: `https://docs.rs/aeko-rust-sdk`
- publish date: `2026-04-02`
- release owner: `aeko_foundation`
- next patch release prepared in repo: `2.0.1` to refresh docs.rs with crate-level documentation and docs.rs metadata

## Python SDK

- planned first public version: `0.1.0`
- package version: `0.1.0`
- PyPI URL: `https://pypi.org/project/aeko-sdk/0.1.0/`
- publish date: `2026-04-02`
- release owner: `aeko_foundation`

## Verification

- JS SDK example verification: `npm --prefix sdk/js run typecheck && npm --prefix sdk/js run build passed before npm publication`
- Node.js SDK example verification: `npm --prefix sdk/node run typecheck && npm --prefix sdk/node run build passed before npm publication`
- Rust SDK example verification: `cargo check -p aeko-rust-sdk --examples passed; cargo publish -p aeko-rust-sdk --dry-run passed before crates.io publication`
- Python SDK example verification: `python3 -m compileall sdk/python/src sdk/python/examples passed before PyPI publication`
- wallet-core validation runbook used: [`docs/wallet/wallet-core-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-core-testnet-validation.md)
- wallet-permissions validation runbook used: [`docs/wallet/wallet-permissions-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-permissions-testnet-validation.md)
- wallet docs compatibility check: `updated on 2026-04-02 to reflect published SDKs and local validation-helper execution status`

## Final Closeout

- [ ] wallet core validated on testnet
- [ ] wallet permissions validated end-to-end on testnet
- [x] JS SDK published
- [x] Node.js SDK published
- [x] Rust SDK published
- [x] Python SDK published
- [x] Phase 4 tracker updated to reflect publication
