# AEKO deployment topology

This is the operator contract for deploying AEKO Chain. For the developer/runtime mental model, start with [`README.md`](README.md).

## Deployment invariants

1. AEKO is a multi-service network, not an "everything" container.
2. The root `Dockerfile` is the canonical build definition and publishes role-specific images.
3. `docker-compose.yml` is the portable/local topology.
4. `docker-compose.dokploy.yml` is the public Dokploy topology and contains only pre-built Docker Hub images.
5. Wallets are signers/keypairs, not network daemons.
6. PubSub/WebSocket is served by validator/RPC on port `8900`; there is no separate WebSocket node.
7. Public application RPC traffic belongs on the non-voting RPC replica, not the block producer.
8. SocialFi bootstrap is part of normal deployment and is idempotent when its state volume is preserved.

## Runtime images

| Runtime role | Docker image | Purpose |
| --- | --- | --- |
| Validator | `surdma/aeko-validator` | Voting block producer, ledger, consensus, validator networking |
| RPC replica | `surdma/aeko-validator` | Same executable with `AEKO_NODE_ROLE=rpc` / `--no-voting` |
| Faucet | `surdma/aeko-faucet` | Internal testnet faucet |
| Social bootstrap | `surdma/aeko-social-bootstrap` | One-shot initialization of five SocialFi state accounts |
| Operator/wallet tools | `surdma/aeko-tools` | `aeko` CLI and `aeko-keygen` |
| Explorer API | `surdma/aeko-explorer-api` | Rust indexer and REST API |
| Explorer UI | `surdma/aeko-explorer-ui` | Browser explorer |

Compatibility aliases `surdma/aeko-node` and `surdma/aeko-explorer-backend` are temporarily published by CI, but new deployment definitions should use the canonical names above.

## Image publication lifecycle

Pull requests run `.github/workflows/build-images.yml` and build every Docker target without publishing images.

After a commit lands on `main`, the workflow publishes:

```text
surdma/<image>:latest
surdma/<image>:<12-char-git-sha>
```

A Dokploy deployment that references a new canonical image/tag cannot succeed until the corresponding `main` image-publish run has completed successfully.

For rollback safety, set `AEKO_IMAGE_TAG` to the immutable 12-character main commit tag rather than relying on `latest`.

## Key material

Required for the public Dokploy stack:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
rpc-node-keypair.json
```

These files must persist across deployments and must never be committed to the repository.

For local generation with the published tools image:

```bash
mkdir -p local-testnet
for name in validator-1-keypair vote-1-keypair stake-keypair faucet-keypair rpc-node-keypair; do
  docker run --rm \
    -v "$PWD/local-testnet:/keys" \
    surdma/aeko-tools:latest \
    aeko-keygen new --no-bip39-passphrase --silent --outfile "/keys/${name}.json"
done
```

For Dokploy, place the files in a persistent mount location and set `AEKO_KEYS_DIR` to that directory. `../files/aeko-keys` is the recommended project-level pattern. Do not depend on key files living inside the Git checkout because AutoDeploy replaces the checkout during deployments.

## Persistent data

The Compose stack uses named volumes for:

```text
validator-ledger
rpc-ledger
social-state
```

Do not delete `validator-ledger` or set `AEKO_RESET_LEDGER=1` unless you intentionally want a fresh genesis.

`social-state` contains the generated SocialFi state keypairs and `social-registry.env`. Preserve it across redeployments so bootstrap remains stable and idempotent.

The Explorer must use persistent PostgreSQL in public deployments:

```text
EXPLORER_DATABASE_URL=postgres://...
```

Provision PostgreSQL as a Dokploy database/resource or another managed PostgreSQL service.

## Portable/local deployment

```bash
export AEKO_KEYS_DIR="$PWD/local-testnet"
export EXPLORER_DATABASE_URL='postgres://...'
docker compose up -d
```

The default portable stack starts:

```text
faucet
validator
social-bootstrap
explorer-api
explorer-ui
```

The optional RPC replica can be added with:

```bash
docker compose --profile rpc up -d rpc-node
```

## Dokploy public deployment

Use `docker-compose.dokploy.yml` as the Compose path.

It intentionally has no `build:` directives. Each service uses the Docker Hub image plus `pull_policy: always`, so Dokploy is a deploy host rather than a second compilation environment.

### Required Dokploy environment

```text
AEKO_PUBLIC_IP=<public address of the Dokploy host>
AEKO_KEYS_DIR=../files/aeko-keys
EXPLORER_DATABASE_URL=<persistent PostgreSQL connection string>
AEKO_IMAGE_TAG=<recommended published 12-char main commit SHA>
```

Optional chain/SocialFi values include:

```text
AEKO_RESET_LEDGER=0
AEKO_EXPLORER_NETWORK=testnet
AEKO_EXPLORER_START_SLOT=0
AEKO_TREASURY_ADDRESS=
AEKO_REWARD_VAULT=
AEKO_STAKE_VAULT=
AEKO_PLATFORM_FEE_BPS=200
```

Empty SocialFi state-address overrides are normal. `social-bootstrap` generates the canonical registry automatically and Explorer consumes it from the shared read-only `social-state` volume.

### Public endpoint routing

Configure domains in Dokploy's **Domains** UI rather than hard-coding Traefik labels in the repository:

| Domain | Service | Container port |
| --- | --- | ---: |
| `rpc.aeko.online` | `rpc-node` | 8899 |
| `ws.aeko.online` | `rpc-node` | 8900 |
| `api.aeko.online` | `explorer-api` | 8088 |
| `scan.aeko.online` | `explorer-ui` | 4000 |

Use Dokploy's Preview Compose view before deployment to verify its injected routing/network configuration.

### Validator networking

Validator networking is not HTTP routing.

AEKO's network utility defines the general validator port range as `8000-10000`, and the validator CLI supports `--dynamic-port-range`. The Dokploy stack deliberately constrains the public bootstrap validator to `8000-8050`, which is comfortably above the validator's minimum required range width, and publishes the same ports TCP and UDP.

Set:

```text
AEKO_PUBLIC_IP=<server public address>
```

The validator entrypoint passes this as `--gossip-host` and uses:

```text
--gossip-port 8001
--dynamic-port-range 8000-8050
```

Infrastructure requirements:

```text
gossip.aeko.online -> DNS A/AAAA -> AEKO_PUBLIC_IP
allow inbound TCP 8000-8050
allow inbound UDP 8000-8050
```

Do not configure `gossip.aeko.online` as an Explorer website or ordinary HTTP route.

### Startup dependency graph

```text
faucet
  |
validator (health + advancing chain)
  | \
  |  \-> rpc-node (non-voting public RPC/PubSub)
  |
  \----> social-bootstrap (one-shot, idempotent)
              |
              +--> social-state/social-registry.env

rpc-node healthy + social-bootstrap successful
              |
              v
         explorer-api
              |
              v
         explorer-ui
```

Explorer uses `http://rpc-node:8899` in the Dokploy stack so indexing does not add public read load to the block-producing validator.

## SocialFi bootstrap behavior

The five SocialFi programs are native builtins registered in `runtime/src/builtins.rs`:

```text
social-posts
social-rewards
social-staking
social-anti-spam
social-monetization
```

`aeko-social-bootstrap` creates one persistent state account per program and initializes it with the matching native instruction. On later deployments it verifies persisted accounts and skips already initialized program-owned state rather than sending Initialize again.

The generated registry includes the five state accounts plus treasury/reward-vault/platform-fee values used by Explorer and consuming services.

Explorer exposes it at:

```text
GET /registry/social
```

`complete: true` means all five state addresses are resolved by the registry. It does not by itself prove every social write path; use the smoke and write-path tests described below.

## Wallet/operator tooling

Do not run a permanent "wallet node". A wallet is a private key/signer controlled by a client, operator, HSM/secret manager, or application custody service.

The Dokploy Compose includes an optional `wallet-tools` profile backed by `surdma/aeko-tools`. It is operator tooling only and is not part of the always-running public service graph.

## Aeko Social consumption contract

The separate application backend should consume:

```text
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_EXPLORER_URL=https://api.aeko.online
```

The old `gossip.aeko.online/explorer` value is not the Explorer API endpoint and should not be used in new deployments.

Social registry discovery:

```text
GET https://api.aeko.online/registry/social
```

The chain stack does not own application auth, feeds, chat persistence, media storage, or custody policy. Those belong to the Aeko application/backend layer.

## Verification gates

After deployment, run:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

The script verifies:

- RPC `getHealth=ok`;
- slot advancement;
- Explorer health;
- complete SocialFi registry;
- all five SocialFi state accounts exist;
- each state account has the expected owner and initialized marker;
- Explorer `/posts`, `/engagement`, and `/stakes` read routes respond.

This is deployment/read-path verification. Before declaring the SocialFi write path production-verified, also submit at least one real signed Aeko Social transaction through the public RPC endpoint and observe its canonical on-chain/indexed result.

## Release-readiness levels

Use precise language:

- **Build-ready**: all Docker targets build.
- **Publish-ready**: main CI has pushed the selected Docker Hub image tags.
- **Deploy-ready**: Compose configuration, required secrets/mounts, database and firewall/domain routing are present.
- **Integration-verified**: smoke test passes against the deployed public endpoints.
- **Write-path verified**: a signed SocialFi transaction succeeds end-to-end and its result is observable.
- **Mainnet/production mature**: requires additional decentralization, redundancy, monitoring, backup, security, load and incident-response work beyond a single-host Dokploy stack.

A green image build alone is not sufficient evidence for the later states.
