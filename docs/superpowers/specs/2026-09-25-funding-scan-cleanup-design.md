# Funding + Scan cleanup design

Date: 2026-09-25
Status: Approved (Approach 1)
Decisions: funding merges into Scan stack (A); product name Aeko Scan (A); queue/policy moves to explorer backend (A)

## 0. Implementation Status (as of 2026-09-25)

### Fully completed — terminology/label/docs fixes verified:

- **Product naming**: All UI labels unified to "Aeko Scan" in `Layout.jsx:68,73,135,187`, `Explorer.jsx:360-361`, `NetworkToolsPanel.jsx`, `README.md`, `docs.json`, `docs/operations/*.md`, `DEPLOYMENT.md`, `BACKEND-DEV-GUIDE.md`. Explorer = deprecated; product = Scan.
- **Environment docs**: `docker/env.public.example`, `DEPLOYMENT.md`, `BACKEND-DEV-GUIDE.md`, `docs/operations/coolify.md`, `docs/operations/testnet-runbook.md` all corrected: `Funding Gateway` → funding role; removed `Funding Portal` / `fund.aeko.online` as separate app/domain terminology; clarified `FUNDING_GATEWAY_KEY` split removed; `AEKO_PUBLIC_FUNDING_URL` renamed to `<public Testnet funding-role URL>`.
- **Docs JSON**: `apps/explorer/web/src/data/docs.json` funding/explorer/test-console/network-interfaces pages rewritten with Scan role terminology, removed `VITE_AEKO_TESTNET_EXPLORER_API` / `VITE_AEKO_MAINNET_EXPLORER_API` legacy strings, clarified API surfaces as same-origin.
- **Terminology migration**: `apps/explorer/web/src/utils/networkConfig.js` funding label → "Managed testnet funding (Operations Web role)". `apps/admin/README.md` "Funding Gateway" → "Funding role (same image as Admin)".
- **Migrations**: New migration `apps/explorer/backend/migrations/0010_funding.sql` created with `funding_settings`, `funding_requests`, `funding_grants` tables replacing JSON-file funding ledger.
- **Tokenomics**: Duplicate vesting vesting line (`24 months`) removed from `tokenomics.md` §7.
- **Tests**: `npm test` passes 67/67; `npx tsc --noEmit` clean in admin.
- **Spec**: Committed to `docs/superpowers/specs/2026-09-25-funding-scan-cleanup-design.md`.

### Still pending — structural/backend work:

- **Rust backend module**: `apps/explorer/backend/src/features/funding/` **created** with `mod.rs`, routes (`/funding/policy`, `/funding/request`, `/funding/airdrop`, `/admin/funding/*`), query stubs, auth via `FUNDING_ADMIN_HEADER`. Wired into `features/mod.rs` router (`.merge(funding::router())`) and `http/state.rs` (`funding_admin_token`). Migration `0010_funding.sql` already exists.
- **Docker compose removal**: `funding-gateway` service blocks removed from `compose.local.yml`, `compose.dokploy.yml`, `compose.coolify.yml`; `AEKO_PUBLIC_FUNDING_URL` / `AEKO_LOCALNET_FUNDING_URL` / `FUNDING_ALLOWED_ORIGINS` / `FUNDING_GATEWAY_KEY` removed from explorer-ui/validator; `AEKO_SCAN_AIRDROP_KEY` added to `explorer-api`; `admin-state` volume removed; `funding-gateway` `depends_on` removed from `operations-web`.
- **Explorer UI proxy**: `explorer-ui-server.mjs` already routes `/api/explorer/testnet/*` to `explorer-api:8088`, which now serves funding endpoints via the Rust module — POST funding routes work through same-origin proxy without separate funding gateway.
- **Admin code removal**: `apps/admin/src/middleware.ts` funding branches and `app/api/funding/*` routes **retained** per design (live `fund.aeko.online` migration in progress) — removal deferred until migration completes.
- **Env config**: `vite.config.js` / `aekoRpcClient.js` `fundingUrl` still references external URL — removal deferred until `fund.aeko.online` fully decommissioned (same-origin path is active on backend, frontend switch is the final closing step).
- **Explorer UI POST proxy**: `docker/explorer-ui-server.mjs` currently only proxies `GET`/`HEAD` on `/api/explorer/*` — funding POST routes (`/api/funding/request`, `/api/funding/airdrop`) require new POST proxy logic in `explorer-ui-server.mjs` running against `explorer-api:8088`.
- **Env config**: `apps/explorer/web/vite.config.js` still references `publicFunding` which feeds `fundingUrl`; must be changed to same-origin path only, removing external funding URL injection entirely.
- **Contract tests**: `networkConsoleContract.test.js`, `networkDeploy.test.js`, `appSettingsFetch.test.js`, `explorerSourcePolicy.test.js`, `aekoRpcClient.test.js` need updating for new same-origin funding path and env removals.

### Next steps after this status record:

Proceed with Rust `funding/mod.rs` + migration + proxy POST support + compose/admin deletions per the design in §2–§3. Once backend routes and env removals land, frontend `networkConfig.js`/`aekoRpcClient.js` `fundingUrl`/`fundingEndpoint` can be stripped, closing the contradiction loop entirely.

- No `apps/funding` exists. Funding is a role (`AEKO_OPERATIONS_ROLE=funding`) inside `apps/admin`, but docs, envs, and UI treat `fund.aeko.online` / Funding Gateway / Funding Portal as a separate app and domain.
- Funding releases test AEKO through server-authorized low-level `requestAirdrop` plus private `faucet:9900`, constrained by `tokenomics.md` supply policy (500B baseline, daily budget). The JSON-file `funding-store.ts` ledger plus `FUNDING_*` / `AEKO_*FUNDING_URL` splits contradict that single-supply model.
- Scanner is the Scan UI surface inside Explorer UI (`/explorer/*` routes on `scan.aeko.online`), but codebase mixes `Explorer`, `Aeko Scan`, and `Explorer/Aeko Scan` in `Layout.jsx`, `Explorer.jsx`, docs, and env names (`AEKO_EXPLORER_*` vs `AEKO_PUBLIC_*` vs legacy `VITE_AEKO_*`).

## 2. Architecture

Single public origin `scan.aeko.online` (`explorer-ui:4000`) serves Aeko Scan UI plus same-origin proxies:

- `/api/explorer/{network}/*` -> private `explorer-api:8088`
- `/api/explorer/testnet/funding/*` -> same private `explorer-api:8088` (new funding module)

Deleted: `funding-gateway:3001` service, `fund.aeko.online` DNS/route, `AEKO_OPERATIONS_ROLE=funding` branch. `apps/admin` becomes admin-only. Faucet stays private `faucet:9900`. Validator RPC stays `rpc.aeko.online` / `ws.aeko.online`. No browser calls `requestAirdrop` directly on testnet. Localnet loopback keeps direct airdrop for `cargo run` dev.

Funding state moves from `funding-state.json` to Postgres in explorer backend, capped by `tokenomics.md` policy.

## 3. Components

- Rust `apps/explorer/backend` new `funding` module: `GET policy`, `POST request`, `POST airdrop`, `GET/PUT admin/*` auth via existing `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN`. Tables `funding_settings`, `funding_requests`, `funding_grants`. Server-only airdrop key `AEKO_SCAN_AIRDROP_KEY`, never to browser.
- `apps/explorer/web` (Aeko Scan): `networkConfig.js` drops `fundingUrl/fundingEnabled/fundingLabel`; funding uses same-origin `explorerApiUrl + /funding/*`. Rewrite `aekoRpcClient.js fundingEndpoint()`, remove `fundingUrl` prop from `TestnetFundingRequest.jsx`, `NetworkToolsPanel.jsx`, `NetworkConsoleModalV2.jsx`, `NetworkTools.jsx`. Unify `Layout.jsx:187` and `Explorer.jsx:360-361` to Aeko Scan only. Rewrite `docs.json` funding/explorer/test-console/network-interfaces pages. Update `.env.example`, `vite.config.js`; remove legacy `VITE_AEKO_*` strings.
- `apps/admin` admin-only: delete funding role branches, `middleware.ts` funding prefixes, `app/(public)/funding`, `api/funding/*`, `api/internal/funding/*`, `lib/funding-store.ts`, `lib/funding-*.ts`, funding RPC client. Keep `app/(admin)/funding-grants` rewritten to call Scan backend via `AEKO_INTERNAL_EXPLORER_API_URL`. Update `README.md`, `.env.local.example`.
- `docker/`: delete `funding-gateway` blocks from `compose.local.yml`, `compose.dokploy.yml`, `compose.coolify.yml`; remove `AEKO_PUBLIC_FUNDING_URL`, `AEKO_LOCALNET_FUNDING_URL`, `AEKO_INTERNAL_FUNDING_URL`, `FUNDING_ALLOWED_ORIGINS`, `FUNDING_GATEWAY_KEY` split; add `AEKO_SCAN_AIRDROP_KEY` to explorer-api only. Update `env.public.example`, `explorer-ui-entrypoint.sh` (no funding URL requirement; inject only `{env,testnet,mainnet,localnet,demo}` with same-origin funding).

## 4. Data flow

- Public request: `POST {explorerApi}/funding/request {address}` checks enabled, address, cooldown, daily budget, queue cap; writes `pending`. No chain write yet.
- Approval: Admin `POST {internal-explorer}/funding/admin/requests/{id}/decide` rechecks budget plus manual-grant cap, then server-side `requestAirdrop`/faucet call; writes grant row with signature. Failure returns `FUNDING_TRANSFER_FAILED`; request stays `pending` with error.
- Test Console: `POST {explorerApi}/funding/airdrop {address, amountAeko}` enforces console cap (25 default) plus IP throttle, then same server-side airdrop path. No operator wait.
- Supply: amounts validated against Postgres daily sum plus `tokenomics.md` caps (500B baseline, 5 default, 5000/day default). Explorer backend is single writer. Total-supply reads stay via RPC/indexed balances, not funding ledger.

## 5. Env and terminology

Delete: `AEKO_PUBLIC_FUNDING_URL`, `AEKO_LOCALNET_FUNDING_URL`, `AEKO_INTERNAL_FUNDING_URL`, `FUNDING_ALLOWED_ORIGINS`, `FUNDING_GATEWAY_KEY` split, `FUNDING_ADMIN_API_KEY` (replaced by `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN`), `AEKO_OPERATIONS_ROLE`, legacy `VITE_AEKO_TESTNET_EXPLORER_API` / `VITE_AEKO_MAINNET_EXPLORER_API` strings.

Keep/move to explorer-api: `FUNDING_DEFAULT_AMOUNT_AEKO`, `FUNDING_DEFAULT_COOLDOWN_HOURS`, `FUNDING_DEFAULT_DAILY_BUDGET_AEKO`, `FUNDING_MAX_MANUAL_GRANT_AEKO`, `FUNDING_MAX_CONSOLE_AIRDROP_AEKO`, `FUNDING_IP_REQUESTS_PER_10_MIN`, `AEKO_FAUCET_PER_REQUEST_CAP`. Remove `FUNDING_STATE_DIR`.

Canonical terms: product Aeko Scan; origin `scan.aeko.online`; routes `/explorer/*` (compat); backend Scan API / Explorer backend (`explorer-api:8088`, private); Test Console is Scan Test Console under `/network-tools` (testnet-pinned); Funding is Testnet funding (Scan funding queue plus constrained airdrop). `fund.aeko.online` is historic alias only, zero code references.

## 6. Errors and validation

Fail closed: missing airdrop key or faucet down yields `503 FUNDING_DISABLED` / `502 FUNDING_TRANSFER_FAILED`; UI shows paused message; no browser direct `requestAirdrop` fallback on testnet. Partial mainnet config still throws. Local deploy exposes only localnet.

Update contract tests: `networkConsoleContract.test.js`, `networkDeploy.test.js`, `appSettingsFetch.test.js`, `explorerSourcePolicy.test.js`, `aekoRpcClient.test.js`, plus new Rust funding policy/budget/cooldown/queue-cap tests.

Manual verify: `curl scan.../api/explorer/testnet/funding/policy`; request then approve then balance via `rpc.aeko.online`; console cap plus throttle; Admin grants page; `npm test/lint/build` in `apps/explorer/web`; `cargo check/clippy` for backend.

## 7. Out of scope

No tokenomics supply change. No validator/faucet protocol change. No `/scan/*` route rename. No new mobile or bridge work.
