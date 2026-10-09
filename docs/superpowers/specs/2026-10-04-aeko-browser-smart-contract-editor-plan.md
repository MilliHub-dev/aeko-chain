# AEKO browser smart-contract editor specification and implementation plan

Date: 2026-10-04
Status: PLANNED
Target route: `/docs/editor`
Target repository: `MilliHub-dev/aeko-chain`

## 1. Requested outcome

Build a browser-native AEKO smart-contract development workbench at `/docs/editor` that covers the practical Rust program lifecycle without requiring a local AEKO toolchain:

1. create/import a project;
2. edit a multi-file Rust program;
3. build to AEKO SBF;
4. run program tests and inspect diagnostics;
5. create/use a development wallet;
6. obtain Testnet/local development funds using the existing AEKO funding path;
7. deploy or upgrade the compiled program to the selected non-Mainnet network;
8. inspect program id, transaction signatures, logs and Explorer links;
9. persist projects in the browser and export/import project files;
10. recover clearly from compilation, RPC, funding and deployment errors.

The interaction benchmark is the current Solana Playground experience, adapted to AEKO's actual chain, CLI, SDK, network policy and visual language rather than copied literally.

## 2. Verified repository capabilities

The implementation plan is based on current repository evidence:

- `apps/explorer/web` is the React 19 + Vite + Tailwind 4 product surface that owns `/docs`.
- `apps/explorer/web/src/App.jsx` currently has `/docs` but no `/docs/editor` route.
- `apps/explorer/web/src/pages/Docs.jsx` establishes the current AEKO developer-docs visual and accessibility language.
- `apps/explorer/web/src/components/NetworkContext.jsx` already provides persistent network selection and explicitly distinguishes Mainnet from test surfaces.
- `apps/explorer/web/src/utils/aekoRpcClient.js` already supports live JSON-RPC reads, funding, transaction submission and confirmation.
- `apps/explorer/web/src/utils/aekoTestKeypair.js` already owns browser-local development keypairs used by test surfaces.
- `contracts/hello-aeko-program` is a real external Rust/SBF starter contract using `aeko-program`.
- the repository owns AEKO SBF tooling through `cargo-build-sbf` / `aeko-cargo-build-sbf`.
- the CLI owns the actual program lifecycle through `aeko program ...`, including deploy, upgrade/write-buffer, show, dump, close and extend.
- `.github/workflows/smart-contracts.yml` already proves SBF build + live AEKO Testnet deploy/invoke as an executable repository workflow.
- `apps/explorer/backend` is a Rust/Axum API and must not be turned into an arbitrary-code execution host.

## 3. Solana Playground parity baseline

The benchmarked browser experience currently exposes:

- project explorer with files/folders and project persistence/import/share actions;
- separate Program and Client workspaces;
- Rust editing;
- Build and Deploy actions;
- client Run and Test actions;
- integrated terminal/output;
- a browser-local development wallet;
- visible cluster, wallet address and balance;
- developer funding from the workbench;
- tutorials/resources and starter projects.

AEKO parity means covering the same developer jobs while keeping AEKO terminology, network behavior, loaders and SDK contracts authoritative.

## 4. Product and UX contract

### Desktop information architecture

The route is an IDE-style full workbench inside the existing global AEKO layout:

- **Top command bar**: project name, dirty/saved state, Build, Test, Deploy/Upgrade, overflow project actions.
- **Left activity rail**: Explorer, Search, Deployments, Help.
- **Left panel**: project tree, new file/folder, rename/delete, templates and project operations.
- **Center editor**: tabbed files, line numbers, Rust-aware presentation, keyboard editing, dirty indicators.
- **Right context panel**: selected network, wallet, balance, program id, build artifact and deployment state.
- **Bottom panel**: Problems, Build, Tests, Terminal/Logs, transaction output.

The workbench must prioritize code area over decorative panels. Panels are collapsible and resizable where practical.

### Small-screen behavior

The editor remains usable without horizontal page overflow:

- the code editor is the primary surface;
- Explorer/right context/bottom output become drawers or tabbed sheets;
- command actions remain reachable from a compact toolbar;
- controls keep at least 44px touch targets;
- long logs/code scroll inside their own regions.

### Accessibility

Required:

- complete keyboard traversal;
- visible `:focus-visible` treatment;
- semantic buttons/labels/status regions;
- accessible file-tree state and active tabs;
- `aria-live` for build/test/deploy state changes without flooding screen readers;
- reduced-motion support;
- errors are never represented by color alone.

### Visual direction

Use the existing AEKO dark tokens and restrained accent color. The editor should read as a technical instrument: dense, crisp, low-chrome and content-first. Avoid generic dashboard cards, excessive gradients, oversized marketing headings and gratuitous motion.

## 5. Architecture

### 5.1 Browser editor

New production surface under `apps/explorer/web`:

- route `/docs/editor`;
- editor page/components under `src/components/editor`;
- project model and IndexedDB/local persistence helpers under `src/utils/editor*`;
- build/test client under `src/utils/editorApi.js`;
- deployment client under `src/utils/aekoProgramDeploy.js`;
- existing `NetworkContext`, funding helpers, RPC client and development-wallet model are reused rather than duplicated.

The browser keeps private wallet material local. Build/test requests contain project source only. Deployment transactions are constructed and signed in the browser, then submitted through the existing selected-network RPC.

### 5.2 Public Editor API boundary

The Explorer API gains a small `features/editor` contract that owns validation, capability discovery and communication with the private compiler runner.

Initial contract:

- `GET /editor/capabilities`
- `POST /editor/build`
- `POST /editor/test`

The Explorer API must never execute submitted source itself. It validates request shape/size, enforces feature/network policy and forwards to the isolated private runner.

### 5.3 Isolated editor runner

Add a dedicated application under `apps/editor-runner` for untrusted compilation/testing.

Responsibilities:

- create an ephemeral workspace per request;
- accept only normalized relative files beneath an allowlisted project tree;
- generate/validate the supported Cargo manifest;
- invoke the repository-owned AEKO SBF builder for builds;
- invoke bounded Cargo/program tests;
- return structured diagnostics, stdout/stderr, artifact metadata and compiled SBF bytes for successful builds;
- always remove the workspace after completion;
- expose no wallet, deployment key, database credential or validator credential.

Deployment requirements:

- run as non-root;
- read-only root filesystem;
- writable tmpfs only for job workspace/cache;
- no Docker socket;
- no privileged capabilities;
- no inbound public route except through the Explorer API/private service network;
- no general outbound network at runtime;
- strict request, file-count, source-size, output-size and timeout limits;
- bounded process count, CPU and memory;
- bounded concurrency, with overload returned as a typed error;
- fixed/allowlisted dependencies only for the first production version.

### 5.4 Client-side deployment

Compiled SBF is deployed from the browser using the existing browser-local development wallet and AEKO RPC.

The deployment implementation must:

- target only networks where the editor policy explicitly allows deployment;
- refuse Mainnet deployment in the first production version;
- estimate/check payer balance before starting;
- create/write/finalize the loader accounts using AEKO's canonical loader instructions;
- chunk uploads to transaction-safe sizes;
- sign every transaction locally;
- confirm every stage before advancing;
- support fresh deploy and upgrade when the selected program is upgradeable by the current wallet;
- expose transaction signatures and Explorer links;
- never send private-key bytes to Explorer API, editor runner, logs or telemetry.

If repository SDK primitives are insufficient, add the smallest reusable loader/deployment primitive to the AEKO JS SDK and consume that rather than creating an editor-only incompatible transaction format.

## 6. Project model

Initial project schema:

```text
Project
  id
  name
  framework = native-rust
  files[]
    path
    content
  activeFile
  createdAt
  updatedAt
  lastBuild?
    sourceHash
    artifactHash
    artifactSize
    builtAt
  deployments[]
    network
    programId
    authority
    artifactHash
    deployedAt
    signature
```

Persistence is browser-local and versioned. Import/export must validate paths and total size before storing.

Starter templates:

- Hello AEKO native Rust program, derived from the real `contracts/hello-aeko-program` public program surface;
- empty native program scaffold;
- optional instruction/state example only when verified against current SDK APIs.

No fake example may be presented as deployed or tested.

## 7. Build/test contract

### Request rules

- JSON only;
- normalized relative paths;
- reject `..`, absolute paths, symlinks and duplicate normalized paths;
- allow only text source/config files required by supported templates;
- hard maximum file count and total bytes;
- no arbitrary environment values;
- no arbitrary command line or shell fields.

### Build response

Return a stable envelope containing:

- status;
- source hash;
- elapsed milliseconds;
- stdout/stderr;
- structured diagnostics where parseable;
- artifact name, SHA-256 and byte length;
- base64 artifact only on success;
- toolchain/build metadata safe for public disclosure.

### Test response

Return:

- status;
- elapsed milliseconds;
- stdout/stderr;
- discovered/pass/fail counts where parseable;
- typed timeout/resource/compile failure codes.

## 8. Security model

This feature processes hostile source by definition.

Non-negotiable controls:

- compilation/testing is isolated from Explorer API, PostgreSQL and validator credentials;
- runner container has no production secrets;
- source never becomes shell text;
- command names/arguments are server-defined;
- path traversal and oversized requests fail before the runner;
- timeout kills the child process and descendants;
- output is capped;
- logs redact source/body/private material by default;
- CORS remains explicit;
- editor feature can be disabled independently;
- deployment is fail-closed on Mainnet;
- wallet private key remains browser-local;
- CSP/telemetry must not copy editor buffers.

## 9. Implementation work graph

`Lead`
→ `Repository Investigator`
→ `UI/UX Product Engineer`
→ `API/Contract Engineer`
→ `Security/Reliability Engineer`
→ `Frontend Engineer + Backend/Runner implementation`
→ `Test Engineer`
→ `Independent Code Reviewer`
→ `Integration/Dogfood Engineer`
→ `Git/Release Engineer`

Blocking findings return to the owning implementation stage.

## 10. Implementation sequence

### Phase A — specification and contract

- commit this specification before production mutation;
- open the draft PR;
- keep the PR implementation checklist as the live task ledger;
- verify runner/deployment assumptions against AEKO loader/CLI code before implementation.

### Phase B — project/editor foundation

- add the route and workbench shell;
- project persistence/import/export;
- file tree, tabs and editor editing primitives;
- responsive drawers/panels;
- keyboard shortcuts;
- starter templates and unsaved-state protection.

### Phase C — isolated build/test plane

- implement runner service;
- add compiler image/runtime hardening;
- implement Explorer API proxy/validation;
- add capability negotiation;
- connect Build and Test UI with cancellation, diagnostics and output.

### Phase D — wallet/funding/network integration

- reuse existing development-wallet storage;
- show address/balance/network in editor status;
- use existing Testnet/local funding contract;
- make all deployment controls policy-aware and disabled on Mainnet.

### Phase E — deploy/upgrade lifecycle

- implement or reuse AEKO JS program-loader transaction primitives;
- deploy compiled artifact;
- upgrade compatible deployed programs;
- persist deployment metadata;
- deep-link confirmed signatures/programs to Explorer;
- add failure recovery for interrupted chunk upload/confirmation.

### Phase F — quality and product finish

- loading/empty/error/offline states;
- keyboard and focus audit;
- narrow viewport behavior;
- build/test/deploy diagnostics;
- docs entry points and in-editor help;
- performance pass so editor source/log state does not rerender the whole workbench.

## 11. Validation plan

### Frontend

From `apps/explorer/web` when executable:

- `npm test`
- `npm run lint`
- `npm run build`

Add focused tests for project schema/persistence, path validation, editor API response handling, deployment state machine and route/network gating.

### Backend and runner

Run focused tests first, then applicable:

- `cargo fmt --check --all`
- `cargo test -p aeko-explorer-backend`
- runner unit/integration tests;
- `cargo clippy` for changed Rust crates;
- production image/config validation.

### Contract integration

Exercise:

1. create Hello AEKO project;
2. edit Rust source;
3. build successfully and receive a non-empty SBF artifact/hash;
4. introduce a compile error and verify line/error diagnostics;
5. restore source and run tests;
6. create/select development wallet;
7. fund wallet using the existing Testnet flow;
8. deploy to AEKO Testnet;
9. confirm program account on chain;
10. change source, rebuild and upgrade;
11. verify updated program;
12. reload browser and confirm project/deployment metadata persists;
13. verify Mainnet refuses deployment;
14. verify oversized/path-traversal/malformed requests are rejected;
15. verify a timeout/resource exhaustion job is terminated and reported.

## 12. Acceptance criteria

The work is complete only when:

1. `/docs/editor` is a real routable AEKO workbench, not a static prototype.
2. Users can create, rename, delete, import, export and persist multi-file Rust projects.
3. Editing provides file tabs, line-numbered code editing, keyboard shortcuts and clear dirty/saved state.
4. Build invokes the real AEKO SBF toolchain through the isolated runner.
5. Compile errors are shown in Problems/output and do not destroy project state.
6. Test invokes real bounded test execution and reports pass/fail output.
7. Wallet/network/balance use existing AEKO runtime configuration and real RPC/funding paths.
8. A successful build can be deployed to AEKO Testnet/localnet with browser-local signing.
9. A deployed upgradeable program can be upgraded by its current browser wallet authority.
10. Program ids/signatures link to the existing Explorer.
11. Mainnet deployment is disabled/fail-closed for this first production release.
12. Private keys never leave the browser or enter API/runner logs.
13. Compiler execution is isolated and bounded as described above.
14. Mobile/narrow layouts remain operable without page-level horizontal overflow.
15. Core workflows are keyboard accessible and expose visible focus.
16. relevant frontend/Rust checks pass in executable CI or a local environment.
17. Independent review has no blocking findings.
18. Dogfood proves the real write → build → test → fund → deploy → verify → edit → upgrade path.
19. Git/Release verifies final branch, commits, PR diff and remote state.

## 13. Known implementation risks

- arbitrary Rust compilation is an RCE/DoS boundary and cannot run inside the Explorer API process;
- SBF compilation can be CPU/memory intensive;
- deployment can involve many chunked transactions and partial failure;
- browser-local development wallets are appropriate only for development funds;
- loader transaction compatibility must follow AEKO's current fork, not upstream assumptions;
- stale compiled artifacts must be invalidated whenever source changes;
- private build logs can accidentally contain submitted source if diagnostics are logged server-side;
- IndexedDB/local storage can be cleared by the browser, so export remains important;
- remote CI must cover the new app/service because this ChatGPT environment currently lacks a network-capable local checkout.

## 14. Non-goals for the first production release

- production/Mainnet deployment;
- custody of user private keys on AEKO servers;
- arbitrary third-party Cargo dependencies or build scripts;
- long-term cloud project storage/accounts;
- collaborative multi-user editing;
- pretending unsupported Anchor/Solana-specific APIs are native AEKO features.

These can be added only after their security and product contracts are explicit.
