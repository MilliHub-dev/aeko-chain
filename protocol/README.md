# Protocol Specifications

This directory is reserved for protocol design notes and extracted specifications.

The current executable protocol logic lives elsewhere in the workspace:
*   `core/`, `runtime/`, `svm/`, and `program-runtime/` implement state transition and execution behavior.
*   `validator/` and `rpc/` implement node-facing services.
*   `programs/` contains the native on-chain programs compiled into the runtime.
*   `sdk/` exposes the client and program interfaces used by applications and tooling.

Use `docs/aeko-chain/consensus.md`, `docs/permission-layer/`, and the other documents under `docs/` as the source of truth for intended AEKO behavior. Do not assume that a standalone `protocol/` implementation already exists because this directory is present.
