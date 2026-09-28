# Explorer consumer developer documentation brainstorm

Date: 2026-09-28
Status: Working design contract for PR #85
Surface: `apps/explorer/web` → `/docs`
Audience: application developers integrating with AEKO Chain

## 1. Problem statement

The current Explorer documentation behaves like a catalog of features rather than a complete developer journey. It mixes product concepts, protocol internals, operator procedures and consumer-facing guidance; several pages stop at descriptions without showing how to install tools, configure a network, invoke the CLI, use an SDK, call an API, build a transaction, verify a result or recover from common failures.

The public `/docs` surface must answer a developer's next question without requiring knowledge of the AEKO monorepo.

## 2. Repository evidence already verified

The repository currently contains real developer-facing surfaces that the public docs must connect rather than paraphrase generically:

- CLI: `apps/cli`, including wallet, cluster-query, program deployment, nonce, stake, vote, address lookup table, feature, inflation and configuration command families.
- JavaScript SDK: `apps/sdk/js`.
- Node.js SDK: `apps/sdk/node`.
- Python SDK: `apps/sdk/python`.
- Rust client SDK: `apps/sdk/rust-client`.
- On-chain Rust program SDK and build tooling: `sdk/program`, `cargo-build-sbf`, and `contracts/hello-aeko-program`.
- Explorer/API/network documentation: `docs/rpc-and-apis`.
- Wallet and permissions documentation: `docs/wallet` and `docs/permission-layer`.
- Token standards and minting flows: `docs/token-standards` and `programs/token-20`, `programs/token-721`, `programs/public-mint`.
- SocialFi programs and integration guides: `docs/socialfi`, `docs/aeko-social-integration`, and the five `programs/social-*` crates.
- Bridge documentation: `docs/bridge`.
- Security guidance: `docs/security`.
- Protocol/user concepts: `docs/aeko-chain`.
- Runnable or copyable examples: `docs/developer-sdk/examples`, SDK example directories, and the hello-program contract example.

The current Explorer page still imports `src/data/docs.json`. A newer modular `src/data/docs/index.js` exists but is not wired into `Docs.jsx`, and its referenced JSON modules are not present. That path is therefore incomplete and cannot be treated as the active documentation source.

## 3. Audience boundary

The public Explorer docs are for a developer building an application, script, backend, wallet integration or smart contract.

They are **not** the place to teach:

- validator internals;
- monorepo ownership boundaries;
- bootstrap-service implementation details;
- PostgreSQL/indexer deployment mechanics;
- release engineering;
- internal state-machine terminology unless required to consume a public API;
- private infrastructure secrets or operator-only procedures.

Those subjects may remain in repository/operator docs. Public docs should translate them into the smallest consumer-facing fact necessary to integrate safely.

## 4. Documentation language rule

Every public page should use developer-consumer terminology:

- "RPC endpoint" instead of internal server wiring language;
- "Explorer API" instead of indexer implementation language;
- "test funding request" instead of Faucet transport details;
- "wallet permission" instead of implementation-crate terminology where possible;
- "program" or "smart contract" depending on developer context;
- "network" rather than deployment topology unless endpoint selection matters.

Repository evidence is for internal planning, review and validation only. The public `/docs` UI must never render repository paths, filenames, Markdown documents, source links, implementation-reference panels or maintainer-only evidence.

## 5. Information architecture options considered

### Option A: Expand the existing feature catalog

Keep the current sidebar and add more paragraphs to every entry.

**Rejected.** It preserves the core problem: concepts remain detached from installation, commands, SDK usage, examples and verification.

### Option B: Mirror the monorepo

Create sections matching `apps/`, `programs/`, `rpc/`, `sdk/`, and other repository directories.

**Rejected.** This is useful to AEKO maintainers but forces consumer developers to understand source ownership before they can perform a task.

### Option C: Task-oriented portal backed by a capability/reference layer

Organize the public docs around what developers are trying to accomplish, then present only the supported CLI, SDK and API paths that help complete each task.

**Chosen.** It allows the same real capability to be documented once conceptually and then connected to all supported tools.

## 6. Chosen public documentation map

### Start here
- Overview
- Choose a network
- Install the CLI
- Create or load a wallet
- Get test AEKO
- Send your first transaction
- Verify it in Aeko Scan

### Tooling
- CLI reference and command families
- JavaScript / TypeScript SDK
- Node.js SDK
- Python SDK
- Rust client SDK
- Examples index

### Network APIs
- Network endpoints
- JSON-RPC quick start
- JSON-RPC reference
- WebSocket subscriptions
- Explorer API
- Rate limits and error handling

### Smart contracts
- Program model
- Write the first Rust program
- Build with SBF tooling
- Deploy
- Invoke
- Upgrade / inspect / close
- Program security checklist

### Wallets and permissions
- Wallet model and signing
- Browser/injected-wallet integration
- Permission concepts
- Permission request/build flows
- Identity and clearance concepts
- Revocation / restricted flows where the public contract supports them

### Tokens and NFTs
- AEKO-20
- AEKO-721
- Creator coins
- Minting
- Permissioned minting
- NFT lifecycle example
- Metadata conventions

### SocialFi
- SocialFi overview
- Posts and replies
- Engagement
- Creator rewards
- Staking
- Monetization and subscriptions
- Anti-spam
- Backend verification/integration
- Read through Explorer API / write through signed chain transactions

### Bridge
- Availability/status
- Supported chains
- Message flow
- Relayer boundary
- Integration and security model

### Security
- Key handling
- Signing safety
- Contract/program safety
- Permission-aware integration
- RPC/API abuse and rate limits
- Threat model concepts relevant to app developers

### Protocol concepts
- Accounts and transactions
- Transaction lifecycle
- Fees
- Commitment/finality
- Consensus at the level an application developer needs
- Network differences

### Troubleshooting
- CLI connectivity
- funding status
- failed transactions
- SDK/RPC errors
- websocket reconnects
- program deploy/invoke failures
- Explorer indexing delay

## 7. Page anatomy

Every substantial capability page should contain the parts that apply:

1. **What you can do**
2. **Prerequisites**
3. **Network support / availability**
4. **Quick start**
5. **CLI**
6. **JavaScript / TypeScript**
7. **Node.js**
8. **Python**
9. **Rust**
10. **HTTP / RPC**
11. **Expected result**
12. **Verify in Aeko Scan**
13. **Errors and recovery**
14. **Security notes**
15. **Related guides**
16. **Release/product links**, when required for the developer task; never repository-source references

A page must not fabricate a language/tool path. If a capability is not exposed by a given SDK, that SDK tab/section is omitted or explicitly marked unsupported.

## 8. Capability-status model

Documentation needs an explicit status vocabulary so planned or internal concepts are not presented as public features:

- **Available**: implemented and usable through a documented public path.
- **Testnet**: implemented, but the documented public workflow is testnet-only.
- **Local development**: only documented for a local/custom development environment.
- **Operator-managed**: developers can consume the result but cannot perform the operator action through the public surface.
- **Design / not public**: repository documentation describes the concept, but there is no verified public integration path.

Status is evidence-driven. A concept is not upgraded to Available because a markdown file describes it.

## 9. Interaction model

The docs should behave like a developer tool:

- every displayed endpoint can be copied;
- every install command and meaningful code block has a copy action;
- active Mainnet/Testnet selection updates network-specific endpoint examples;
- commands use the selected endpoint where doing so is safe;
- code blocks stay horizontally scrollable and never break the page;
- sidebar groups remain navigable on mobile;
- pages expose previous/next navigation;
- section anchors support deep linking;
- package registry and release-distribution links may be shown when they are part of the developer workflow; repository source links must not be rendered;
- interactive controls have keyboard focus states and accessible labels.

## 10. Visual direction

Keep the existing AEKO visual language, but make the docs denser and more editorial than the marketing pages:

- strong reading column;
- persistent task navigation;
- compact status badges;
- high-contrast command/code panels;
- subtle section dividers;
- restrained animation;
- consistent copy affordance;
- responsive two/three-column layouts only where they improve scanning.

The documentation should feel like a serious developer console, not a landing page.

## 11. Content-source policy

Public docs are assembled from verified repository evidence in this order:

1. executable/public client implementation;
2. tests/examples that exercise that implementation;
3. current public developer docs;
4. internal architecture docs for explanatory background only.

When documents disagree with code, code wins. When no public path can be proven, the page must say so rather than inventing instructions.

## 12. Non-goals

This PR does not need to:

- expose private Admin or validator operations in the public docs;
- create new SDK capabilities simply to make documentation symmetrical;
- promise bridge/governance/identity features that are not publicly consumable;
- publish packages;
- change chain protocol behavior;
- redesign unrelated Explorer pages.

## 13. Success definition

A new developer should be able to enter `/docs`, choose the relevant network and complete a real supported task from installation through verification without reading AEKO core source code or guessing which CLI/SDK/API path exists.


## 14. Public/internal evidence boundary — 2026-09-28 amendment

Repository files, tests and implementation details remain valid evidence for authors and reviewers, but they are not public documentation content. Public `/docs` must not expose source-tree paths, filenames, Markdown references, GitHub blob/tree links, "source of truth" language, or maintainer/operator evidence panels.
