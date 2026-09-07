# AEKO Chain

AEKO Chain is a Solana-derived blockchain runtime extended with native SocialFi programs for verifiable social content, engagement, rewards, staking, anti-spam policy, and monetization.

This repository contains the **chain and chain-facing infrastructure**: validator/RPC runtime, native programs, CLI/key tooling, SocialFi bootstrap, explorer/indexer, deployment definitions, and integration documentation. The Aeko product backend lives separately in `MilliHub-dev/Aeko_backend`.

## Mental model

Do not think of AEKO as one web server or one Docker container. A usable public deployment is a set of cooperating roles:

```text
Aeko app / backend / SDK clients
              |
              +---- HTTPS JSON-RPC ----> public RPC node :8899
              +---- WSS PubSub --------> public RPC node :8900
              +---- Explorer REST -----> explorer API :8088
              |                              |
              |                              +--> PostgreSQL
              |                              +--> SocialFi registry
              |
              +---- Explorer web ------> explorer UI :4000

public RPC node -- gossip/validator transport --> validator / block producer
                                              |
                                              +--> ledger + consensus
                                              +--> five native SocialFi programs
                                              +--> internal faucet (testnet)

social-bootstrap -- one-shot transactions --> SocialFi state accounts
                 -- persistent registry -----> explorer API
```

### What each role owns

| Role | Image | Responsibility |
| --- | --- | --- |
| Validator | `surdma/aeko-validator` | Block production, voting, ledger, consensus, validator transport, private/internal RPC |
| RPC node | `surdma/aeko-validator` | Same executable in `AEKO_NODE_ROLE=rpc`; non-voting public JSON-RPC and PubSub/WebSocket edge |
| Faucet | `surdma/aeko-faucet` | Testnet airdrop service consumed internally by validator/RPC |
| SocialFi bootstrap | `surdma/aeko-social-bootstrap` | Idempotently creates and initializes the five required SocialFi state accounts and writes the registry |
| Explorer API | `surdma/aeko-explorer-api` | Chain indexer, REST read API, SocialFi registry/read endpoints |
| Explorer UI | `surdma/aeko-explorer-ui` | Browser block/social explorer |
| Wallet/operator tools | `surdma/aeko-tools` | `aeko` CLI and `aeko-keygen`; wallets are keypairs/signers, not a long-running network node |

A **WebSocket node is not a separate daemon**. PubSub/WebSocket is served by the validator/RPC process on port `8900`. Likewise, a **wallet node does not exist**: wallet identity and signing belong to clients or a custody backend; operator key generation is provided by `aeko-tools`.

## SocialFi runtime

AEKO currently registers five SocialFi programs directly in `runtime/src/builtins.rs`, so validators recognize them from chain startup without a BPF deployment step:

- `aeko_social_posts_program`
- `aeko_social_rewards_program`
- `aeko_social_staking_program`
- `aeko_social_anti_spam_program`
- `aeko_social_monetization_program`

Being registered is only the first half of readiness. Each program also needs an initialized program-owned state account. `aeko-social-bootstrap` performs that initialization after the validator reports healthy.

The deployment flow is intentionally automatic and idempotent:

1. validator becomes healthy;
2. `social-bootstrap` loads or creates persistent state keypairs;
3. it verifies existing accounts before reusing them and refuses unexpected owners/state;
4. it initializes missing SocialFi state;
5. it writes `social-registry.env` into the persistent `social-state` volume;
6. Explorer waits for bootstrap success before starting;
7. `/registry/social` exposes the resolved registry and reports `complete: true` only when all five program state addresses exist in the registry.

Operator environment variables can override registry values intentionally, but the normal deployment does not require copying addresses by hand between containers.

## Social write and read paths

The chain is not the social feed database. The intended split is:

```text
Write path
Aeko client/backend
  -> construct/sign AEKO transaction
  -> JSON-RPC sendTransaction
  -> validator/runtime
  -> native SocialFi program
  -> canonical on-chain state / proof

Read path
validator ledger
  -> explorer indexer
  -> PostgreSQL/indexed views
  -> Explorer REST
  -> Aeko backend/client
```

Large media, feed ranking, chat payloads, auth sessions, and product data remain application/backend concerns. Chain state is used for the parts that need cryptographic ownership, settlement, proof, rewards, staking, reputation/anti-spam state, or monetization guarantees.

## Public endpoint contract

The intended public endpoint ownership is:

| Endpoint | Owner | Protocol |
| --- | --- | --- |
| `https://rpc.aeko.online` | dedicated RPC node | JSON-RPC |
| `wss://ws.aeko.online` | dedicated RPC node | PubSub/WebSocket |
| `https://api.aeko.online` | explorer API | HTTP REST |
| `https://scan.aeko.online` | explorer UI | HTTPS |
| `gossip.aeko.online:8001` | validator | raw validator gossip, not HTTP |

A public validator also needs its validator transport range reachable. The Dokploy deployment pins this to TCP+UDP `8000-8050` and advertises `AEKO_PUBLIC_IP` through `--gossip-host`.

## Build model

There is one root `Dockerfile` with named runtime targets:

```text
validator
faucet
social-bootstrap
tools
explorer-api
explorer-ui
```

Build examples:

```bash
docker build --target validator -t surdma/aeko-validator:latest .
docker build --target faucet -t surdma/aeko-faucet:latest .
docker build --target social-bootstrap -t surdma/aeko-social-bootstrap:latest .
docker build --target tools -t surdma/aeko-tools:latest .
docker build --target explorer-api -t surdma/aeko-explorer-api:latest .
docker build --target explorer-ui -t surdma/aeko-explorer-ui:latest .
```

`.github/workflows/build-images.yml` builds every target on pull requests. On `main`, the same workflow logs in to Docker Hub and publishes both `latest` and the 12-character Git commit tag. Compatibility aliases are also published for the older `aeko-node` and `aeko-explorer-backend` names.

For production-like deployments, prefer the immutable commit tag over `latest` so rollback is deterministic.

## Deployment choices

### Local / portable Compose

`docker-compose.yml` is the development/portable topology. It starts the validator, faucet, automatic SocialFi bootstrap, Explorer API and Explorer UI. The optional RPC replica is enabled with the `rpc` profile.

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

### Dokploy / public testnet

`docker-compose.dokploy.yml` is the image-only Dokploy contract. It does **not** build source on the server. Every service uses `pull_policy: always` and pulls the image/tag published by the main-branch Docker workflow.

Required Dokploy environment:

```text
AEKO_PUBLIC_IP=<server public IP>
AEKO_KEYS_DIR=../files/aeko-keys
EXPLORER_DATABASE_URL=postgres://...
AEKO_IMAGE_TAG=<recommended 12-char published main commit SHA>
```

The key directory must persist across deployments and contain:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
rpc-node-keypair.json
```

Never commit those keypairs to Git.

In Dokploy Domains configure:

```text
rpc.aeko.online  -> rpc-node      port 8899
ws.aeko.online   -> rpc-node      port 8900
api.aeko.online  -> explorer-api  port 8088
scan.aeko.online -> explorer-ui   port 4000
```

Also point `gossip.aeko.online` DNS directly at `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050` in the host/cloud firewall. Gossip is not routed as an HTTP domain.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete operator procedure.

## Wallets and keys

A wallet is a signer/keypair, not a chain service. The public network therefore does not run a container called `wallet`.

Use the tools image for operator keys:

```bash
docker run --rm -v "$PWD/local-testnet:/keys" \
  surdma/aeko-tools:latest \
  aeko-keygen new --no-bip39-passphrase --silent --outfile /keys/example-wallet.json
```

The Aeko application backend may implement its own custodial/non-custodial wallet policy. That is intentionally outside validator consensus.

## Consuming AEKO from Aeko Social

At minimum, a consuming backend/client needs the public RPC and Explorer endpoints:

```text
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_EXPLORER_URL=https://api.aeko.online
```

SocialFi state discovery is available from:

```text
GET https://api.aeko.online/registry/social
```

A healthy deployment returns a registry whose `complete` field is `true`. The repository smoke test then verifies RPC health, slot advancement, all five initialized program-owned state accounts, and the Explorer SocialFi read surfaces:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

That smoke test proves the deployed **read path and state wiring**. It intentionally does not claim a signed social write unless a real signed transaction has also been exercised.

## What "ready" means

Use the following gates rather than treating a successful Docker build as deployment proof:

1. all six Docker targets build;
2. the selected main commit images exist in Docker Hub;
3. validator `getHealth` returns `ok` and slots advance;
4. the dedicated RPC node reports healthy;
5. SocialFi bootstrap exits successfully;
6. Explorer `/health` succeeds;
7. `/registry/social` reports `complete: true`;
8. each SocialFi state account exists, is initialized and has the expected program owner;
9. `/posts`, `/engagement`, and `/stakes` respond through Explorer;
10. public HTTPS/WSS domains and validator TCP+UDP transport are reachable from outside the Dokploy host;
11. a real signed Aeko Social transaction is submitted and its resulting state/read model is observed end-to-end before calling the write path production-verified.

Passing GitHub image builds alone is **build readiness**, not proof of public production readiness.

## Solana relationship and scope

AEKO reuses a Solana-style validator/runtime/network architecture and exposes familiar JSON-RPC and PubSub concepts, but this repository should not be described as "as full as Solana" merely because the services are containerized. Solana-scale public-network maturity also includes independent validators, stake distribution, redundant RPC fleets, snapshot/bootstrap infrastructure, monitoring/alerting, abuse protection, capacity planning, backups, key management, incident response, and sustained adversarial/load testing.

The Dokploy stack gives AEKO a coherent **single-host public testnet topology and consumption contract**. Decentralization and mainnet-grade operational maturity are separate release milestones.

## Repository map

Key areas to understand first:

```text
runtime/src/builtins.rs              native program registration
programs/social-*                    SocialFi program logic/state/instructions
social-bootstrap/                    SocialFi state initialization + registry
validator/                           validator executable and CLI
rpc/                                 JSON-RPC implementation
explorer-backend/                    indexer + REST API
web/                                 Explorer UI
docker/validator-entrypoint.sh       container role/bootstrap entrypoint
Dockerfile                           canonical multi-target image build
docker-compose.yml                   portable/local runtime
docker-compose.dokploy.yml           Dokploy image-only public runtime
scripts/deploy-testnet.sh             local/server deployment helper
scripts/smoke-aeko-social.py          deployment + SocialFi read-path smoke test
docs/socialfi/                        SocialFi contracts and flows
docs/aeko-social-integration/         Aeko Social integration guidance
docs/rpc-and-apis/                    RPC/API contracts
DEPLOYMENT.md                         operator deployment contract
```

## Security and operational boundaries

- Keep validator identity, vote, stake, faucet and RPC-node keypairs outside Git and in persistent restricted storage.
- Never reset a persistent ledger accidentally. `AEKO_RESET_LEDGER=1` is destructive and should be used only for an intentional fresh genesis.
- Use persistent PostgreSQL for public Explorer deployments.
- Prefer immutable image tags for production deployment and rollback.
- Do not expose the faucet directly unless a public faucet policy is intentionally designed.
- Keep block-producing validator capacity isolated from public RPC load.
- Treat a single-validator deployment as centralized testnet infrastructure, not decentralized mainnet.

## More documentation

- [`DEPLOYMENT.md`](DEPLOYMENT.md)
- [`docs/introduction/architecture-overview.md`](docs/introduction/architecture-overview.md)
- [`docs/socialfi/`](docs/socialfi/)
- [`docs/aeko-social-integration/`](docs/aeko-social-integration/)
- [`docs/rpc-and-apis/`](docs/rpc-and-apis/)
