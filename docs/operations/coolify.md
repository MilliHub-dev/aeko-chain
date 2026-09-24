# Deploying AEKO with Coolify

This guide describes the current single-validator public testnet deployment. The canonical topology and acceptance criteria live in [`DEPLOYMENT.md`](../../DEPLOYMENT.md); this page focuses only on Coolify-specific setup.

## Deployment contract

Use the repository's image-only Coolify Compose file:

```text
./docker/compose.coolify.yml
```

Coolify does not build the AEKO Rust or web applications from source. It pulls the published images selected by `AEKO_IMAGE_REPOSITORY` and `AEKO_IMAGE_TAG`.

The default public services are below. `operations-web` serves both the public Funding Portal and authenticated Admin Console; `faucet` is the private Rust signer daemon:

```text
key-bootstrap (one shot) -> faucet -> validator -> social-bootstrap
                                      |-> protocol-bootstrap (mandatory one-shot initialize/verify)
                                      |-> explorer-api
explorer-ui + operations-web (independent liveness)
```

The validator owns public JSON-RPC/PubSub in this single-validator topology. The non-voting `rpc-node` remains an optional local/portable profile and is not part of the Coolify deployment.

## Required Coolify variables

Add these values in the application's **Environment Variables** section:

```text
AEKO_PUBLIC_IP=<public IP of the Coolify host>
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended immutable 12-character main SHA>
AEKO_PUBLIC_RPC_URL=<public JSON-RPC URL>
AEKO_PUBLIC_WS_URL=<public PubSub WebSocket URL>
AEKO_PUBLIC_EXPLORER_API_URL=<public Explorer REST API URL>
AEKO_PUBLIC_EXPLORER_URL=<public Explorer UI URL>
AEKO_PUBLIC_FUNDING_URL=<public Testnet Funding Portal URL>
AEKO_PUBLIC_ADMIN_URL=<public operator-console URL>
FUNDING_ALLOWED_ORIGINS=<comma-separated browser origins allowed to call funding>
ADMIN_PASSWORD=<operator password>
ADMIN_SESSION_SECRET=<16+ random characters>
FUNDING_GATEWAY_KEY=<server secret shared with validator>
FUNDING_CLIENT_API_KEY=<optional trusted app-backend key sent as x-funding-key>
```

Use the full template in [`docker/env.public.example`](../../docker/env.public.example) for optional storage, Explorer, SocialFi and logging settings.

Do not wrap Coolify environment values in shell quotes. The key directory is not an environment variable in the Coolify contract; it is deliberately fixed to the literal host path `/data/aeko/keys` so Coolify never parses `${...}` inside a volume source.

## Persistent keys

Coolify uses the fixed host directory `/data/aeko/keys`. The Compose stack includes a one-shot `key-bootstrap` service that validates the persistent identities before faucet startup. On an intentional first boot it may generate missing chain keypairs only when `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`; normal established-chain redeploys keep that flag at `0`. Existing non-empty keypair files are preserved and validated rather than replaced.

After the initial chain deployment, the persistent directory contains the four chain identities:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

`protocol-authority-keypair.json` is created automatically when no established protocol registry or continuity identity exists. On established deployments the same authority is required and verified rather than replaced.

You do not need to set `AEKO_KEYS_DIR` in the Coolify dashboard and you do not need to generate these files manually for a fresh chain. If this Coolify deployment is replacing an existing Dokploy/AEKO deployment, copy the **same existing validator/vote/stake/faucet keypairs** into this directory before deploying so the bootstrap preserves them. Replacing them changes validator/faucet identity and can make the persisted ledger unusable for the intended chain. Generate new keys only when intentionally creating a fresh chain identity.

For a fresh chain, no host-side key command is required. After the first successful deployment, you may inspect `/data/aeko/keys` on the Coolify host if you want to back up the generated identities. Never commit keypairs or place them in a disposable Git checkout.

The Coolify Compose mounts this directory with long-form bind syntax and the literal source `/data/aeko/keys`. Runtime services mount it read-only; the optional `wallet-tools` profile can mount it read-write for explicit operator work. This is intentional: the current Coolify volume validator rejects `${...}` interpolation in a bind source.

## Persistent chain state

The Coolify contract declares five Docker-managed named volumes:

- `validator-ledger` for validator ledger/accounts/snapshots.
- `social-state` for SocialFi state keypairs and `social-registry.env`.
- `protocol-state` for the published `protocol-registry.env`.
- `protocol-continuity` for canonical protocol state/custody keypairs and the independent registry continuity anchor.
- `admin-state` for the funding policy and grant ledger of the operations web app (admin.aeko.online / fund.aeko.online).

Normal redeploys must preserve all five volumes. The two protocol volumes form one continuity boundary: losing `protocol-state` while retaining `protocol-continuity` requires explicit recovery and reuses the same canonical addresses; losing `protocol-continuity` must not be treated as a fresh bootstrap. Social and Protocol registries are bound to the live genesis and the bootstrap volumes also carry durable lifecycle metadata. Do not remove `.aeko-bootstrap-in-progress` or `.aeko-chain-binding` manually.

For a deliberate fresh-genesis reset, set `AEKO_RESET_LEDGER=1`. That single reset signal is propagated through key bootstrap/preflight to the validator, Aeko Social, AEKO Protocol, and Explorer. Social/Protocol persist the replacement genesis as reset-in-progress before canonical recreation and mark it complete only after verification. If deployment is interrupted, the next run resumes from that marker even after the environment flag is returned to `0`. Key preflight still validates the persistent chain identities, but it deliberately ignores the old Protocol registry/continuity binding because those volumes are reset targets.

## Domains and ports

Configure Coolify domains against these internal services:

| Public endpoint | Service | Container port |
| --- | --- | ---: |
| `https://rpc.aeko.online` | `validator` | `8899` |
| `wss://ws.aeko.online` | `validator` | `8900` |
| `https://api.aeko.online` | `explorer-api` | `8088` |
| `https://scan.aeko.online` | `explorer-ui` | `4000` |
| `https://fund.aeko.online` | `operations-web` | `3001` (Testnet Funding Portal) |
| `https://admin.aeko.online` | `operations-web` | `3001` (operator console) |

Do not configure `gossip.aeko.online` as an HTTP route. Point that DNS record directly to `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. Gossip starts on `8001` inside that range.

Keep the Faucet Daemon on TCP `9900` and PostgreSQL `5432` private.

### Explorer API routing guard

`AEKO_PUBLIC_EXPLORER_API_URL` must resolve to the public route for `explorer-api:8088`; it must not be the Explorer UI route. The UI and API are separate services even when Coolify or Dokploy manages both behind the same proxy.

For the documented hostnames:

```text
AEKO_PUBLIC_EXPLORER_API_URL=https://api.aeko.online   -> explorer-api:8088
AEKO_PUBLIC_EXPLORER_URL=https://scan.aeko.online      -> explorer-ui:4000
```

If the Explorer shows `Indexer returned non-JSON (200)` followed by the AEKO page title, the API hostname/path is serving the SPA HTML. Fix the Coolify/Dokploy domain target; do not add a JSON fallback in the frontend.

## First deployment

1. Create a Git-based Docker Compose application in Coolify and select this repository/branch.
2. Set the Compose path to `./docker/compose.coolify.yml`.
3. Add the required environment variables above, without shell quotes. Do not add `AEKO_KEYS_DIR`.
4. Configure the four HTTP/WebSocket domains.
5. Open TCP+UDP `8000-8050` for validator transport.
6. For a genuinely fresh chain only, temporarily set `AEKO_REQUIRE_EXISTING_LEDGER=0` and `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`. For an established chain, keep `AEKO_REQUIRE_EXISTING_LEDGER=1` and `AEKO_ALLOW_CHAIN_KEY_GENERATION=0`.
7. Deploy. After a fresh-chain deployment has created the intended identities and genesis, return the one-time flags to their safe established-chain values.

The Coolify stack uses `key-bootstrap` as a one-shot validator/initializer. It creates missing persistent chain keypairs only under the explicit first-boot flag and exits successfully; the faucet then starts, followed by the validator. Existing key files are never overwritten. `social-bootstrap` remains a one-shot initializer; successful completion is `Exited (0)`, which is an expected completed state rather than an unhealthy long-running service. `wallet-tools` is an opt-in `ops` profile and is not part of the default deployment.

## Acceptance

Do not certify the deployment from container status alone.

RPC health:

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

The result must be `"ok"`, and repeated `getSlot` calls must advance.

Then check the three Explorer health layers and both control planes:

```bash
curl -s https://api.aeko.online/liveness
curl -s https://api.aeko.online/readiness
curl -s https://api.aeko.online/network/readiness
curl -s https://api.aeko.online/registry/social
curl -s https://api.aeko.online/social/status
curl -s https://api.aeko.online/registry/protocol
curl -s https://api.aeko.online/protocol/status
```

Final acceptance requires `/network/readiness` HTTP 200, the registry genesis matching the live validator genesis, Social `5/5`, Protocol executable programs `11/11`, and Protocol canonical state `8/8`. For the full read-path smoke test:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

The signed browser write path in the Explorer test console remains the final end-to-end check.

## Volume parsing failures

If Coolify reports an error such as `Invalid Docker volume definition` or `Invalid volume source` before containers start:

1. Confirm the application uses `./docker/compose.coolify.yml`, not the Dokploy or retired Compose path.
2. Confirm every key bind source in the selected Compose is the literal `/data/aeko/keys` path with no `${...}` interpolation.
3. Reload the Compose definition in Coolify and redeploy. The `key-bootstrap` service owns first-boot creation of the persistent key directory and missing keypairs.

Do not replace the Coolify bind mounts with any `${...}` volume-source form, including the Dokploy `${VAR:?message}` pattern. The separate Coolify contract uses a literal host path specifically to satisfy Coolify's storage parser.


## Key troubleshooting

The reusable `docker/key-preflight.sh` helper uses exit 64 for missing/empty required keys and exit 65 for invalid keypair content. Coolify runs the same implementation through the one-shot `key-bootstrap` service, and the faucet intentionally waits for that service to complete successfully. If the faucet or validator fails because a key is unavailable, inspect the fixed host directory directly:

```bash
sudo ls -la /data/aeko/keys
sudo test -s /data/aeko/keys/faucet-keypair.json
sudo test -s /data/aeko/keys/stake-keypair.json
sudo test -s /data/aeko/keys/validator-1-keypair.json
sudo test -s /data/aeko/keys/vote-1-keypair.json
```

Preserve the existing identities when continuing an existing chain; do not regenerate keys merely to make container status green.

## AEKO Protocol lifecycle

AEKO Protocol is mandatory on new networks. Fresh genesis creation activates its runtime feature accounts automatically, and the one-shot `protocol-bootstrap` service runs idempotently on every deployment. There is no normal `AEKO_PROTOCOL_BOOTSTRAP_ENABLED` or protocol-state initialization switch.

The shared key preflight creates `protocol-authority-keypair.json` automatically when no established protocol registry or continuity anchor exists. Once protocol identity exists, a missing or mismatched authority remains fatal.

`AEKO_RESET_LEDGER=1` is a destructive new-chain operation. On that reset, SocialFi state and protocol state are cleared once for the new genesis, and Explorer purges the old PostgreSQL projection schema before binding to the replacement genesis. Return the reset variable to `0` after accepting the new chain.

The feature-activation helper remains only for a history-preserving migration of an older chain whose genesis predates the AEKO Protocol builtins. It is not part of normal fresh deployment or reset-to-genesis deployment. The complete compatibility and acceptance procedure is consolidated in [`DEPLOYMENT.md`](../../DEPLOYMENT.md).

## Established-chain continuity guard

Public deployments now fail closed instead of silently creating a replacement chain when persistent storage is missing.

For every normal redeploy of an established chain keep:

```text
AEKO_RESET_LEDGER=0
AEKO_REQUIRE_EXISTING_LEDGER=1
AEKO_ALLOW_CHAIN_KEY_GENERATION=0
```

With those settings:

- if the mounted validator storage does not contain `/ledger/genesis.bin`, the validator exits before running `aeko-genesis`;
- if any validator, vote, stake, or faucet key is missing from `/data/aeko/keys`, Coolify key bootstrap exits instead of creating a replacement identity;
- if `protocol-registry.env` exists but the protocol-authority key is missing, bootstrap exits instead of replacing the established authority.

For the **first-ever genesis only**, set `AEKO_REQUIRE_EXISTING_LEDGER=0`. If Coolify is also responsible for creating the four chain keys, temporarily set `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`. The protocol authority is created automatically when no established protocol identity exists. Return the two chain-lifecycle switches to their safe normal values immediately after intentional first-time chain creation.

An intentional `AEKO_RESET_LEDGER=1` remains an explicit destructive action and bypasses the existing-ledger guard for that reset. Never use it to recover from an unknown or changed volume mount.

### Verify the 300 GB storage before changing mounts

A larger attached disk does not automatically move Docker named volumes onto it. On the host, first identify the exact live validator mount and Docker data root:

```bash
V=$(docker ps --filter name=validator --format '{{.Names}}' | head -1)

docker inspect "$V" \
  --format '{{range .Mounts}}{{if eq .Destination "/ledger"}}{{println .Type .Name .Source "->" .Destination}}{{end}}{{end}}'

docker exec "$V" sh -lc 'test -s /ledger/genesis.bin && echo "genesis.bin: PRESENT"; df -h /ledger; du -sh /ledger 2>/dev/null || true'

DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}')
echo "Docker root: $DOCKER_ROOT"
df -h "$DOCKER_ROOT"
docker volume ls | grep validator-ledger || true
```

If the reported Docker root or the actual volume source already resides on the 300 GB filesystem, leave the ledger mount unchanged. If it does not, stop the chain and migrate the **existing** ledger volume or Docker data root using the host/provider storage procedure. Verify the copied `genesis.bin`, genesis hash, validator key identities, and ledger size before pointing Compose at the migrated storage.

Do not create a new empty volume with the desired name and call that a migration. The continuity guard is intentionally designed to make that mistake fail instead of silently starting a new chain.
