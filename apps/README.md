# AEKO applications

`apps/` contains AEKO products, developer-facing tools, external client SDKs, and off-chain services that consume the chain but are not part of consensus, transaction execution, or the on-chain protocol runtime.

## Layout

- `admin/` — administrative web application.
- `cli/` — the end-user/operator `aeko` command-line application.
- `explorer/backend/` — off-chain Explorer indexer and REST API.
- `explorer/web/` — Explorer and Network Tools web application.
- `sdk/js/` — JavaScript/TypeScript client SDK (`@aeko-chain/web3.js`).
- `sdk/node/` — Node.js backend SDK (`@aeko-chain/sdk`).
- `sdk/python/` — Python client SDK.
- `sdk/rust-client/` — high-level external Rust client SDK.

## What does not belong here

Blockchain-critical libraries and services stay at the repository root. In particular:

- `sdk/` is the core Rust protocol/runtime SDK used throughout the chain and is intentionally **not** the same thing as `apps/sdk/`.
- `programs/`, `program-runtime/`, `runtime/`, `svm/`, `core/`, `ledger/`, `bank*`, `rpc/`, `validator/`, and related crates remain part of the blockchain implementation.
- `social-bootstrap/`, `genesis/`, `faucet/`, and key/runtime tooling that directly participate in network initialization or chain operation remain with the blockchain core.

When adding a new component, put it in `apps/` when it is a deployable/user-facing product, external SDK, or off-chain service that talks to AEKO through public/internal chain interfaces. Keep it with the core when consensus, execution, ledger state, protocol rules, native programs, or low-level node operation depends on it.
