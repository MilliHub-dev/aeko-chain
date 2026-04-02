# Phase 4 Task Plan

## Scope

Phase 4 covers wallet infrastructure, identity foundations, permission controls, and developer SDK delivery for AEKO Chain.

This plan is execution-focused. It defines the work order, deliverables, acceptance criteria, and dependencies for Phase 4.

## Existing Wallet Doc Alignment

The current wallet docs already establish several assumptions Phase 4 should preserve:

- [`docs/wallet/wallet-architecture.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-architecture.md) treats the wallet as an identity manager and references an Identity PDA
- [`docs/wallet/wallet-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-api.md) assumes an `aeko-wallet-adapter` interface with identity extensions
- [`docs/wallet/permissions.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permissions.md) already describes scopes and session-key ideas
- [`docs/wallet/security.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/security.md) already expects Ledger support, phishing protection, and auto-disconnect
- [`docs/platform-features/identity-system.md`](/Users/ok/Documents/projects/aeko-chain/docs/platform-features/identity-system.md) already links wallet addresses to identity PDAs and reputation
- [`docs/permission-layer/identity-and-clearance.md`](/Users/ok/Documents/projects/aeko-chain/docs/permission-layer/identity-and-clearance.md) already defines identity tiers including KYC-linked flows

Phase 4 should refine and implement those assumptions, not replace them casually.

## Recommended Order

1. Identity spec
2. Wallet core
3. Wallet permission controls
4. JavaScript SDK
5. Node.js SDK
6. Rust SDK
7. Python SDK

## Foundation

### Identity & DID

This is the blocking foundation for all later Phase 4 work.

Deliverable:

- [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md)

Required work:

- define DID schema
- define DID format and resolution rules
- define on-chain identity storage model
- define wallet address as the primary identity anchor
- define optional KYC module with off-chain verification and on-chain hash anchoring
- define reputation score structure and data sources

Acceptance criteria:

- DID format is explicit
- storage location and resolution flow are explicit
- KYC boundary is explicit
- reputation inputs are explicit
- downstream wallet and SDK work can reference this doc as the identity source of truth

## Ticket 4.1

### Wallet Core

Build the wallet core after `identity.md` is signed off.

Required work:

- key generation
  - Ed25519 keypair generation
  - BIP39 seed phrase support
  - derivation path definition
- key storage
  - encrypted local keystore
  - hardware wallet interface for Ledger
- signing
  - transaction signing
  - message signing
  - batch signing
- stateless signature support
  - signing flow without persistent session state
  - suitable for military / fintech contexts
- key export / import
  - encrypted backup flow
  - restore from seed flow
- write wallet core API spec
- deploy and test wallet core service on testnet

Deliverables:

- wallet core implementation
- wallet core API spec
- testnet deployment record

Acceptance criteria:

- can create and restore wallets
- can sign transactions and messages
- can batch sign
- can export and re-import encrypted key material
- Ledger path is documented and testable
- stateless signature flow is documented and verified

Current progress:

- `identity.md` completed
- wallet docs reconciled against the identity model
- wallet core API spec completed
- local mnemonic, keystore, message signing, transaction signing, batch signing, and stateless signing implemented in `wallet-core`
- Ledger discovery and hardware-backed signing wrapper implemented in `wallet-core`
- wallet core service deployment and testnet validation still pending

## Ticket 4.2

### Wallet Permission Controls

Build after wallet core is stable.

Required work:

- spend limits
  - per-transaction cap
  - daily cap
  - per-token cap
- app permissions
  - program allowlist
  - revocation flow
- multi-role access
  - owner
  - spender
  - viewer
- time-locked permissions
- emergency freeze
  - instant freeze by owner
  - re-auth to unfreeze
- permission audit log
  - on-chain grant and revoke record
- end-to-end permission tests on testnet

Deliverables:

- permission-control implementation
- permission-control spec
- audit log schema

Acceptance criteria:

- wallet owner can define and revoke permission policies
- unauthorized actions fail predictably
- time-limited policies expire automatically
- freeze and unfreeze flow is documented and tested
- permission changes are auditable

Current progress:

- wallet permission controls spec drafted in [`docs/wallet/permission-controls-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permission-controls-spec.md)
- existing wallet permission doc aligned to the implementation spec
- wallet permission program scaffold added
- initialize, grant, revoke, freeze, and unfreeze instruction paths added
- audit-log account model added
- delegate update path added
- usage-window accounting and effective permission resolution added
- processor-level tests added for update, over-cap rejection, deny-by-default enforcement, expiry resolution, and audit logging
- token-cap and time-window edge-case tests added
- wallet-core permission helper layer added for building and signing wallet-permission transactions
- JS SDK scaffold added in [`sdk/js`](/Users/ok/Documents/projects/aeko-chain/sdk/js) with RPC, wallet adapter, and permission request helpers
- JS SDK transaction send / confirm helpers and subscription example added
- JS SDK AEKO-721 prepared transaction builders added
- JS SDK wallet-permissions prepared transaction builders added
- JS SDK local dependency install, `typecheck`, and `build` completed
- Node.js SDK scaffold added in [`sdk/node`](/Users/ok/Documents/projects/aeko-chain/sdk/node) with server-side signing, batch send helpers, and polling webhook-style listeners
- Node.js SDK local dependency install, `typecheck`, and `build` completed
- Node.js SDK package boundary tightened to consume `@aeko-chain/web3.js` through package exports rather than repo-local `dist` imports
- Rust SDK scaffold added in [`sdk/rust-client`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client) with async RPC access, transaction submission helpers, AEKO-721 builders, wallet-permissions builders, and typed account decoders
- Rust SDK example coverage added in [`sdk/rust-client/examples`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client/examples)
- Rust SDK published to crates.io as `aeko-rust-sdk@2.0.0`
- Rust SDK patch release `2.0.1` prepared in repo to refresh docs.rs metadata and hosted documentation
- Python SDK scaffold added in [`sdk/python`](/Users/ok/Documents/projects/aeko-chain/sdk/python) with stdlib-based JSON-RPC access, query helpers, raw transaction submission, and signature polling helpers
- Python SDK AEKO-721 and wallet-permissions helpers added for decoded reads and instruction planning
- Python SDK examples added in [`sdk/python/examples`](/Users/ok/Documents/projects/aeko-chain/sdk/python/examples)
- Python SDK published to PyPI as `aeko-sdk==0.1.0`
- JavaScript SDK published to npm as `@aeko-chain/web3.js@0.1.0`
- Node.js SDK published to npm as `@aeko-chain/sdk@0.1.0`
- cross-SDK publication checklist added in [`docs/developer-sdk/phase4-sdk-publication.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-publication.md)
- SDK release execution guide added in [`docs/developer-sdk/phase4-sdk-release-steps.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-release-steps.md)
- Phase 4 closeout record template added in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)
- wallet core testnet validation runbook added in [`docs/wallet/wallet-core-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-core-testnet-validation.md)
- wallet permissions testnet validation runbook added in [`docs/wallet/wallet-permissions-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-permissions-testnet-validation.md)
- wallet-core validation helper examples added in [`wallet-core/examples`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples)
- command-level validation guide added in [`docs/wallet/phase4-validation-commands.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-validation-commands.md)
- wallet-core local validation helper executed successfully on `2026-04-02`
- wallet-permissions local validation helper executed successfully on `2026-04-02`

## Ticket 4.3

### Developer SDKs

Build in this order because it unlocks the most integrations fastest:

1. JavaScript SDK
2. Node.js SDK
3. Rust SDK
4. Python SDK

#### JavaScript SDK

Required work:

- connect to AEKO RPC
- create / import wallet
- send transactions
- query balances, tokens, NFTs
- subscribe to account changes over websocket

Deliverables:

- JS package
- README
- working examples
- published npm package

#### Node.js SDK

Required work:

- server-side transaction signing
- batch transaction support
- webhook listeners for on-chain events
- admin utilities for backend services

Deliverables:

- Node.js package
- README
- working examples
- published npm package

#### Rust SDK

Required work:

- native client for validators and high-performance apps
- full instruction builder support
- async support

Deliverables:

- Rust crate
- README
- working examples
- published crate

#### Python SDK

Required work:

- scripting and tooling support
- data querying and analytics helpers
- internal ops, monitoring, and governance script support

Deliverables:

- Python package
- README
- working examples
- published package

## Cross-Cutting Deliverables

Each SDK must ship with:

- README
- working examples
- published package

Each major Phase 4 deliverable should also include:

- test coverage
- versioning strategy
- deployment or publication record
- compatibility notes with the AEKO wallet adapter and identity model

## Dependencies

- `identity.md` blocks Wallet Core and Permission Controls
- Wallet Core blocks Wallet Permission Controls
- Wallet Core also blocks practical SDK wallet helpers
- JS SDK should ship before the rest of the SDK set
- Node.js SDK should follow JS because it unblocks backend and Aeko Social integration paths

## Suggested Exit Criteria

Phase 4 is complete only when:

- [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md) is written and signed off
- wallet core is implemented and tested on testnet
- wallet permission controls are implemented and tested end-to-end
- JS SDK is published with working examples
- Node.js SDK is published with working examples
- Rust SDK is published with working examples
- Python SDK is published with working examples
- wallet docs are updated to match the final implemented identity and permission model

## Remaining Closeout Focus

The remaining work is no longer initial planning. It is closeout work:

1. validate wallet core on testnet
2. validate wallet permissions end-to-end on testnet
3. record live testnet transaction signatures and rejection evidence in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)
4. update this tracker once the live validation evidence is recorded
