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
.env.example. Cross-resource lifecycle is independent; only the three services
inside the bootstrap resource use Compose ordering, so Social/Protocol wait for
the co-located key preflight.

Cross-resource traffic must use explicit private endpoints. Service-name
defaults such as validator:8899, faucet:9900 and explorer-api:8088 only work
inside the old monolithic Compose project and are intentionally absent from the
split contracts.

The validator is now a true independent deployment unit. Updating Aeko Scan,
the Explorer API or Operations Web does not require Coolify to recreate the
validator resource.

See docker/coolify/README.md for the resource map, migration order and
established-chain storage safeguards.

## Auto-deploy isolation

Creating separate Coolify applications is only half of validator isolation.
A Git-connected application can still redeploy on every matching repository
webhook.

For production, disable Auto Deploy on Validator, the bootstrap resource and
normally faucet-tools. Keep Validator on an immutable AEKO_IMAGE_TAG and
promote it only when a validator release is intentional.

For Explorer API, Explorer UI and Operations Web, either use the same explicit
promotion model or configure Coolify Watch Paths so only changes relevant to
that application trigger deployment. Coolify stores these settings on the
application rather than in the Compose YAML.

When split resources on the same Coolify destination need private
cross-resource communication, Connect To Predefined Network can attach them to
the destination network. Continue to set AEKO_INTERNAL_* endpoints explicitly
after verifying the actual attached hostname.

For resources on different servers, use private routed networking or a
VPN/overlay. Faucet, Validator RPC/WS and Explorer API default their host-port
bindings to 127.0.0.1. Change the corresponding *_BIND_IP only to a private/VPN
interface when cross-server access is required, and restrict those ports with
host/cloud firewall rules. Do not expose Faucet 9900 or Explorer API 8088 to the
public Internet.

The recommended resource settings and Watch Paths examples are in
docker/coolify/README.md.

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

# bootstrap / Explorer API / Operations Web
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

Coolify uses the fixed host directory `/data/aeko/keys` wherever a resource needs chain key material. In the split topology the one-shot `key-bootstrap` service lives inside `docker/coolify/bootstrap/compose.yml`; it is no longer a startup dependency of the Faucet or Validator resources. On an intentional first boot it may generate missing chain keypairs only when `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`; normal established-chain runs keep that flag at `0`. Existing non-empty keypair files are preserved and validated rather than replaced.

After the initial chain deployment, the persistent directory contains the four chain identities:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

`protocol-authority-keypair.json` is created automatically when no established protocol registry or continuity identity exists. On established deployments the same authority is required and verified rather than replaced.

You do not need to set `AEKO_KEYS_DIR` in the Coolify dashboard and you do not need to generate these files manually for a fresh chain. If this Coolify deployment is replacing an existing Dokploy/AEKO deployment, copy the **same existing validator/vote/stake/faucet keypairs** into this directory before deploying so the bootstrap preserves them. Replacing them changes validator/faucet identity and can make the persisted ledger unusable for the intended chain. Generate new keys only when intentionally creating a fresh chain identity.

For a fresh chain, run the `key-bootstrap` service first, then bring up Faucet and Validator, then run the full bootstrap resource after Validator RPC is healthy. If these resources are on different Ubuntu hosts, remember that the same `/data/aeko/keys` path is host-local; provision only the required key files to each host through your secure custody process. Never commit keypairs or place them in a disposable Git checkout.

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

Do not configure a public domain for `explorer-api:8088`. The Explorer UI serves indexed reads from its own origin under `/api/explorer/testnet/*` and proxies them to the server-side endpoint configured by `AEKO_INTERNAL_EXPLORER_API_URL`. That endpoint may be on the same Coolify network or on another private/VPN-reachable host.

For the documented hostname:

```text
https://scan.aeko.online/api/explorer/testnet/* -> explorer-ui:4000 -> explorer-api:8088
```

The browser never receives the raw Explorer backend origin. The proxy accepts read-only methods; the server-side route may cross hosts, but it should remain private rather than being exposed as a browser-facing Explorer API origin.

## First deployment

For the split topology, create six separate Coolify applications:

1. `docker/coolify/bootstrap/compose.yml`
2. `docker/coolify/faucet-tools/compose.yml`
3. `docker/coolify/validator/compose.yml`
4. `docker/coolify/explorer-api/compose.yml`
5. `docker/coolify/explorer-ui/compose.yml`
6. `docker/coolify/operations-web/compose.yml`

`wallet-tools` is already inside `faucet-tools` under the `ops` profile, so
it does not need another Coolify application.

For an established chain:

1. migrate the existing named-volume contents to the matching fixed
   `/data/aeko/**` paths;
2. keep `AEKO_REQUIRE_EXISTING_LEDGER=1`,
   `AEKO_ALLOW_CHAIN_KEY_GENERATION=0`, and `AEKO_RESET_LEDGER=0`;
3. deploy `faucet-tools`;
4. deploy `validator` and verify RPC health/slot advancement;
5. deploy `bootstrap`; key preflight runs first, then Social and Protocol may
   run in parallel against the explicit `AEKO_INTERNAL_RPC_URL`;
6. deploy Explorer API, Explorer UI and Operations Web independently.

For a genuinely new chain, key generation is a two-stage bootstrap lifecycle.
Run `key-bootstrap` with `AEKO_ALLOW_CHAIN_KEY_GENERATION=1` before first
Validator genesis. Then start Faucet and Validator with
`AEKO_REQUIRE_EXISTING_LEDGER=0`. Return the first-boot flags to their safe
values and deploy/redeploy the full `bootstrap` resource after Validator RPC
is healthy.

All three bootstrap services are one-shot. `Exited (0)` is expected success.
Only Social and Protocol have an internal Compose dependency, and it points to
`key-bootstrap`, not to Validator. Validator connectivity is always through
the configured reachable RPC URL.

The legacy `docker/compose.coolify.yml` flow remains valid until you
intentionally migrate; merging this repository change alone does not alter a
configured Coolify resource's Compose path.

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
