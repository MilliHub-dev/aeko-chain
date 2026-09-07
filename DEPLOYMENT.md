# AEKO deployment topology

This document is the operator contract for building and deploying the AEKO public network. For the developer-facing mental model and SocialFi acceptance flow, start with [`README.md`](./README.md).

## Two Compose contracts

AEKO intentionally has two Compose files because local convenience and public deployment have different exposure requirements.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | portable local/testnet stack; validator RPC/WS are host-published and `rpc-node` is optional |
| `docker-compose.dokploy.yml` | public/Dokploy stack; uses prebuilt Docker Hub images, makes `rpc-node` mandatory, keeps the voting validator's RPC/WS private and publishes validator transport directly |

The root `Dockerfile` remains the canonical image build definition. Do not add a second production Dockerfile merely to deploy prebuilt images.

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
       +------ rpc-node (:8899/:8900) ------+
                         |                   |
                 private gossip        Explorer API :8088
                  validator:8001             |
                         |              PostgreSQL + registry
                     validator
                         |
                  ledger / consensus

scan.aeko.online -> explorer-ui :4000 -> explorer-api :8088

gossip.aeko.online:8001 -> validator gossip entrypoint
validator host TCP+UDP 8000-8050 -> public validator transport range
faucet :9900 -> internal only
```

The public RPC replica uses the **same validator image** with `AEKO_NODE_ROLE=rpc`. It runs `--no-voting` and joins the block-producing validator via `validator:8001`. The validator advertises `AEKO_PUBLIC_IP` with `--gossip-host` and uses `8000-8050` as its public dynamic transport range; the private RPC replica uses a separate `8051-8101` range inside Docker.

A wallet is not a network daemon. Use `aeko-tools`, SDKs or wallet adapters to sign client transactions. WebSocket is RPC PubSub on port `8900`, not a separate service image.

## Persistent state

Never treat a normal redeploy as a fresh chain.

Persist:

- `validator-ledger` named volume;
- `rpc-ledger` named volume;
- `social-state` named volume;
- validator identity key;
- vote-account key;
- stake key;
- faucet key;
- RPC-node identity key.

The `social-state` volume contains the five SocialFi state keypairs plus `social-registry.env`.

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

`AEKO_KEYS_DIR` must contain:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
rpc-node-keypair.json
```

Generate missing keys with `aeko-tools`. Do not use the validator image just to create a wallet/keypair.

```bash
docker run --rm \
  -v "$PWD/local-testnet:/keys" \
  surdma/aeko-tools:latest \
  aeko-keygen new --no-bip39-passphrase --silent \
  --outfile /keys/rpc-node-keypair.json
```

Keep key files in persistent restricted storage. Do not rely on keys living inside an AutoDeploy Git checkout and never commit them.

## SocialFi bootstrap lifecycle

`social-bootstrap` is part of the default network, not an optional manual afterthought.

Startup ordering is:

```text
faucet
  -> validator healthy
       -> rpc-node healthy
       -> social-bootstrap completes successfully
            -> explorer-api healthy
                 -> explorer-ui
```

Bootstrap is safe for a normal redeploy because it does not send another Initialize instruction when the persisted key resolves to an initialized account owned by the expected SocialFi program. Wrong-owner, malformed or unexpectedly missing existing state fails closed.

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

A deliberate ledger reset makes the old persisted SocialFi keypairs point at accounts that no longer exist in the new chain. For that one intentional recovery deployment set:

```text
AEKO_RESET_LEDGER=1
AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1
```

The Dokploy Compose passes `AEKO_RESET_LEDGER` to both validator and RPC replica, so both persisted ledgers are cleared together. `AEKO_BOOTSTRAP_ALLOW_MISSING_STATE` lets bootstrap recreate only the state that is expected to be absent after that deliberate fresh genesis. After reset/bootstrap succeeds, return both switches to `0` before subsequent redeploys.

## Portable/local deployment

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

The default portable stack starts faucet, validator, automatic SocialFi bootstrap, Explorer API and Explorer UI. Add the local non-voting RPC replica with:

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
| `rpc.aeko.online` | `rpc-node` | `8899` |
| `ws.aeko.online` | `rpc-node` | `8900` |
| `api.aeko.online` | `explorer-api` | `8088` |
| `scan.aeko.online` | `explorer-ui` | `4000` |

Do not route `gossip.aeko.online` through Traefik. DNS should point it directly at `AEKO_PUBLIC_IP`. Gossip starts on `8001`, and the Compose publishes the full validator TCP+UDP `8000-8050` transport range with same-port host mappings so advertised peer addresses stay reachable.

The services share the private `aeko` Docker network for validator/RPC/faucet/bootstrap/Explorer communication. The optional `wallet-tools` service is an `ops` profile for CLI/key generation and is not a public daemon. If Dokploy Isolated Deployments is enabled, Dokploy can add its routing network to domain-selected services while the private AEKO network remains intact.

## Deploy / update behavior

Manual equivalent:

```bash
docker compose -f docker-compose.dokploy.yml pull
docker compose -f docker-compose.dokploy.yml up -d
docker compose -f docker-compose.dokploy.yml ps
```

The GitHub `Build AEKO Network Images` workflow validates both Compose contracts and publishes images first. `Deploy AEKO Network via Dokploy` runs only after that workflow succeeds on `main` and calls `DOKPLOY_WEBHOOK_URL`.

The webhook triggers the preconfigured Dokploy resource. It does not choose the Compose path on its own, so the resource must point to `docker-compose.dokploy.yml`.

## Deployment acceptance

Do not certify the public network merely because containers are `running`.

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

### Automated read-path smoke

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

That verifies RPC health, slot advancement, registry completeness, state-account ownership/initialization and Explorer SocialFi reads.

### Signed write path

Use `https://scan.aeko.online/faucet` and open the Test Console:

1. create a test wallet;
2. request an airdrop;
3. verify balance;
4. submit a signed `AnchorPost`;
5. confirm the transaction;
6. read the post back;
7. submit signed Like/engagement;
8. confirm it;
9. verify `/posts` and `/engagement`;
10. verify Explorer UI activity.

## Security/exposure rules

- Never expose faucet `9900` publicly.
- Never expose PostgreSQL `5432` publicly.
- Public dApps never connect to gossip.
- Prefer public RPC/WS through `rpc-node`, not the voting validator.
- Keep node and SocialFi key material out of Git.
- Preserve ledger and SocialFi volumes on normal redeploys.
- Treat `AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1` as a deliberate reset/recovery switch, not a normal setting.

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
- **Deploy-ready**: Dokploy has persistent keys, database, domains/firewall and the production Compose configuration.
- **Integration-verified**: the deployed public RPC/Explorer SocialFi smoke passes.
- **Write-path verified**: a signed SocialFi transaction succeeds end-to-end and its result is observable.
- **Mainnet/production mature**: requires decentralization, redundancy, monitoring, backups, security, capacity/load and incident-response work beyond this single-host reference stack.

A green image build alone is not sufficient evidence for the later states.

## Separate Aeko product backend

The Aeko application backend is a separate repository/service on `:4101`. It is not included in the chain Dokploy Compose and should have its own database and deployment lifecycle. It consumes AEKO Chain through RPC/WS/Explorer APIs.
