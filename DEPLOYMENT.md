# AEKO deployment topology

This file is the canonical deployment contract for the AEKO testnet.

## The important rule

There is no single "everything" container. The complete network is the set of services in `docker-compose.yml`.

The repository has one root `Dockerfile` so the build logic is easy to find, but it produces separate runtime targets. Each deployed container contains only the binaries needed for that role.

| Runtime role | Docker target / image | Purpose | Port(s) |
| --- | --- | --- | --- |
| Validator | `validator` / `aeko-validator` | Voting block producer, ledger, consensus, initial RPC | 8001 TCP+UDP, 8899, 8900 |
| RPC node | same `aeko-validator` image | Optional non-voting public RPC replica connected through gossip | 8899, 8900 internally |
| Faucet | `faucet` / `aeko-faucet` | Testnet airdrop service used by validator RPC | 9900 internal |
| Social bootstrap | `social-bootstrap` / `aeko-social-bootstrap` | One-shot creation of SocialFi state accounts | none |
| Operator tools | `tools` / `aeko-tools` | `aeko` CLI and `aeko-keygen` | none |
| Explorer API | `explorer-api` / `aeko-explorer-api` | Rust chain indexer and REST read API | 8088 |
| Explorer UI | `explorer-ui` / `aeko-explorer-ui` | Vite block explorer web application | 4000 |

The separate `MilliHub-dev/Aeko_backend` repository is the Aeko application backend. It is not the explorer API and is deployed separately on port `4101`.

## Public endpoint ownership

Use these names consistently:

```text
rpc.aeko.online          -> validator/RPC-node JSON-RPC :8899
ws.aeko.online           -> validator/RPC-node WebSocket :8900
api.aeko.online          -> explorer-api :8088
scan.aeko.online         -> explorer-ui :4000
gossip.aeko.online:8001  -> validator gossip TCP/UDP only
```

Do not use `gossip.aeko.online` as an explorer website alias.

## Build locally

The default Docker build is the validator:

```bash
docker build -t surdma/aeko-validator:latest .
```

Other runtime images come from named targets:

```bash
docker build --target faucet -t surdma/aeko-faucet:latest .
docker build --target social-bootstrap -t surdma/aeko-social-bootstrap:latest .
docker build --target tools -t surdma/aeko-tools:latest .
docker build --target explorer-api -t surdma/aeko-explorer-api:latest .
docker build --target explorer-ui -t surdma/aeko-explorer-ui:latest .
```

GitHub Actions builds the complete target set. Pull requests build every target as a validation gate; pushes to `main` additionally publish the images to Docker Hub.

## Required keypairs

The default compose file expects these files under `AEKO_KEYS_DIR` (default `./local-testnet`):

- `validator-1-keypair.json`
- `vote-1-keypair.json`
- `stake-keypair.json`
- `faucet-keypair.json`
- `rpc-node-keypair.json` only when the optional RPC replica is enabled

Generate them with the tools image and back them up outside the repository. Never commit keypair JSON.

Example:

```bash
mkdir -p local-testnet
for name in validator-1-keypair vote-1-keypair stake-keypair faucet-keypair rpc-node-keypair; do
  docker run --rm \
    -v "$PWD/local-testnet:/keys" \
    surdma/aeko-tools:latest \
    aeko-keygen new --no-bip39-passphrase --silent --outfile "/keys/${name}.json"
done
```

The bootstrap validator uses the identity, vote, stake and faucet keypairs to create genesis once. Those keys and the validator ledger must survive redeployments. Do not regenerate them on every deploy.

## PostgreSQL

PostgreSQL is deliberately not embedded in `docker-compose.yml`.

For the explorer API set:

```text
EXPLORER_DATABASE_URL=postgres://...
```

Use a managed Dokploy PostgreSQL resource, RDS, Neon, Supabase, or another PostgreSQL service. If `EXPLORER_DATABASE_URL` is empty, the explorer falls back to its in-memory store, which is suitable only for disposable/local runs.

The Aeko application backend has its own `DATABASE_URL`; do not point it at an explorer database unless you intentionally provision separate schemas/users and understand the ownership boundary.

## Run the core network

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

The default stack starts:

```text
faucet
validator
explorer-api
explorer-ui
```

The validator entrypoint supplies the complete normal validator command when no explicit command is provided, including identity, vote account, ledger, RPC, gossip and faucet settings. This prevents the previous `--identity <KEYPAIR> argument is required` startup loop.

## Optional RPC replica

A public RPC replica does not require a second Docker build. It runs the same validator image with a different role:

```bash
docker compose --profile rpc up -d rpc-node
```

The replica uses `--no-voting` and joins the validator through `validator:8001`. This lets public read load be separated from the block-producing validator when needed.

## One-time SocialFi initialization

After the validator is healthy, initialize SocialFi state accounts once:

```bash
docker compose run --rm social-bootstrap
```

Persist the emitted state addresses in deployment environment variables used by the explorer and application backend.

## Dokploy

`docker-compose.yml` is intentionally portable and can be pasted into Dokploy as raw Compose.

Set at minimum:

```text
AEKO_KEYS_DIR=<persistent host directory containing the keypair files>
EXPLORER_DATABASE_URL=<Dokploy PostgreSQL Internal Connection URL>
```

Configure Dokploy domains by service/container port:

- RPC -> `validator:8899` initially, or `rpc-node:8899` after enabling the RPC replica
- WebSocket -> validator/RPC node `8900`
- Explorer API -> `explorer-api:8088`
- Explorer UI -> `explorer-ui:4000`

Gossip is raw TCP/UDP on host port `8001`; it is not an HTTP route.

## Application backend

The product backend is in `MilliHub-dev/Aeko_backend`, not `explorer-backend/`.

Its deployment contract is:

```text
application backend HTTP/Socket.IO :4101
DATABASE_URL                       managed application PostgreSQL
AEKO_RPC_URL                       https://rpc.aeko.online
AEKO_EXPLORER_URL                  https://api.aeko.online
FRONTEND_URL                       your product frontend origin
```

That backend owns users, auth, posts, chat, wallet orchestration, marketplace, payments, staking/rewards application APIs and other product behavior. The Rust explorer API owns indexed blockchain read data only.
