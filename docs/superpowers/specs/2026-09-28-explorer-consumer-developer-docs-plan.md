# Explorer consumer developer documentation implementation plan

Date: 2026-09-28
PR: #85
Status: PLANNED after this document is committed
Depends on: `2026-09-28-explorer-consumer-developer-docs-brainstorm.md`

## 1. Requested outcome

Turn Explorer `/docs` into a complete consumer-developer portal covering the real public AEKO CLI, SDKs, APIs, smart-contract workflow, wallet/permission flows, asset tooling, SocialFi integration, bridge/security/protocol guidance, examples and troubleshooting.

The selected network surface must expose copyable endpoints rather than read-only text.

## 2. Verified current behavior

- `apps/explorer/web/src/pages/Docs.jsx` reads the monolithic `src/data/docs.json`.
- The page uses a sidebar and renders raw HTML through `dangerouslySetInnerHTML`.
- Its footer has placeholder previous-navigation logic.
- `NetworkToolsPanel.jsx` already renders RPC, WebSocket and Explorer API values and uses `CopyButton.jsx`.
- A modular `src/data/docs/index.js` was added, but `Docs.jsx` does not import it.
- The modular index references eight JSON modules that do not exist in `src/data/docs/`.
- The repository contains substantially richer CLI/SDK/example/public-feature documentation than the Explorer docs expose.

## 3. Root implementation gap

There are two coupled gaps:

1. **Content model gap**: public documentation is stored as large HTML strings with no consistent metadata for status, quick starts, commands, SDK paths, related pages or source evidence.
2. **Product UX gap**: the renderer has no reusable documentation primitives for copyable code, status/context callouts, on-page navigation or content-aware previous/next traversal.

Adding more HTML to `docs.json` alone would make the file larger without fixing either problem.

## 4. Affected production surface

Primary:
- `apps/explorer/web/src/pages/Docs.jsx`
- `apps/explorer/web/src/components/CopyButton.jsx`
- `apps/explorer/web/src/components/NetworkToolsPanel.jsx`
- `apps/explorer/web/src/data/docs/*`

Likely new reusable docs components:
- docs page shell/navigation
- code/command block with copy
- status/callout treatment
- related-page navigation
- optional network-aware value interpolation or helpers

Evidence/reference sources, not blindly copied:
- `apps/cli/src/*`
- `apps/sdk/*`
- `docs/developer-sdk/*`
- `docs/rpc-and-apis/*`
- `docs/wallet/*`
- `docs/permission-layer/*`
- `docs/token-standards/*`
- `docs/socialfi/*`
- `docs/aeko-social-integration/*`
- `docs/bridge/*`
- `docs/security/*`
- `docs/aeko-chain/*`
- `contracts/hello-aeko-program/*`

## 5. Work graph and ownership

`Lead`
→ `Repository Investigator` — prove public capabilities and source paths
→ `UI/UX Product Engineer` — information architecture + interaction contract
→ `API & Contract Engineer` — verify public endpoint/SDK/CLI claims
→ `Frontend Engineer` — production implementation
→ `Test Engineer` — independent behavior/regression validation
→ `Independent Code Reviewer`
→ `Integration & Dogfood Engineer`
→ `Git & Release Engineer`

Failures route back to the owner of the defect.

## 6. Implementation sequence

### Phase A — capability inventory

Build an evidence matrix for each public topic:

| Capability | Public status | CLI | JS | Node | Python | Rust | RPC/API | Example | Source |
|---|---|---|---|---|---|---|---|---|---|

Rules:
- populate only verified integrations;
- record testnet/local/operator-only limitations;
- flag conflicting or stale docs before writing public copy.

### Phase B — documentation data model

Replace the incomplete modular stub with a coherent source of truth.

Required metadata per page:
- stable id/slug;
- title;
- section;
- summary;
- status;
- content blocks;
- related-page ids;
- no source-reference metadata is rendered in the public page model.

Avoid embedding application behavior in arbitrary HTML strings when a reusable renderable block can express it.

### Phase C — reusable documentation UI

Implement reusable primitives for:
- copyable endpoint/command/code values;
- callouts/status;
- headings/anchors;
- code examples;
- network-aware examples where required;
- related pages;
- previous/next navigation.

Preserve existing `CopyButton` behavior unless evidence requires a change.

### Phase D — page-shell revamp

Update `Docs.jsx` to use the new docs source and primitives.

Required states:
- desktop sidebar;
- mobile navigation;
- active-page state;
- selected-network context;
- missing-content fail-safe without fake “coming soon” pages;
- previous/next navigation;
- accessible controls/focus;
- long-code overflow handling.

### Phase E — content migration and expansion

Migrate content by developer journey, not by repository directory.

Priority order:

1. Start Here + Network
2. CLI
3. SDKs
4. RPC/WebSocket/Explorer API
5. Smart contracts
6. Wallet + permissions
7. Tokens/NFTs
8. SocialFi
9. Bridge
10. Security
11. Protocol concepts
12. Troubleshooting + recipes

Each page receives only the tool paths supported by the capability matrix.

### Phase F — content-quality pass

Remove or rewrite:
- AEKO core-maintainer terminology from public explanations;
- deployment/operator procedures that do not belong to consumers;
- unverified performance claims;
- generic “feature dump” prose;
- examples that use unsupported network monikers or stale package paths;
- claims that a design document equals a deployed feature.

Add:
- prerequisites;
- expected results;
- verification steps;
- failure modes;
- cross-links;
- security notes.

## 7. Validation sequence

### Static/source validation
- all documented internal page ids resolve;
- no orphan sidebar item;
- no imported docs data file is missing;
- public documentation data contains no internal file paths, filenames or source-reference metadata;
- no duplicate page id;
- no empty “coming soon” placeholder remains for an advertised section.

### Frontend validation
When executable checkout/CI is available:
- `npm test`
- `npm run lint`
- `npm run build`
from `apps/explorer/web`.

### Interaction validation
Verify at minimum:
- copy RPC endpoint;
- copy WebSocket endpoint;
- copy Explorer API endpoint;
- copy an install command;
- copy a code example;
- switch network and confirm endpoint context updates;
- open/close mobile docs navigation;
- navigate multiple sidebar sections;
- previous/next navigation;
- keyboard focus on all interactive controls;
- long code blocks at narrow viewport.

### Content dogfood
Run task-based walkthroughs:
1. install CLI → configure Testnet → create wallet → obtain test funds → check balance;
2. install one SDK → connect → perform a verified read;
3. build → deploy → invoke hello program;
4. identify correct read/write paths for SocialFi;
5. locate permission/wallet guidance without seeing operator-only internals;
6. understand bridge availability without being promised unsupported behavior.

## 8. Regression risks

- stale public commands copied from older docs;
- importing a new data model without updating all navigation consumers;
- `dangerouslySetInnerHTML` regressions or unsafe content assumptions;
- network-specific values frozen into static examples;
- exposing operator/private URLs or secrets;
- presenting repository-only capabilities as public;
- mobile sidebar focus/scroll regressions;
- adding copy buttons that silently fail without feedback;
- overwhelming pages with every SDK even when a capability is not supported there.

## 9. Acceptance criteria

The change is not complete until all applicable criteria hold:

1. `/docs` uses one coherent documentation source of truth.
2. No modular docs import points at a missing file.
3. RPC, WebSocket and Explorer API endpoint values are directly copyable.
4. Install commands and substantive code examples are copyable.
5. Public prose is written for consumer developers, not AEKO core maintainers, and exposes no internal file references.
6. CLI documentation reflects the actual command families exposed by `apps/cli`.
7. JS, Node, Python and Rust pages reflect their actual package surfaces and examples.
8. Smart-contract docs include write → build → deploy → invoke → verify.
9. Wallet/permission docs include actionable integration guidance where a public builder/API exists.
10. Token/NFT docs connect concepts to mint/read/write examples that the repository actually supports.
11. SocialFi docs explain real read/write/integration paths and supported program capabilities.
12. Bridge, governance or identity concepts that lack a verified public workflow are explicitly status-scoped.
13. Every advertised page has meaningful content; no generic placeholder survives.
14. Important pages include prerequisites, expected result, errors/recovery and related links.
15. Navigation works on desktop and mobile.
16. Previous/next navigation works.
17. Relevant Explorer frontend tests/lint/build pass in an executable environment or CI.
18. Independent reviewer has no blocking finding.
19. Dogfood walkthroughs demonstrate the primary consumer journeys.
20. Git/Release verifies the final PR diff and remote commit before the work is reported complete.
21. Public `/docs` interprets verified behavior into developer guidance and never exposes internal repository paths, filenames, markdown files, or authoring evidence.

## 10. Current validation limitation

This ChatGPT runtime can mutate and inspect the live GitHub repository through the connected GitHub integration, but it does not currently have a network-capable local checkout of `MilliHub-dev/aeko-chain`. Local Vite execution therefore cannot be claimed from this runtime.

Remote PR CI and any available GitHub workflow results will be used as executable evidence after implementation commits. If CI does not exercise the Explorer frontend sufficiently, that remaining gap must be reported rather than hidden.

## 11. Commit policy

Do not commit a partially wired renderer or documentation source as completed work.

Planning/spec commits may land independently. Production implementation should be committed only after the changed surface is internally coherent and ready for validation.
