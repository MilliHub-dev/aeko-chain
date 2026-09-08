# AEKO deployment topology

This document is the operator contract for building and deploying the AEKO public network. For the developer-facing mental model and SocialFi acceptance flow, start with [`README.md`](./README.md).

## Two Compose contracts

AEKO intentionally has two Compose files because local convenience and public deployment have different exposure requirements.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | portable local/testnet stack; validator RPC/WS are host-published and `rpc-node` is optional |
| `docker-compose.dokploy.yml` | public/Dokploy stack; uses prebuilt Docker Hub images and serves RPC/WS from the healthy voting validator |

The root `Dockerfile` remains the canonical image build definition. Do not add a second production Dockerfile merely to deploy prebuilt images.

The separate non-voting `rpc-node` remains an opt-in portable/local profile. It is **not** a mandatory Dokploy dependency for the current single-validator public testnet. The block-producing validator already runs the full RPC surface required by wallets, SocialFi bootstrap and Explorer (`--full-rpc-api`, transaction history and PubSub).

## Image pipeline

GitHub Actions builds these root Docker targets:

```text
validator        -> aeko-validator
faucet           -> aeko-faucet
social-bootstrap -> aeko-social-bootstrap
tools            -> aeko-tools
explorer-api     -> aeko-explorer-api
explorer-ui      -> aeko-explorer-ui
```

On `main`, CI publishes both `latest` and a 12-character commit-SHA tag. The Dokploy Compose contains only `image:` references plus `pull_policy: always`; it never compiles the Rust/React repository on the deployment host. Prefer the immutable SHA tag for a controlled public release and rollback.

Compatibility aliases `aeko-node` and `aeko-explorer-backend` remain temporary publication names; new deployments use the canonical names above.

## Public topology

```text
Internet wallets / dApps / SDKs
       |                    |
     HTTPS                 WSS
       |                    |
 rpc.aeko.online       ws.aeko.online
       |                    |
       +------ validator (:8899/:8900) -------+
                         |                    |
                  ledger / consensus     Explorer API :8088
                         |                    |
              native AEKO SocialFi     PostgreSQL + registry

scan.aeko.online -> explorer-ui :4000 -> explorer-api :8088

gossip.aeko.online:8001 -> validator gossip entrypoint
validator host TCP+UDP 8000-8050 -> public validator transport range
faucet :9900 -> internal only
```

The current Dokploy topology intentionally does not start a second non-voting validator just to provide RPC. In the single-validator public testnet that replica added another genesis/snapshot/gossip bootstrap lifecycle without adding functional capability, and a failed replica prevented Explorer from starting despite the voting validator being healthy. Public HTTPS/WSS is therefore routed directly to the validator's already-enabled full RPC/PubSub ports.

A wallet is not a network daemon. Use `aeko-tools`, SDKs or wallet adapters to sign client transactions. WebSocket is RPC PubSub on port `8900`, not a separate service image.

## Persistent state

Never treat a normal redeploy as a fresh chain.

Persist:

- `validator-ledger` named volume;
- `social-state` named volume;
- validator identity key;
- vote-account key;
- stake key;
- faucet key.

The `social-state` volume contains the five SocialFi state keypairs plus `social-registry.env`.

The optional portable/local RPC replica has its own identity/ledger when that profile is explicitly enabled; those are not requirements of the default Dokploy topology.

## Required production environment

```text
AEKO_PUBLIC_IP=<Dokploy host public IP>
AEKO_KEYS_DIR=../files/aeko-keys
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended 12-character published main commit SHA>
```

Optional SocialFi configuration:

```text
AEKO_TREASURY_ADDRESS=<pubkey>
AEKO_REWARD_VAULT=<pubkey>
AEKO_STAKE_VAULT=<pubkey>
AEKO_PLATFORM_FEE_BPS=200
```

`AEKO_PUBLIC_IP` must be the address external validators can reach. Allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. `EXPLORER_DATABASE_URL` is intentionally required by the Dokploy Compose. In-memory indexing is useful for disposable local runs but is not a public-network storage contract.

## Required key files

The default Dokploy `AEKO_KEYS_DIR` must contain:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

Generate missing keys with `aeko-tools`. Do not use the validator image just to create a wallet/keypair.

```bash
docker run --rm \
  -v "$PWD/local-testnet:/keys" \
  surdma/aeko-tools:latest \
  aeko-keygen new --no-bip39-passphrase --silent \
  --outfile /keys/validator-1-keypair.json
```

Keep key files in persistent restricted storage. Do not rely on keys living inside an AutoDeploy Git checkout and never commit them.

## One-shot initialization jobs

Two default services are initialization jobs rather than daemons:

- `key-preflight` validates persistent key material and exits **0**;
- `social-bootstrap` verifies/initializes all five native SocialFi state accounts, writes the registry and exits **0**.

Docker/Dokploy displays a successfully completed one-shot process as `Exited (0)`. That is success, not a crash. Long-running services are `faucet`, `validator`, `explorer-api` and `explorer-ui`.

## SocialFi bootstrap lifecycle

`social-bootstrap` is part of the default network, not an optional manual afterthought.

Startup ordering is:

```text
key-preflight exits 0
  -> faucet running
  -> validator healthy
       -> social-bootstrap exits 0
            -> explorer-api healthy
                 -> explorer-ui healthy
```

Bootstrap is safe for a normal redeploy because it does not send another Initialize instruction when the persisted key resolves to an initialized account owned by the expected SocialFi program. Wrong-owner, malformed or unexpectedly missing established state fails closed.

The bootstrap writes:

```text
/state/social-registry.env
```

Explorer mounts the same volume read-only and consumes:

```text
AEKO_SOCIAL_REGISTRY_FILE=/state/social-registry.env
```

No manual renaming from `SOCIAL_*_STATE_ACCOUNT` to `AEKO_SOCIAL_*` is required.

### Intentional chain reset

A deliberate validator ledger reset makes the old persisted SocialFi keypairs point at accounts that no longer exist in the new chain. For that one intentional recovery deployment set:

```text
AEKO_RESET_LEDGER=1
AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1
```

`AEKO_RESET_LEDGER` clears the validator ledger for the intended fresh genesis. `AEKO_BOOTSTRAP_ALLOW_MISSING_STATE` lets bootstrap recreate only the state expected to be absent after that deliberate reset. After reset/bootstrap succeeds, return both switches to `0` before subsequent redeploys.

## Portable/local deployment

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

The default portable stack starts faucet, validator, automatic SocialFi bootstrap, Explorer API and Explorer UI. Add the local non-voting RPC replica only when explicitly testing that topology:

```bash
docker compose --profile rpc up -d rpc-node
```

For a deliberate local reset use the repository helper:

```bash
./scripts/deploy-testnet.sh --reset-chain
```

## Dokploy setup

Create a **Docker Compose** resource pointed at this repository/branch and set:

```text
Compose Path: ./docker-compose.dokploy.yml
```

The file intentionally has no `build:` directives. Every runtime is pulled from Docker Hub with `pull_policy: always`.

Dokploy's native Domains feature is preferred. Route:

| Domain | Service | Container port |
| --- | --- | ---: |
| `rpc.aeko.online` | `validator` | `8899` |
| `ws.aeko.online` | `validator` | `8900` |
| `api.aeko.online` | `explorer-api` | `8088` |
| `scan.aeko.online` | `explorer-ui` | `4000` |

Do not route `gossip.aeko.online` through Traefik. DNS should point it directly at `AEKO_PUBLIC_IP`. Gossip starts on `8001`, and the Compose publishes the full validator TCP+UDP `8000-8050` transport range with same-port host mappings so advertised peer addresses stay reachable.

The services share the private `aeko` Docker network for validator/faucet/bootstrap/Explorer communication. The optional `wallet-tools` service is an `ops` profile for CLI/key generation and is not a public daemon. If Dokploy Isolated Deployments is enabled, Dokploy can add its routing network to domain-selected services while the private AEKO network remains intact.

## Deploy / update behavior

Manual equivalent:

```bash
docker compose -f docker-compose.dokploy.yml pull
docker compose -f docker-compose.dokploy.yml up -d
docker compose -f docker-compose.dokploy.yml ps
```

The GitHub `Build AEKO Network Images` workflow validates both Compose contracts and publishes images first. `Deploy AEKO Network via Dokploy` runs only after that workflow succeeds on `main` and calls `DOKPLOY_WEBHOOK_URL`.

## Deployment acceptance

Do not certify a Dokploy deployment from container creation alone. Verify:

1. `key-preflight` is `Exited (0)`.
2. `faucet` is running.
3. `validator` is running and healthy with an advancing slot.
4. `social-bootstrap` is `Exited (0)` and `/state/social-registry.env` is complete.
5. `explorer-api` is running/healthy; its health gate exercises PostgreSQL plus `/social/status`.
6. `explorer-ui` is running/healthy and can reach the API read path.
7. `https://rpc.aeko.online` returns `getHealth = ok` and advancing `getSlot`.
8. `https://api.aeko.online/registry/social` reports `complete = true`.
9. `scripts/smoke-aeko-social.py` passes against the public RPC and Explorer API.
