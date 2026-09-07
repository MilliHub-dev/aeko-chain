# AEKO Chain

AEKO Chain is a Solana-derived, SVM-compatible blockchain runtime extended with native SocialFi programs for Aeko Social. This repository contains the **chain and chain-facing infrastructure**: validator/RPC runtime, native programs, CLI/key tooling, SocialFi bootstrap, Explorer/indexer, SDKs, deployment definitions and integration documentation.

The Aeko product backend is a separate service/repository (`MilliHub-dev/Aeko_backend`, currently `:4101`).

## Mental model

Do not think of AEKO as one validator container or one web server. A usable public deployment is a set of cooperating roles:

```text
Aeko Social / wallet / dApp / SDK
              |
      +-------+---------+----------------+
      |                 |                |
      v                 v                v
 JSON-RPC           WebSocket        Explorer REST/UI
 rpc.aeko.online    ws.aeko.online   api/scan.aeko.online
      |                 |                |
      +------ public non-voting RPC node +
                         |
                  private gossip
                         |
                  voting validator
                         |
              native AEKO SocialFi
                         |
                 persistent ledger

Explorer API :8088 <---- rpc-node
       |
       +---- PostgreSQL
       +---- SocialFi registry

Internal only:
  faucet :9900
  social-bootstrap (one-shot)

Separate product stack:
  Aeko application backend :4101
  application database
```

Consumers, wallets and dApps use **RPC/WS**, never gossip. Index-heavy reads can use the **Explorer API**. Humans use the **Explorer UI**. Validator/node operators additionally use gossip and validator transport.

### Runtime responsibilities

| Role | Image | Responsibility |
| --- | --- | --- |
| Validator | `surdma/aeko-validator` | voting block producer, ledger, consensus, validator transport, private/internal RPC |
| RPC node | `surdma/aeko-validator` | same executable with `AEKO_NODE_ROLE=rpc`; non-voting public JSON-RPC and PubSub edge |
| Faucet | `surdma/aeko-faucet` | internal testnet airdrop service consumed by RPC |
| SocialFi bootstrap | `surdma/aeko-social-bootstrap` | verifies/initializes the five SocialFi state accounts and writes the registry |
| Explorer API | `surdma/aeko-explorer-api` | chain indexer, REST API and SocialFi registry/read endpoints |
| Explorer UI | `surdma/aeko-explorer-ui` | browser block/social explorer and test console |
| Wallet/operator tools | `surdma/aeko-tools` | `aeko` CLI and `aeko-keygen`; wallets are signers, not a network daemon |

A **WebSocket node is not a separate daemon**. PubSub/WebSocket is served by the validator/RPC process on port `8900`. Likewise, there is no permanent **wallet node**: wallet identity/signing belongs to a client, wallet adapter, HSM/custody service or application backend. `aeko-tools` supplies CLI/key generation.

## Public endpoint contract

| Purpose | Public endpoint | Runtime owner |
| --- | --- | --- |
| JSON-RPC | `https://rpc.aeko.online` | non-voting RPC node `:8899` |
| WebSocket / PubSub | `wss://ws.aeko.online` | non-voting RPC node `:8900` |
| Explorer REST API | `https://api.aeko.online` | Explorer API `:8088` |
| Explorer UI | `https://scan.aeko.online` | Explorer UI `:4000` |
| Validator gossip | `gossip.aeko.online:8001` | validator gossip entrypoint |

The Dokploy validator publishes the public validator TCP+UDP transport range `8000-8050`; gossip starts at `8001`. `gossip.aeko.online` is **not an Explorer website** and must never be used as an Explorer fallback.

### Port map

| Port/range | Protocol | Purpose | Exposure |
| --- | --- | --- | --- |
| `8000-8050` | TCP + UDP | public validator transport/dynamic range | direct node-to-node |
| `8001` | TCP + UDP | gossip entrypoint inside the range | direct node-to-node |
| `8899` | HTTP JSON-RPC | wallet/dApp/CLI RPC | `rpc.aeko.online` via RPC node |
| `8900` | WebSocket | RPC PubSub | `ws.aeko.online` via RPC node |
| `9900` | TCP | testnet faucet | internal only |
| `8088` | HTTP | Explorer/indexer REST API | `api.aeko.online` |
| `4000` | HTTP | Explorer UI | `scan.aeko.online` |
| `4101` | HTTP/Socket.IO | separate Aeko application backend | separate deployment |
| `5432` | PostgreSQL | durable storage where configured | internal only |

## Native Aeko SocialFi

AEKO registers **five SocialFi programs directly in `runtime/src/builtins.rs`**. They are native runtime built-ins, so developers do not first deploy five separate BPF contracts.

| Built-in | Current capability |
| --- | --- |
| Social Posts | original/reply/repost/quote anchors, content + metadata hashes, visibility, moderation, edits and creator transaction-signature checks |
| Engagement | implemented inside Social Posts: like/comment/repost/quote/share/save proofs plus duplicate/replay protection |
| Social Rewards | creator reward accounting, settlement epochs and claim accounting |
| Social Staking | creator/staker position state, lifecycle, cooldown and yield accounting |
| Social Anti-Spam | wallet profiles, reputation/stake modes, cooldowns and penalty state; bootstrap defaults to `ObserveOnly` |
| Social Monetization | tip/subscription/paid-content records and creator-revenue accounting |

Engagement is a Social Posts capability, not a sixth native program.

### SocialFi state bootstrap and discovery

Native program registration alone is not enough. Each SocialFi program needs a program-owned state account. `aeko-social-bootstrap` runs automatically after the validator becomes healthy.

Normal redeploy behavior is fail-closed and idempotent at the deployment boundary:

1. SocialFi state keypairs are persisted in the `social-state` volume.
2. Bootstrap reads the corresponding account from-chain.
3. An initialized account owned by the expected program is reused without another Initialize transaction.
4. Wrong-owner, malformed or unexpectedly missing persisted state fails deployment instead of silently overwriting social state.
5. Bootstrap writes `/state/social-registry.env`.
6. Explorer mounts the same volume read-only through `AEKO_SOCIAL_REGISTRY_FILE=/state/social-registry.env`.
7. Explorer starts only after bootstrap exits successfully.

Operator env vars can intentionally override registry values, but normal deployment no longer requires copying/renaming state addresses by hand.

### Intentional fresh-genesis recovery

If the chain is deliberately reset while the SocialFi state-key volume is retained, use both switches for that one recovery deployment:

```text
AEKO_RESET_LEDGER=1
AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1
```

The Dokploy Compose passes `AEKO_RESET_LEDGER` to **both validator and RPC replica**, so their persistent ledgers cannot straddle two chains. `AEKO_BOOTSTRAP_ALLOW_MISSING_STATE` is deliberately separate and defaults to `0`; do not leave it enabled for ordinary redeploys. Return both switches to `0` after recovery.

## Social write/read split

```text
Write path
Aeko client/backend
  -> construct + sign transaction
  -> JSON-RPC sendTransaction
  -> validator/runtime
  -> native SocialFi program
  -> on-chain SocialFi state/proof

Read path
validator ledger
  -> RPC replica
  -> Explorer indexer
  -> PostgreSQL/indexed views
  -> Explorer REST
  -> Aeko backend/client
```

Large media, feed ranking, chat payloads, auth sessions and ordinary product data remain application/backend concerns. The chain owns the state/proofs that are explicitly implemented on-chain.

## Build model

There is one root [`Dockerfile`](./Dockerfile) with named runtime targets:

```text
validator
faucet
social-bootstrap
tools
explorer-api
explorer-ui
```

Examples:

```bash
docker build --target validator -t surdma/aeko-validator:latest .
docker build --target faucet -t surdma/aeko-faucet:latest .
docker build --target social-bootstrap -t surdma/aeko-social-bootstrap:latest .
docker build --target tools -t surdma/aeko-tools:latest .
docker build --target explorer-api -t surdma/aeko-explorer-api:latest .
docker build --target explorer-ui -t surdma/aeko-explorer-ui:latest .
```

`.github/workflows/build-images.yml` validates the deployment contracts and builds every target on pull requests. On `main`, it publishes both `latest` and a 12-character commit tag. Compatibility aliases remain temporarily available for `aeko-node` and `aeko-explorer-backend`.

Prefer immutable commit tags for controlled public releases and rollback.

## Local / portable deployment

[`docker-compose.yml`](./docker-compose.yml) is the portable local/testnet topology. It starts faucet, validator, automatic SocialFi bootstrap, Explorer API and Explorer UI. Validator RPC/WS are host-published for local convenience; the non-voting RPC replica is optional.

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

Optional local RPC replica:

```bash
docker compose --profile rpc up -d rpc-node
```

For a deliberate local chain reset use the repository helper:

```bash
./scripts/deploy-testnet.sh --reset-chain
```

## Dokploy / public deployment

[`docker-compose.dokploy.yml`](./docker-compose.dokploy.yml) is the image-only public deployment contract. It contains **no `build:` directive**. Every service references a Docker Hub image and uses `pull_policy: always`.

The always-running public topology is:

```text
faucet
validator
rpc-node
social-bootstrap
explorer-api
explorer-ui
```

`wallet-tools` is an optional `ops` profile, not a public daemon.

### Required Dokploy environment

```text
AEKO_PUBLIC_IP=<public IP of Dokploy host>
AEKO_KEYS_DIR=../files/aeko-keys
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended 12-character published main SHA>
```

Required persistent key files:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
rpc-node-keypair.json
```

Never commit those keypairs. Keep them in persistent restricted storage/File Mounts; do not depend on files inside an AutoDeploy Git checkout.

Optional SocialFi configuration:

```text
AEKO_TREASURY_ADDRESS=<pubkey>
AEKO_REWARD_VAULT=<pubkey>
AEKO_STAKE_VAULT=<pubkey>
AEKO_PLATFORM_FEE_BPS=200
```

### Dokploy network/routing

Set the Compose path to:

```text
./docker-compose.dokploy.yml
```

Dokploy's native **Domains** UI can inject Traefik routing, so the repository Compose does not hard-code platform labels. Configure:

```text
rpc.aeko.online   -> rpc-node:8899
ws.aeko.online    -> rpc-node:8900
api.aeko.online   -> explorer-api:8088
scan.aeko.online  -> explorer-ui:4000
```

Set `AEKO_PUBLIC_IP` to the externally reachable node address. Point `gossip.aeko.online` DNS directly to it and allow inbound TCP+UDP `8000-8050`. Gossip/validator transport is not an HTTP route and must not go through the Explorer/Traefik domain path.

Equivalent host-side Compose behavior:

```bash
docker compose -f docker-compose.dokploy.yml pull
docker compose -f docker-compose.dokploy.yml up -d
docker compose -f docker-compose.dokploy.yml ps
```

The GitHub deployment workflow calls the configured Dokploy webhook only after the image build succeeds on `main`. The Dokploy resource itself must be configured to use `docker-compose.dokploy.yml`; the webhook does not choose the topology.

## Create and use a wallet

You do not need the validator image just to create a wallet:

```bash
mkdir -p "$HOME/.aeko"

docker run --rm -it \
  -v "$HOME/.aeko:/wallet" \
  surdma/aeko-tools:latest \
  aeko-keygen new \
  --no-bip39-passphrase \
  --outfile /wallet/id.json
```

Get the address:

```bash
docker run --rm \
  -v "$HOME/.aeko:/wallet:ro" \
  surdma/aeko-tools:latest \
  aeko address --keypair /wallet/id.json
```

With the CLI installed locally:

```bash
aeko config set --url https://rpc.aeko.online
aeko address --keypair ~/.aeko/id.json
aeko balance <WALLET_ADDRESS>
```

## RPC examples

Health:

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

A healthy endpoint returns `result: "ok"`.

Slot:

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}'
```

Call it twice and verify the slot advances.

Balance:

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getBalance",
    "params":["<WALLET_ADDRESS>"]
  }'
```

Testnet airdrop is requested through RPC; faucet `:9900` remains private:

```bash
aeko airdrop 1 <WALLET_ADDRESS> --url https://rpc.aeko.online
```

## WebSocket / PubSub

Use:

```text
wss://ws.aeko.online
```

for chain subscriptions such as account, signature, slot and log notifications. WebSocket clients do not connect to `gossip.aeko.online`.

## Explorer and SocialFi registry

Humans use `https://scan.aeko.online`; applications can use `https://api.aeko.online` for indexed resources including blocks, transactions, accounts, posts, engagement, stakes and search.

Registry acceptance:

```bash
curl -s https://api.aeko.online/registry/social
```

Explorer uses a common response envelope. A ready deployment has the logical shape:

```json
{
  "data": {
    "posts": "<pubkey>",
    "rewards": "<pubkey>",
    "staking": "<pubkey>",
    "antiSpam": "<pubkey>",
    "monetization": "<pubkey>",
    "rewardVault": "<pubkey-or-null>",
    "treasury": "<pubkey-or-null>",
    "platformFeeBps": 200,
    "complete": true
  },
  "meta": {
    "network": "testnet",
    "source": "indexer"
  }
}
```

For public deployment, `data.complete == true` is a hard acceptance criterion, but it is not by itself proof of the signed write path.

## Aeko Social end-to-end acceptance

The Explorer site's Faucet/Test Console has a real browser path for signed social transactions. It creates test Ed25519 wallets, requests an airdrop, transfers AEKO, discovers SocialFi state, builds/signs an `AnchorPost`, submits it through RPC, creates a signed Like engagement transaction and reads state back from-chain.

Use this sequence before certifying a deployment:

1. RPC `getHealth == "ok"`.
2. `getSlot` advances.
3. `/registry/social` returns `data.complete == true`.
4. All five SocialFi state addresses are non-null.
5. Each state account exists, is initialized and has the expected SocialFi program owner.
6. Create a test wallet.
7. Request an airdrop and verify balance.
8. Submit a signed `AnchorPost`.
9. Confirm the transaction.
10. Read the post back from Social Posts state.
11. Submit and confirm a signed Like/engagement proof.
12. Query Explorer `/posts` and `/engagement`.
13. Verify the Explorer UI displays the resulting activity.

Automated deployment/read-path verification:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

The smoke script verifies RPC health, slot advancement, registry completeness, all five state-account owners/initialized markers and Explorer SocialFi reads. It intentionally does not fabricate a signed write transaction.

## Consumer, developer and operator responsibilities

A normal dApp/wallet developer primarily needs:

```text
RPC          https://rpc.aeko.online
WebSocket    wss://ws.aeko.online
Explorer API https://api.aeko.online
Explorer     https://scan.aeko.online
```

A validator operator additionally needs:

```text
gossip.aeko.online:8001
public validator TCP+UDP 8000-8050
```

Independent validators require separately provisioned identity/vote/stake state. They should not be faked as extra local voting containers without the required chain setup.

## What “ready” means

Use precise gates:

- **Build-ready**: deployment contracts parse and all Docker targets build.
- **Publish-ready**: main CI has pushed the selected Docker Hub tags.
- **Deploy-ready**: Dokploy has persistent keys, durable Explorer DB, domains/firewall and the production Compose configuration.
- **Integration-verified**: the deployed public RPC/Explorer SocialFi smoke passes.
- **Write-path verified**: a real signed SocialFi transaction succeeds and the resulting state is observable through chain/Explorer reads.
- **Mainnet/production mature**: requires decentralization, redundant RPC, monitoring, backups, security, capacity/load and incident-response work beyond this single-host reference stack.

A green Docker build is not evidence for the later states.

### Remaining SocialFi protocol-maturity work

Deployment completeness must not be used to hide protocol gaps that remain in the current implementation:

| Area | Current boundary |
| --- | --- |
| Canonical post payload signatures | the creator must sign the transaction and content/metadata hashes are anchored, but the chain does not yet independently verify a separate canonical post-payload Ed25519 signature referenced by `signature_ref` |
| Social staking | stake amount/lifecycle/cooldown/yield are recorded, but opening a social stake position does not yet atomically transfer/escrow the recorded lamports and yield claims remain accounting rather than a fully funded transfer path |
| Social monetization | tips/subscriptions/unlocks record the signed actor and amount, but the action does not yet atomically debit the actor's wallet; payout uses configured treasury accounting |
| Anti-spam | enforcement primitives exist, but bootstrap defaults to `ObserveOnly` with permissive thresholds rather than production economic gating |

Those are protocol-hardening items, not missing Docker services. The repository should not claim production-grade SocialFi economics or full Solana parity until those paths are enforced and independently tested on-chain.

## Solana relationship and public-network scope

AEKO uses a Solana-style validator/runtime/RPC/PubSub/network model, but container completeness is not Solana-scale operational maturity. A public network also needs independent validators, stake distribution, redundant RPC fleets, snapshot/bootstrap strategy, observability, rate limiting/abuse protection, backups, key custody, incident response and sustained adversarial/load testing.

`docker-compose.dokploy.yml` is the **complete single-host AEKO public testnet service topology and consumption contract**, not proof of decentralization or mainnet-grade Solana parity.

## Separate Aeko application backend

The product backend is deployed separately on `:4101`. It owns product concerns such as users/auth, application DB state, chat, feed/product orchestration and wallet/custody policy. It consumes AEKO through RPC/WS/Explorer interfaces.

Do not confuse:

```text
Explorer API :8088 = indexed blockchain read service in this repository
App backend  :4101 = separate Aeko product service
```

## Repository map

```text
runtime/src/builtins.rs               native program registration
programs/social-*                     SocialFi program logic/state/instructions
social-bootstrap/                     state initialization + registry
validator/                            validator executable and CLI
rpc/                                  JSON-RPC implementation
explorer-backend/                     indexer + REST API
web/                                  Explorer UI/test console
docker/validator-entrypoint.sh        validator/RPC container roles
Dockerfile                            canonical multi-target build
docker-compose.yml                    portable/local runtime
docker-compose.dokploy.yml            Docker Hub/Dokploy public runtime
scripts/deploy-testnet.sh             local deployment helper
scripts/smoke-aeko-social.py          live deployment/read-path smoke
scripts/validate-deployment-contract.py static deployment invariant gate
docs/                                 protocol/SDK/wallet/operations docs
DEPLOYMENT.md                         operator deployment contract
```

## License

MIT. See [`LICENSE`](./LICENSE).
