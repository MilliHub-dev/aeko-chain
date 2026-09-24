# AEKO deployment topology

This document is the operator contract for building and deploying the AEKO public network. For the developer-facing mental model and SocialFi acceptance flow, start with [`README.md`](./README.md).

## Three Compose contracts

AEKO keeps three Compose contracts so local convenience and each public deployment platform can use storage/routing syntax that fits its runtime without duplicating application images.

| File | Purpose |
| --- | --- |
| `docker/compose.local.yml` | portable local/testnet stack; validator RPC/WS are host-published and `rpc-node` is optional |
| `docker/compose.dokploy.yml` | public/Dokploy stack; uses prebuilt Docker Hub images and serves RPC/WS from the healthy voting validator |
| `docker/compose.coolify.yml` | public/Coolify stack; same public topology with Coolify-safe storage parsing |

`docker/Dockerfile` remains the single canonical image build definition. The deployment platforms consume published targets from that file rather than maintaining platform-specific Dockerfiles.

The non-voting `rpc-node` remains an opt-in portable/local profile. It is not a mandatory Dokploy dependency for the current single-validator public testnet because the block-producing validator already runs the full RPC, transaction-history and PubSub surface required by wallets, bootstrap and Explorer.

## Image pipeline

GitHub Actions builds these canonical Docker targets:

```text
validator        -> aeko-validator
faucet           -> aeko-faucet
social-bootstrap -> aeko-social-bootstrap
protocol-bootstrap -> aeko-protocol-bootstrap
tools            -> aeko-tools
explorer-api     -> aeko-explorer-api
explorer-ui      -> aeko-explorer-ui
operations-web   -> aeko-operations-web
```

On `main`, CI publishes both `latest` and a 12-character commit-SHA tag. Both public Compose contracts contain only `image:` references plus `pull_policy: always`; neither compiles the Rust/React repository on the deployment host. Prefer the immutable SHA tag for a controlled public release and rollback.

Compatibility aliases `aeko-node` and `aeko-explorer-backend` remain temporary publication names; new deployments use the canonical names above.

## Public topology

```text
Internet wallets / dApps / SDKs
       |                    |
     HTTPS                 WSS
       |                    |
 rpc.aeko.online       ws.aeko.online
       |                    |
       +------ validator (:8899/:8900) ------+
                         |                    |
                  ledger / consensus    Explorer API :8088
                         |                    |
                  native SocialFi       PostgreSQL + registry

scan.aeko.online -> explorer-ui :4000 -> explorer-api :8088
fund.aeko.online -> operations-web :3001 (Testnet Funding Portal)      -> validator RPC
admin.aeko.online -> operations-web :3001 (operator console, sign-in) -> validator RPC / explorer-api

gossip.aeko.online:8001 -> validator gossip entrypoint
validator host TCP+UDP 8000-8050 -> public validator transport range
faucet :9900 -> internal only
```

The Dokploy public testnet routes RPC/PubSub directly to the healthy block-producing validator. The separate non-voting replica added another genesis/snapshot/gossip bootstrap lifecycle without adding required functionality to the single-validator deployment, and a failed replica could block Explorer even while the validator remained healthy. The validator advertises `AEKO_PUBLIC_IP` with `--gossip-host` and uses `8000-8050` as its public dynamic transport range.

A wallet is not a network daemon. Use `aeko-tools`, SDKs or wallet adapters to sign client transactions. WebSocket is RPC PubSub on port `8900`, not a separate service image.

## Persistent state

Never treat a normal redeploy as a fresh chain.

Persist:

- `validator-ledger` named volume;
- `social-state` named volume;
- `protocol-state` named volume;
- `protocol-continuity` named volume;
- `admin-state` named volume (funding policy and grant ledger);
- validator identity key;
- vote-account key;
- stake key;
- faucet key;
- protocol authority key, once the protocol has been initialized.

The `social-state` volume contains the five SocialFi state keypairs plus `social-registry.env`. The `protocol-state` volume contains the published `protocol-registry.env`. The separate `protocol-continuity` volume contains the canonical protocol state/custody keypairs plus the registry continuity anchor. Preserve both protocol volumes together.

The optional portable/local RPC replica keeps its own identity and ledger when that profile is explicitly enabled; those are not requirements of the default public topology.

## Configuration ownership and source of truth

Do not copy the same value into multiple configuration surfaces merely because similarly named variables exist.

| Configuration | Canonical source | Normal operator action |
| --- | --- | --- |
| Validator/vote/stake/faucet identities | persistent key files | Preserve the existing files; generate only during an intentional first chain boot. |
| Social state and vault addresses | generated `social-state/social-registry.env` | Leave Explorer per-address overrides unset. |
| Protocol feature identities | compile-time feature IDs | Fresh/reset genesis activates the mandatory protocol runtime features automatically; only a legacy preserved chain uses the compatibility activation helper. |
| Protocol authority and canonical state addresses | persistent protocol authority plus generated `protocol-registry.env` / continuity anchor | Bootstrap automatically when no established protocol identity exists; preserve and verify thereafter. |
| Explorer application/readiness settings | Explorer PostgreSQL `/settings` record | Edit through Operations Web; Explorer UI reads the same public API resource. |
| Public browser endpoints | deployment environment (`AEKO_PUBLIC_*`) | Configure once per deployment environment. |
| Internal container endpoints | Compose service DNS defaults | Normally leave the `AEKO_INTERNAL_*` overrides unset. |
| Recovery address overrides | Explorer process environment | Use only for explicit recovery; never as a parallel normal source of truth. |

Similar names are not automatically duplicates. For example, `AEKO_EXPLORER_URL` is the Operations Web server-to-server Explorer endpoint, while `AEKO_PUBLIC_EXPLORER_API_URL` is the browser-facing Explorer API endpoint. They may resolve to the same service through different network paths and must not be substituted blindly.

## Required production environment

```text
AEKO_PUBLIC_IP=<deployment host public IP>
AEKO_KEYS_DIR=<Dokploy/local persistent host directory; Coolify uses fixed /data/aeko/keys>
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended 12-character published main commit SHA>
AEKO_REQUIRE_EXISTING_LEDGER=1
AEKO_ALLOW_CHAIN_KEY_GENERATION=0   # Coolify; enable only for intentional first boot
AEKO_PUBLIC_RPC_URL=<public JSON-RPC URL>
AEKO_PUBLIC_WS_URL=<public PubSub WebSocket URL>
AEKO_PUBLIC_EXPLORER_API_URL=<public Explorer REST API URL>
AEKO_PUBLIC_EXPLORER_URL=<public Explorer UI URL>
AEKO_PUBLIC_FUNDING_URL=<public Testnet Funding Portal URL>
AEKO_PUBLIC_ADMIN_URL=<public operator-console URL>
FUNDING_ALLOWED_ORIGINS=<comma-separated browser origins allowed to call funding>
ADMIN_PASSWORD=<operator password>
ADMIN_SESSION_SECRET=<16+ random characters>
FUNDING_GATEWAY_KEY=<server secret shared with validator requestAirdrop authorization>
FUNDING_CLIENT_API_KEY=<optional trusted backend secret sent as x-funding-key>
```

Optional funding policy (initial values; editable in the admin console afterwards):

```text
AEKO_FAUCET_PER_REQUEST_CAP=100        # hard ceiling enforced by the faucet binary, in AEKO
FUNDING_DEFAULT_AMOUNT_AEKO=5
FUNDING_DEFAULT_COOLDOWN_HOURS=24
FUNDING_DEFAULT_DAILY_BUDGET_AEKO=5000
FUNDING_MAX_MANUAL_GRANT_AEKO=100
```

Optional SocialFi bootstrap configuration:

```text
AEKO_REWARDS_TREASURY_SEED_LAMPORTS=0
AEKO_REWARD_VAULT_SEED_LAMPORTS=0
AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS=0
AEKO_PLATFORM_FEE_BPS=200
```

Normal public deployments do not configure Social state or vault addresses by hand. `social-bootstrap` creates the canonical accounts and publishes them in `social-registry.env`; the Explorer's per-address environment variables are recovery overrides and should normally remain unset.

`AEKO_PUBLIC_IP` must be the address external validators can reach. Allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. `EXPLORER_DATABASE_URL` is intentionally required by both public Compose contracts. In-memory indexing is useful for disposable local runs but is not a public-network storage contract.

## Required key files

The established chain identity uses the same four files on every platform. Dokploy/local select the directory with `AEKO_KEYS_DIR`; Coolify binds the fixed host path `/data/aeko/keys`:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

`protocol-authority-keypair.json` is intentionally separate from the four chain identities. AEKO Protocol is mandatory: key preflight creates the protocol authority automatically when no established protocol registry or continuity identity exists. Once established, a missing or mismatched authority is fatal and is never silently replaced.

Generate missing first-boot chain keys with `aeko-tools`, or on Coolify temporarily enable the explicit first-boot generation flag. Do not use the validator image just to create a wallet/keypair.

```bash
docker run --rm \
  -v "$PWD/local-testnet:/keys" \
  surdma/aeko-tools:latest \
  aeko-keygen new --no-bip39-passphrase --silent \
  --outfile /keys/validator-1-keypair.json
```

Keep key files in persistent restricted storage. Do not rely on keys living inside an AutoDeploy Git checkout and never commit them.

On Coolify, `AEKO_KEYS_DIR` is not a dashboard variable. The literal `/data/aeko/keys` mount is intentional because this deployment environment rejects interpolated volume sources. `key-bootstrap` preserves existing non-empty keys, generates only missing ones, validates each resulting keypair, and exits successfully before faucet startup.

## SocialFi bootstrap lifecycle

`social-bootstrap` is part of the default network, but it is a one-shot initializer rather than a long-running daemon.

`key-preflight` and `social-bootstrap` both use `restart: "no"` in the public Compose contracts. Successful completion is `Exited (0)`. A SocialFi bootstrap non-zero exit is deliberately left terminal so the exact error stays visible; the bootstrap binary already performs bounded RPC readiness and transaction retries internally.

The public startup graph is intentionally failure-isolated:

```text
key-bootstrap creates/validates persistent keys and exits 0
  -> faucet
  -> validator healthy
       |-> social-bootstrap (one shot: exit 0 or visible terminal failure)
       |-> explorer-api healthy
              -> explorer-ui healthy
```

Explorer API/UI remain available in a degraded state when SocialFi bootstrap fails. The Explorer loads `/state/social-registry.env` dynamically and `/social/status` reports `complete: false` plus per-domain errors until the registry and all five on-chain states are valid. This keeps the operational UI/API observable without pretending SocialFi initialization succeeded.

Bootstrap remains safe for a normal redeploy because it does not send another Initialize instruction when the persisted key resolves to an initialized account owned by the expected SocialFi program. Wrong-owner, malformed or unexpectedly missing state on an established chain fails closed.

The bootstrap writes the registry atomically to:

```text
/state/social-registry.env
```

Explorer mounts the same volume read-only and consumes:

```text
AEKO_SOCIAL_REGISTRY_FILE=/state/social-registry.env
```

No manual renaming from `SOCIAL_*_STATE_ACCOUNT` to `AEKO_SOCIAL_*` is required.

A running/healthy Explorer does **not** certify SocialFi. SocialFi acceptance remains separate and requires `/registry/social` and `/social/status` to be complete plus the SocialFi smoke test to pass.

### Intentional chain reset

A deliberate ledger reset creates a new blockchain identity. Set only:

```text
AEKO_RESET_LEDGER=1
```

The reset signal is propagated to the validator, SocialFi bootstrap, Protocol bootstrap, and Explorer. For the replacement genesis, SocialFi state is cleared once and recreated, Protocol state and continuity are cleared once and recreated, and Explorer purges the stale PostgreSQL projection schema before binding to the new genesis. No SocialFi or Protocol missing-state recovery flag is required for this intentional reset path.

After the replacement chain is accepted, return `AEKO_RESET_LEDGER=0`. Missing-state recovery overrides remain incident-recovery controls for damaged established deployments and are not part of normal Compose configuration.

## Portable/local deployment

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose -f docker/compose.local.yml up -d
```

The default portable stack starts faucet, validator, automatic SocialFi bootstrap, Explorer API and Explorer UI. Add the local non-voting RPC replica with:

```bash
docker compose -f docker/compose.local.yml --profile rpc up -d rpc-node
```

For a deliberate local reset use the repository helper:

```bash
./scripts/deploy-testnet.sh --reset-chain
```

## Dokploy setup

Create a **Docker Compose** resource pointed at this repository/branch and set:

```text
Compose Path: ./docker/compose.dokploy.yml
```

The file intentionally has no `build:` directives. Every runtime is pulled from Docker Hub with `pull_policy: always`.

Dokploy's native Domains feature is preferred. Route:

| Domain | Service | Container port |
| --- | --- | ---: |
| `rpc.aeko.online` | `validator` | `8899` |
| `ws.aeko.online` | `validator` | `8900` |
| `api.aeko.online` | `explorer-api` | `8088` |
| `scan.aeko.online` | `explorer-ui` | `4000` |
| `fund.aeko.online` | `operations-web` | `3001` |
| `admin.aeko.online` | `operations-web` | `3001` |

Do not route `gossip.aeko.online` through Traefik. DNS should point it directly at `AEKO_PUBLIC_IP`. Gossip starts on `8001`, and the Compose publishes the full validator TCP+UDP `8000-8050` transport range with same-port host mappings so advertised peer addresses stay reachable.

The services share the private `aeko` Docker network. Internal RPC, Explorer and Faucet traffic uses Docker service DNS and container ports; public URLs are only ingress/client configuration. The optional `wallet-tools` service is an `ops` profile for CLI/key generation and is not a public daemon. If Dokploy Isolated Deployments is enabled, Dokploy can add its routing network to domain-selected services while the private AEKO network remains intact.


## Coolify setup

Create a Git-based **Docker Compose** application pointed at this repository/branch and set:

```text
Compose Path: ./docker/compose.coolify.yml
```

The Coolify contract uses the same published AEKO images and public service topology as Dokploy. The difference is storage syntax: key directories use long-form bind mounts with the literal host source `/data/aeko/keys`, and the validator ledger defaults to the Docker-managed `validator-ledger` volume. The Coolify deployment contract intentionally contains no `${...}` interpolation in volume sources.

Set these Coolify variables without surrounding shell quotes:

```text
AEKO_PUBLIC_IP=<Coolify host public IP>
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended 12-character published main commit SHA>
```

Create `/data/aeko/keys` on the deployment host before the first deploy and preserve the validator, vote, stake and faucet keypairs there. The protocol authority is generated automatically only while no established protocol registry or continuity anchor exists. On an established chain, missing chain keys or a missing established protocol authority are fatal instead of being silently replaced. Coolify's Compose definition remains the source of truth for the `validator-ledger` and `social-state` named volumes. The full variable set is in `docker/env.public.example`.

Configure domains to the same internal services:

| Domain | Service | Container port |
| --- | --- | ---: |
| `rpc.aeko.online` | `validator` | `8899` |
| `ws.aeko.online` | `validator` | `8900` |
| `api.aeko.online` | `explorer-api` | `8088` |
| `scan.aeko.online` | `explorer-ui` | `4000` |
| `fund.aeko.online` | `operations-web` | `3001` |
| `admin.aeko.online` | `operations-web` | `3001` |

Keep `gossip.aeko.online` outside the HTTP proxy. Point its DNS directly to `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050`.

### Established-chain storage identity

For every normal public redeploy keep:

```text
AEKO_RESET_LEDGER=0
AEKO_REQUIRE_EXISTING_LEDGER=1
AEKO_ALLOW_CHAIN_KEY_GENERATION=0
```

The validator now refuses to create a replacement genesis when an established deployment unexpectedly sees an empty/wrong ledger mount. Coolify likewise refuses to manufacture replacement validator/vote/stake/faucet identities on a normal redeploy. This protects against Compose project/resource renames that would otherwise resolve `validator-ledger` to a new empty Docker volume.

For an intentional first genesis only, set `AEKO_REQUIRE_EXISTING_LEDGER=0`; on Coolify, set `AEKO_ALLOW_CHAIN_KEY_GENERATION=1` only if the platform should create the four chain keys. The protocol authority and canonical protocol state initialize automatically when no established protocol identity exists. Return the chain lifecycle values above immediately afterwards.

Before moving a live ledger to attached storage, inspect the current container mount and Docker root. If Docker already stores the named volume on the larger filesystem, no Compose change is required. Otherwise stop the chain, migrate the existing volume/data root, and verify `genesis.bin`, genesis hash, key identities and ledger size before switching storage. Never point the validator at a newly-created empty path as a migration.

## Deploy / update behavior

Manual Dokploy equivalent:

```bash
docker compose -f docker/compose.dokploy.yml pull
docker compose -f docker/compose.dokploy.yml up -d
docker compose -f docker/compose.dokploy.yml ps
```

Manual Coolify equivalent uses the separate Coolify deployment contract:

```bash
docker compose -f docker/compose.coolify.yml pull
docker compose -f docker/compose.coolify.yml up -d
docker compose -f docker/compose.coolify.yml ps
```

The GitHub `AEKO DevOps (single runner)` workflow validates the selected release surfaces, publishes and promotes validated images on `main`, then runs `Trigger production deployment after successful promotion`.

The production deployment trigger is deliberately platform-neutral and uses two GitHub Actions secrets:

```text
WEBHOOK_URL=<authenticated production deploy webhook>
WEBHOOK_API_KEY=<deployment API token>
```

For the current Coolify deployment, `WEBHOOK_URL` is the Coolify authenticated deploy webhook and `WEBHOOK_API_KEY` is the corresponding deploy-capable API token. CI sends the token as `Authorization: Bearer <token>`. Dokploy and Coolify remain separate deployment platforms with separate Compose contracts; this generic CI trigger does not make their configuration interchangeable.

The webhook only triggers the preconfigured production resource. It does not rewrite deployment-platform environment variables. In particular, if `AEKO_IMAGE_TAG` is pinned to an immutable SHA, update that environment value to the newly published 12-character main SHA before/with the deployment. Otherwise the platform can read the newest Compose while still pulling older runtime binaries. Use `latest` only when intentional automatic roll-forward is preferred over immutable releases.

The webhook also does not choose the Compose path. A Coolify resource must point to `docker/compose.coolify.yml`; a Dokploy resource must point to `docker/compose.dokploy.yml`.

## Mandatory Aeko Social and AEKO Protocol lifecycle

Aeko Social and AEKO Protocol are mandatory parts of every default AEKO network deployment. They are not optional profiles and do not have normal enable/disable environment switches.

The deployment lifecycle is:

```text
key preflight
    -> validator healthy
         |-> social-bootstrap
         |     -> initialize on first/new genesis
         |     -> verify/reuse on normal redeploy
         |
         |-> protocol-bootstrap
               -> initialize on first/new genesis
               -> verify/reuse on normal redeploy
```

Both bootstraps are idempotent lifecycle services. A successful one-shot exit does not mean the capability has been disabled; it means canonical on-chain state was initialized or verified. Their persistent registries and state volumes remain the source of truth on subsequent redeploys.

For fresh genesis and reset-to-genesis deployments, the genesis contains the mandatory AEKO token and permission runtime feature accounts from slot 0. Key preflight creates the protocol authority automatically only when no established protocol identity exists. Protocol bootstrap then creates canonical protocol state. Social bootstrap similarly creates the five canonical SocialFi state accounts and registry. No protocol activation toggle, protocol-authority-generation toggle, or protocol-state-initialization toggle is part of normal deployment.

### Normal redeploy

A normal redeploy preserves the validator ledger, chain keys, `social-state`, `protocol-state`, `protocol-continuity`, and Explorer PostgreSQL. Social and Protocol bootstrap run again as verification/idempotency steps. Unexpectedly missing, malformed, wrong-owner, or identity-mismatched established state fails closed rather than silently manufacturing replacement state.

### Intentional reset

`AEKO_RESET_LEDGER=1` is the single explicit destructive new-chain signal. The validator creates a replacement genesis once; SocialFi state, Protocol state/continuity, and Explorer's chain-derived PostgreSQL projections follow that new genesis automatically. Return the reset variable to `0` after accepting the replacement chain.

### Recovery controls

Missing-state and continuity-anchor recovery overrides remain implemented for deliberate incident recovery, but are not normal Compose settings. A surviving Protocol continuity anchor with a missing registry, or an established registry with a missing continuity anchor, remains a fail-closed condition unless an operator deliberately invokes the appropriate recovery path after verifying canonical identity.

### Historical-chain compatibility

Runtime feature gates and `scripts/activate-aeko-protocol-features.sh` remain only for a history-preserving migration of a legacy chain whose genesis predates the AEKO Protocol builtins. Do not reset the ledger or Explorer PostgreSQL when preserving such a chain. Back up the ledger, keys, Protocol state/continuity, Social state, and Explorer database first; activate the two protocol feature accounts with the original offline feature-authority keypairs; wait for the activation boundary; then allow the normal mandatory Protocol bootstrap to establish/verify canonical state.

The rollback boundary is the feature activation itself: before activation, restore the preserved deployment and state without initializing Protocol state; after activation has landed on the preserved chain, do not pretend the feature was never activated by changing deployment flags. Diagnose or roll forward while preserving chain identity.

### Protocol acceptance

Verify the live Protocol registry and state:

```bash
curl -s https://api.aeko.online/registry/protocol
curl -s https://api.aeko.online/protocol/status

AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-protocol.py
```

Acceptance requires a complete Protocol registry/status, all eleven native program accounts executable, and canonical state/custody accounts matching the generated registry. This is required alongside the Aeko Social acceptance checks below; a healthy validator or Explorer alone does not certify either mandatory capability.

## Deployment acceptance

Do not certify the public network merely because containers are `running` or because Explorer is healthy.

### RPC

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

It must return `result: "ok"`. Call `getSlot` twice and confirm it advances.

### SocialFi registry

```bash
curl -s https://api.aeko.online/registry/social
```

The response is wrapped under `data`. Acceptance requires:

```json
{
  "data": {
    "complete": true,
    "posts": "<non-null>",
    "rewards": "<non-null>",
    "staking": "<non-null>",
    "antiSpam": "<non-null>",
    "monetization": "<non-null>"
  }
}
```

Also check live state verification:

```bash
curl -s https://api.aeko.online/social/status
```

Acceptance requires `data.complete == true`. A healthy Explorer with `complete: false` is intentionally a degraded/diagnostic state, not SocialFi success.

### Automated read-path smoke

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

Also run the mandatory Protocol smoke:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-protocol.py
```

That verifies RPC health, slot advancement, registry completeness, state-account ownership/initialization and Explorer SocialFi reads.

### Signed write path

Use `https://scan.aeko.online/network-tools` and open the Test Console:

1. create a test wallet;
2. request a policy-controlled funding grant;
3. verify balance;
4. submit a signed `AnchorPost`;
5. confirm the transaction;
6. read the post back;
7. submit signed Like/engagement;
8. confirm it;
9. verify `/posts` and `/engagement`;
10. verify Explorer UI activity.

## Security/exposure rules

- Never expose the Faucet Daemon on TCP `9900` publicly.
- Never expose PostgreSQL `5432` publicly.
- Public dApps never connect to gossip.
- Route public RPC/WS through the selected deployment platform's HTTP/WebSocket proxy to the validator's exposed `8899`/`8900` ports for the current single-validator topology.
- Keep node, SocialFi, protocol-authority and feature-authority key material out of Git.
- Preserve ledger, SocialFi, protocol-state and protocol-continuity volumes on normal redeploys.
- Treat missing-state and continuity-anchor recovery overrides as deliberate incident-recovery inputs to manual bootstrap execution, not normal Compose settings. Normal public deployment infers first initialization versus established-state verification from the persisted registry and continuity anchor.

## Protocol maturity boundary

The deployment described here makes the network topology, SocialFi bootstrap/discovery, posts/engagement path and Explorer consumption deployable. It does **not** convert known SocialFi protocol gaps into finished economics:

- the creator signs the post transaction and hashes are anchored, but the chain does not yet independently verify a separate canonical post-payload Ed25519 signature referenced by `signature_ref`;
- Social Staking records stake/lifecycle/cooldown/yield accounting without full atomic lamport escrow and funded-yield transfer enforcement;
- Social Monetization records signed tip/subscription/unlock amounts without atomically debiting the actor during the action; payout is treasury-backed accounting;
- Anti-Spam bootstrap defaults to `ObserveOnly` with permissive thresholds.

Those require protocol changes and dedicated economic/security integration tests. They should remain visible rather than being mislabeled as Docker/deployment work.

## Release-readiness language

Use precise states:

- **Build-ready**: all Docker targets build and deployment contracts parse.
- **Publish-ready**: main CI has pushed the selected Docker Hub image tags.
- **Deploy-ready**: the selected production platform (Coolify or Dokploy) has persistent keys, database, domains/firewall and the matching production Compose configuration.
- **Integration-verified**: the deployed public RPC/Explorer SocialFi smoke passes.
- **Write-path verified**: a signed SocialFi transaction succeeds end-to-end and its result is observable.
- **Mainnet/production mature**: requires decentralization, redundancy, monitoring, backups, security, capacity/load and incident-response work beyond this single-host reference stack.

A green image build alone is not sufficient evidence for the later states.

## Separate Aeko product backend

The Aeko application backend is a separate repository/service on `:4101`. It is not included in either chain production Compose contract and should have its own database and deployment lifecycle. It consumes AEKO Chain through RPC/WS/Explorer APIs.
