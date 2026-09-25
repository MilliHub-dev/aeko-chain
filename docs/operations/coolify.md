# Deploying AEKO with Coolify

This guide describes the current single-validator public testnet deployment. The canonical topology and acceptance criteria live in [`DEPLOYMENT.md`](../../DEPLOYMENT.md); this page focuses only on Coolify-specific setup.

## Deployment contract

Coolify now has two deployment contracts:

| Contract | Purpose |
| --- | --- |
| docker/coolify/*/compose.yml | preferred split resources; validator, Explorer API/UI and Operations Web can be deployed independently |
| docker/compose.coolify.yml | compatibility contract for the existing all-in-one resource and rollback during migration |

For new Coolify resources, create one Git-based Docker Compose application per
folder under docker/coolify and select that folder's compose.yml. Do not point
every resource at docker/compose.coolify.yml.

The split files pull the same published images as the legacy contract. They do
not build Rust or web source on the Coolify host. Each resource has its own
.env.example and has no Compose depends_on relationship to another resource.

Cross-resource traffic must use explicit private endpoints. Service-name
defaults such as validator:8899, faucet:9900 and explorer-api:8088 only work
inside the old monolithic Compose project and are intentionally absent from the
split contracts.

The validator is now a true independent deployment unit. Updating Aeko Scan,
the Explorer API or Operations Web does not require Coolify to recreate the
validator resource.

See docker/coolify/README.md for the resource map, migration order and
established-chain storage safeguards.

## Required Coolify variables

Do not use one giant shared Coolify environment for the split topology. Each
resource owns only the variables documented in its adjacent .env.example.

Common image/logging variables are:

~~~text
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended immutable 12-character main SHA>
AEKO_LOG_MAX_SIZE=10m
AEKO_LOG_MAX_FILES=3
~~~

Important cross-resource values are configured only on consumers:

~~~text
# validator
AEKO_PUBLIC_IP=<validator public IP>
AEKO_INTERNAL_FAUCET_ADDRESS=<private-faucet-host>:9900

# Social bootstrap / Protocol bootstrap / Explorer API / Operations Web
AEKO_INTERNAL_RPC_URL=http://<private-validator-host>:8899

# Explorer UI / Operations Web
AEKO_INTERNAL_EXPLORER_API_URL=http://<private-explorer-api-host>:8088
~~~

Explorer API additionally owns EXPLORER_DATABASE_URL and its Explorer settings
token. Explorer UI owns public browser RPC/WS URLs. Operations Web owns its
admin credentials. Bootstrap and validator tunables remain local to their
corresponding resources.

Coolify values should be entered without shell quotes. The split contracts do
not use env_file, so an uncommitted .env file is never a runtime dependency.

The persistent host paths are also not environment variables. They are literal
/data/aeko/** bind sources so Coolify can validate storage before containers
start.

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

Both Coolify contracts use literal bind sources. The legacy monolith fixes `/data/aeko/keys`; the split resources also fix their state directories under `/data/aeko/**`. No split bind `source:` contains `${...}` interpolation. Runtime consumers mount key/registry data read-only where possible, while explicit operator/bootstrap jobs receive only the write access they require. This is intentional because the current Coolify volume validator rejects interpolation in bind sources.

## Persistent chain state

The legacy monolithic contract uses Docker-managed named volumes. The split
contract deliberately uses stable host paths so moving a service into another
Coolify resource cannot silently create a fresh project-scoped volume:

- /data/aeko/validator-ledger for validator ledger/accounts/snapshots.
- /data/aeko/social-state for SocialFi state keypairs, lifecycle markers and social-registry.env.
- /data/aeko/protocol-state for protocol-registry.env and Protocol lifecycle state.
- /data/aeko/protocol-continuity for canonical Protocol custody/state keypairs and continuity anchor.
- /data/aeko/keys for chain and Protocol authority key material.

For an established chain, copy the contents of the current named volumes into
these fixed paths before starting the corresponding split resource. Preserve
ownership, modes and hidden lifecycle metadata. Keep
AEKO_REQUIRE_EXISTING_LEDGER=1 and AEKO_ALLOW_CHAIN_KEY_GENERATION=0 during
migration.

The two Protocol paths remain one continuity boundary. Losing continuity must
never be treated as a fresh bootstrap. Social and Protocol registries remain
bound to the live genesis.

An operator may mount dedicated block storage at
/data/aeko/validator-ledger. This is intentionally outside the container
definition: the validator only requires that the host path is durable and
contains the established ledger.

For the complete migration sequence and remote-Explorer registry override
contract, use docker/coolify/README.md.

## Domains and ports

Configure Coolify domains against these internal services:

| Public endpoint | Service | Container port |
| --- | --- | ---: |
| `https://rpc.aeko.online` | `validator` | `8899` |
| `wss://ws.aeko.online` | `validator` | `8900` |
| `https://scan.aeko.online` | `explorer-ui` | `4000` |
| `https://admin.aeko.online` | `operations-web` | `3001` (operator console) |

Do not configure `gossip.aeko.online` as an HTTP route. Point that DNS record directly to `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. Gossip starts on `8001` inside that range.

Keep the Faucet Daemon on TCP `9900` and PostgreSQL `5432` private.

### Explorer backend privacy

Do not configure a public domain for `explorer-api:8088`. The Explorer UI serves indexed reads from its own origin under `/api/explorer/testnet/*` and proxies them over the private Docker network using `AEKO_INTERNAL_EXPLORER_API_URL`.

For the documented hostname:

```text
https://scan.aeko.online/api/explorer/testnet/* -> explorer-ui:4000 -> explorer-api:8088
```

The browser never receives the raw Explorer backend origin. The proxy accepts read-only methods and keeps backend routing inside the deployment network.

## First deployment

For the split topology, create separate Coolify applications using these
Compose paths:

1. docker/coolify/key-bootstrap/compose.yml
2. docker/coolify/faucet/compose.yml
3. docker/coolify/validator/compose.yml
4. docker/coolify/social-bootstrap/compose.yml
5. docker/coolify/protocol-bootstrap/compose.yml
6. docker/coolify/explorer-api/compose.yml
7. docker/coolify/explorer-ui/compose.yml
8. docker/coolify/operations-web/compose.yml

wallet-tools is an optional operator job at
docker/coolify/wallet-tools/compose.yml.

For an established chain, do not deploy the split validator until the current
ledger has been copied to /data/aeko/validator-ledger. Keep first-boot key and
ledger guards in their fail-closed state.

For a genuinely new chain, run Key bootstrap with
AEKO_ALLOW_CHAIN_KEY_GENERATION=1, start Faucet, then start Validator with
AEKO_REQUIRE_EXISTING_LEDGER=0. After the intended identities/genesis exist,
return both flags to their established-chain values before future redeploys.

Social and Protocol bootstrap remain one-shot jobs. Exited (0) is expected
success. They no longer use Compose depends_on, so run them after the validator
is healthy. Explorer UI and Operations Web can then be deployed or updated
without restarting the validator or Explorer API.

The legacy docker/compose.coolify.yml flow remains valid until you intentionally
migrate; merging this repository change alone does not alter a configured
Coolify resource's Compose path.

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
curl -s https://scan.aeko.online/api/explorer/testnet/liveness
curl -s https://scan.aeko.online/api/explorer/testnet/readiness
curl -s https://scan.aeko.online/api/explorer/testnet/network/readiness
curl -s https://scan.aeko.online/api/explorer/testnet/registry/social
curl -s https://scan.aeko.online/api/explorer/testnet/social/status
curl -s https://scan.aeko.online/api/explorer/testnet/registry/protocol
curl -s https://scan.aeko.online/api/explorer/testnet/protocol/status
```

Final acceptance requires `/network/readiness` HTTP 200, the registry genesis matching the live validator genesis, Social `5/5`, Protocol executable programs `11/11`, and Protocol canonical state `8/8`. For the full read-path smoke test:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://scan.aeko.online/api/explorer/testnet \
python3 scripts/smoke-aeko-social.py
```

The signed browser write path in the Explorer test console remains the final end-to-end check.

## Volume parsing failures

If Coolify reports an error such as `Invalid Docker volume definition` or `Invalid volume source` before containers start:

1. Confirm the application uses the intended docker/coolify/<resource>/compose.yml path, or the legacy docker/compose.coolify.yml only when intentionally using the monolith.
2. Confirm every bind source is a literal /data/aeko/** path with no environment interpolation.
3. Verify the required host directory/state exists before redeploying. Key bootstrap owns first-boot chain-key creation; it does not recreate an established ledger or bootstrap registry.

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
