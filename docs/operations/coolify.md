# Deploying AEKO with Coolify

This guide describes the current single-validator public testnet deployment. The canonical topology and acceptance criteria live in [`DEPLOYMENT.md`](../../DEPLOYMENT.md); this page focuses only on Coolify-specific setup.

## Deployment contract

Coolify now has two deployment contracts:

| Contract | Purpose |
| --- | --- |
| infrastructure `docker/coolify/*/compose.yml` plus app-owned `apps/**/compose.coolify.yml` | preferred split resources; each deployable application owns its Compose and `.env.coolify.example` beside its source |
| docker/compose.coolify.yml | compatibility contract for the existing all-in-one resource and rollback during migration |

For new Coolify resources, create one Git-based Docker Compose application per
resource. Infrastructure uses `docker/coolify/<resource>/compose.yml`; Explorer
API, Scan, and Operations Web use the app-owned paths below and the adjacent
`.env.coolify.example`. Do not point
every resource at docker/compose.coolify.yml.

The split files pull the same published images as the legacy contract. They do
not build Rust or web source on the Coolify host. Each resource has its own
.env.example. The Bootstrap resource contains four services: key preflight,
Social bootstrap, Protocol bootstrap, and the read-only registry HTTP service.

Cross-resource traffic uses canonical network service names rather than Docker
service DNS or sample private IPs. Testnet consumers use
`rpc.aeko.online`, `ws.aeko.online`, `api.aeko.online`,
`registry.aeko.online`, and `faucet.aeko.online:9900`. The resources may
therefore live on different Ubuntu instances or different Coolify
installations.

The validator is now a true independent deployment unit. Updating Aeko Scan,
the Explorer API or Operations Web does not require Coolify to recreate the
validator resource.

See docker/coolify/README.md for the resource map, migration order and
established-chain storage safeguards.

## Auto-deploy isolation

Creating separate Coolify applications is only half of validator isolation.
The GitHub release workflow now deploys five resources independently after
validated image promotion; there is no monolithic deployment-mode switch.

Configure these repository secrets:

```text
WEBHOOK_AEKO_ADMIN=<Aeko Admin webhook>
WEBHOOK_EXPLORER_API=<Explorer API webhook>
WEBHOOK_EXPLORER_UI=<Explorer UI webhook>
WEBHOOK_FAUCET=<Faucet webhook>
WEBHOOK_VALIDATOR=<Validator webhook>
WEBHOOK_API_KEY=<shared Coolify API token>
```

Disable Coolify Git Auto Deploy for all five webhook-managed resources so a
repository push cannot race ahead of Docker image validation/promotion. Set
`AEKO_IMAGE_TAG=latest` on those resources; the webhook then pulls the image
family CI just promoted. The immutable SHA tag remains available for rollback.

Network releases trigger Faucet first and Validator only after the Faucet
webhook call succeeds. This ordering protects the funding dependency during
automatic rollouts without coupling the two resources onto one Docker network.

Bootstrap is the only split resource that remains manual because the current
repository secret contract contains no Bootstrap webhook. Keep its lifecycle
deployment explicit and do not reuse another resource's webhook.

Coolify domains are the normal cross-resource contract for HTTP/WebSocket
services. Configure the domains listed below against each service's container
port. A resource does not need a host `ports:` mapping merely because its
consumer lives on another instance.

Faucet and validator gossip are the exceptions because they are raw TCP/UDP,
not HTTP. `faucet.aeko.online` identifies the Faucet host, but TCP `:9900`
must still be published and restricted by host/cloud firewall to Validator
source addresses. Gossip/validator transport likewise uses direct TCP+UDP
`8000-8050`.

The recommended resource settings and Watch Paths examples are in
docker/coolify/README.md.

## Required Coolify variables

Do not use one giant shared Coolify environment for the split topology. Each
resource owns only the variables documented in its adjacent `.env.example`.

Common image/logging variables are:

~~~text
AEKO_IMAGE_REPOSITORY=surdma
AEKO_LOG_MAX_SIZE=10m
AEKO_LOG_MAX_FILES=3
~~~

Keep Validator/bootstrap/faucet-tools on an immutable validated image tag.
Explorer API/UI, Operations Web, Faucet, and Validator use the promoted
`latest` tag when their independent deployment webhook runs after image
promotion. Bootstrap remains an explicit operator-controlled release.

Each chain deployment has one active network, but public client endpoints are
not reused for backend-to-backend traffic. Aeko Scan publishes the active
network's browser/client endpoints:

~~~text
AEKO_NETWORK=testnet
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_WS_URL=wss://ws.aeko.online
AEKO_EXPLORER_API_URL=https://api.aeko.online
~~~

Split Bootstrap, Explorer API, Operations Web, and Validator funding use
resource-scoped canonical variables with private or DNS-only values:

~~~text
# Explorer API resource
AEKO_RPC_URL=https://<private-or-dns-only-validator-rpc-origin>
AEKO_WS_URL=wss://<private-or-dns-only-validator-ws-origin>
AEKO_REGISTRY_URL=https://<private-or-dns-only-registry-origin>
AEKO_EXPLORER_CORS_ORIGINS=https://scan.aeko.online

# Operations Web resource
AEKO_RPC_URL=https://<private-or-dns-only-validator-rpc-origin>
AEKO_EXPLORER_API_URL=https://<private-or-dns-only-explorer-api-origin>

# Validator resource
AEKO_FAUCET_ADDRESS=<private-or-dns-only-faucet-host>:9900
~~~

There is no parallel internal namespace: resource boundaries provide the scope. Do not point them at Cloudflare-proxied/WAF endpoints. A raw
cross-host port is usable only if it is explicitly published and restricted;
otherwise use a private overlay URL or a DNS-only Coolify origin.

Aeko Scan is the only multi-network boundary. Its generic values define the
active/default public network; optional complete `AEKO_MAINNET_*` and
`AEKO_TESTNET_*` RPC/WS/Explorer-API triplets describe the other independently
deployed public network. The production Scan resource accepts Mainnet and
Testnet only. Devnet and Localnet remain explicit development environments and
are configured outside the public Scan deployment contract.

Explorer API additionally owns `EXPLORER_DATABASE_URL` and the Explorer
settings token. Operations Web owns its admin credentials. Bootstrap and
Validator tunables remain local to their corresponding resources.

Coolify values should be entered without shell quotes. The split contracts do
not use `env_file:`, so an uncommitted `.env` file is never a runtime
dependency. Persistent host paths remain literal `/data/aeko/**` bind sources.

## Persistent keys

Coolify uses the fixed host directory `/data/aeko/keys` wherever a resource needs chain key material. In the split topology the one-shot `key-bootstrap` service lives inside `docker/coolify/bootstrap/compose.yml`; it is no longer a startup dependency of the Faucet or Validator resources. On an intentional first boot it may generate missing chain keypairs only when `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`; normal established-chain runs keep that flag at `0`. Existing non-empty keypair files are preserved and validated rather than replaced.

The canonical key-custody/bootstrap directory contains the four chain
identities:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

A split **established Validator host** only needs
`validator-1-keypair.json` and `vote-1-keypair.json` locally. The stake and
Faucet keypairs are checked only when that host actually creates/replaces
genesis. Faucet uses its own `faucet-keypair.json` on the faucet-tools host.

`protocol-authority-keypair.json` is created automatically when no established protocol registry or continuity identity exists. On established deployments the same authority is required and verified rather than replaced.

You do not need to set `AEKO_KEYS_DIR` in the Coolify dashboard and you do not need to generate these files manually for a fresh chain. If this Coolify deployment is replacing an existing Dokploy/AEKO deployment, copy the **same existing validator/vote/stake/faucet keypairs** into this directory before deploying so the bootstrap preserves them. Replacing them changes validator/faucet identity and can make the persisted ledger unusable for the intended chain. Generate new keys only when intentionally creating a fresh chain identity.

For a fresh chain, provision the intended chain keys under `/data/aeko/keys` before the full bootstrap application is deployed, then bring up Faucet and Validator. After Validator RPC is healthy, deploy the full bootstrap resource; its key-bootstrap service verifies those keys before Social/Protocol run. If these resources are on different Ubuntu hosts, remember that the same `/data/aeko/keys` path is host-local; provision only the required key files to each host through your secure custody process. Never commit keypairs or place them in a disposable Git checkout.

Both Coolify contracts use literal bind sources. The legacy single-resource Compose stack fixes `/data/aeko/keys`; the split resources also fix their state directories under `/data/aeko/**`. No split bind `source:` contains `${...}` interpolation. Runtime consumers mount key/registry data read-only where possible, while explicit operator/bootstrap jobs receive only the write access they require. This is intentional because the current Coolify volume validator rejects interpolation in bind sources.

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

The split Explorer API does not mount either bootstrap state directory and does
not require dozens of copied registry environment variables. After Social and
Protocol bootstrap succeed, the co-located `registry` service serves only the
generated `social-registry.env` and `protocol-registry.env` files read-only
at `registry.aeko.online`. Explorer API resolves those documents through
`AEKO_REGISTRY_URL` when registry/status/readiness is evaluated, caches them
for `AEKO_REGISTRY_REFRESH_SECONDS`, and retains the last good cached copy
through a temporary refresh failure. Strict network readiness still requires
the resolved schema/genesis to match the live validator. The registry service
never mounts or exposes `/data/aeko/keys`.

For the complete migration sequence and registry discovery contract, use
`docker/coolify/README.md`.

## Domains and ports

The canonical cross-platform matrix, including local host-port overrides and
same-Compose Docker-DNS defaults, is
[network-ports-and-domains.md](./network-ports-and-domains.md). This section is
the Coolify-specific routing subset.


Configure these Coolify domains against the listed services/container ports:

| Testnet endpoint | Service | Container port |
| --- | --- | ---: |
| `https://rpc.aeko.online` | `validator` | `8899` |
| `wss://ws.aeko.online` | `validator` | `8900` |
| `https://registry.aeko.online` | `registry` in Bootstrap | `8089` |
| `https://api.aeko.online` | `explorer-api` | `8088` |
| `https://scan.aeko.online` | `explorer-ui` | `4000` |
| `https://admin.aeko.online` | `operations-web` | `3001` |

For the Operations Web resource, set Coolify's HTTP health-check path to
`/healthz`. The Admin root `/` is intentionally session-protected and is not
a liveness endpoint; probing it produces `admin_sign_in_required` redirects and
warning logs.

The public `api.aeko.online` hostname is the browser-facing Explorer API.
Aeko Scan calls it directly, and Explorer API must set
`AEKO_EXPLORER_CORS_ORIGINS=https://scan.aeko.online` (plus explicit
development origins where appropriate). Operations Web uses its own
server-side `AEKO_EXPLORER_API_URL` value pointed at a private or DNS-only
Explorer origin so privileged Admin mutations do not traverse the public edge. Configure the edge in front of
`api.aeko.online` as an API edge: Explorer routes, especially `/funding/*`,
must return JSON rather than interactive bot-challenge HTML.

`registry.aeko.online/` returns a non-secret JSON discovery manifest.
`/healthz`, `/social-registry.env`, and `/protocol-registry.env` expose
the health and two read-only registry documents; unknown paths return 404.

In the split Bootstrap resource, `/healthz` is also the lifecycle gate. Social
and Protocol each invalidate a runtime-readiness marker before verification and
republish it only after their canonical chain binding completes. The registry
returns 503 when either latest one-shot verification is incomplete/failed or a
registry document is missing; it does not mutate or recreate canonical state.

Do not configure gossip as an HTTP route. There is no separate Gossip Coolify
application: the Validator process owns the gossip service. The split Validator
requires `AEKO_GOSSIP_HOST` explicitly so a mainnet/devnet deployment cannot
silently advertise the testnet hostname. For testnet set
`AEKO_GOSSIP_HOST=gossip.aeko.online`, point that DNS record directly to the
Validator host, and allow inbound TCP+UDP `8000-8050`. The Validator resolves
the hostname at startup; gossip starts on `8001`. Mainnet/devnet must use their
own network-specific gossip DNS name or public IP. Verify the real testnet
protocol path with
`AEKO_GOSSIP_ENTRYPOINT=gossip.aeko.online:8001 scripts/smoke-gossip.sh` or
`aeko-gossip spy --entrypoint gossip.aeko.online:8001 --num-nodes 1 --timeout 20`.

Faucet is also not an HTTP Coolify Domain. The split Faucet Compose requires
`AEKO_FAUCET_BIND_ADDRESS` and publishes raw TCP `9900` explicitly on that host
interface. Prefer a private/overlay network such as VPC or WireGuard. If an
operator uses `0.0.0.0`, the host/cloud firewall must restrict TCP `9900` to
trusted Validator/RPC source addresses.

Do not use `127.0.0.1`, `localhost`, or `::1` as the split Faucet bind for a
Faucet consumed by another container, and do not use loopback or wildcard
values as the split Validator's `AEKO_FAUCET_ADDRESS`. Separate Coolify
resources do not share container loopback even when they run on the same
Ubuntu server. Moving those resources to another provider keeps the same
contract: route Faucet over the private/overlay network rather than changing
application code.

Point `faucet.aeko.online` or private DNS at the raw TCP endpoint only when it
resolves to an address the consumers can actually reach. Leave the Faucet
Domains field empty and do not configure an HTTP health path for `9900`; the
Compose healthcheck validates the mounted key locally. Do not attach a
Cloudflare HTTP proxy or Traefik HTTP router to the Faucet port.

Verify the effective host publication and a consumer-side TCP connection:

```bash
# Faucet host
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -i faucet
ss -lntp | grep ':9900'

# Validator/RPC host (or inside that container)
nc -vz <faucet-private-or-overlay-address> 9900
```

A split deployment is not accepted if Docker reports only
`127.0.0.1:9900->9900/tcp` or the consumer-side probe fails. PostgreSQL
`5432` should remain private.

## First deployment

For the split topology, create six separate Coolify applications:

1. `docker/coolify/bootstrap/compose.yml`
2. `docker/coolify/faucet-tools/compose.yml`
3. `docker/coolify/validator/compose.yml`
4. `apps/explorer/backend/compose.coolify.yml`
5. `apps/explorer/web/compose.coolify.yml`
6. `apps/admin/compose.coolify.yml`

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
   run in parallel against `AEKO_RPC_URL`; require the registry
   service to become healthy at `https://registry.aeko.online/healthz`;
6. deploy Explorer API and verify it can fetch both registry files through
   `AEKO_REGISTRY_URL` and that `/network/readiness` accepts their live
   genesis binding;
7. deploy Explorer UI and Operations Web independently.

For a genuinely new chain, provision/generate the intended keys before first
Validator genesis, then start Faucet and Validator with
`AEKO_REQUIRE_EXISTING_LEDGER=0`. After genesis exists, return first-boot
flags to their safe values and deploy the full `bootstrap` resource only after
Validator RPC is healthy.

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

## Funding troubleshooting

Public/Admin Funding uses the same protected settlement contract on every
configured network. Developer airdrop is a separate test-environment utility
and is rejected on Mainnet. When production Funding fails while localhost
works, check these in order:

1. **HTML/edge error from `https://api.aeko.online/funding/*` instead of the
   Explorer JSON contract.** Scan calls Explorer API directly; there is no
   Scan-side Explorer proxy to fix. Check the `api.aeko.online` route/origin,
   Explorer API health, and Cloudflare/WAF policy. API routes must not receive
   interactive bot challenges or HTML error replacements. The Explorer backend
   must set `AEKO_EXPLORER_CORS_ORIGINS=https://scan.aeko.online` (plus any
   explicitly approved local/browser origins), and preflight for public funding
   must allow `POST`, `OPTIONS`, `Content-Type`, and `X-Request-Id`.
2. **Faucet logs `Rejected HTTP-like traffic on raw TCP Faucet listener`.**
   This is not a valid Validator funding request. The Validator client uses the
   binary Faucet protocol over raw TCP. Remove any Coolify HTTP domain, HTTP
   health probe, Traefik HTTP router, or Cloudflare HTTP proxy attached to port
   `9900`; publish raw TCP only and firewall it to the Validator source.
3. **Approvals stuck in `processing` ("submission response was not
   obtained").** The validator's faucet path is broken: the validator needs
   `--rpc-faucet-address <private-or-dns-only-faucet-host>:9900` with a reachable Faucet, a funded
   faucet keypair, caps above the Funding amount, and an
   `AEKO_FUNDING_AUTHORIZATION_KEY` identical to the Explorer backend's. The
   persisted intent is replayed verbatim (same blockhash, same signature), so
   retrying never creates a second Funding transfer. If the wallet is wedged on
   `REQUEST_PENDING`, use Admin **Retry submission**; if the faucet cannot be
   restored, use Admin **Cancel request** — it replays once and only releases
   the wallet when no durable signature exists, after which the user can
   submit a fresh request (CLI/SDK/explorer clients automatically adopt the
   in-flight request id and resume polling).
4. **404 on `/accounts/:address`.** Expected for an address that never
   received funds: the account does not exist on-chain yet. Fix funding first;
   the account appears once a transfer lands.

## Volume parsing failures
If Coolify reports an error such as `Invalid Docker volume definition` or `Invalid volume source` before containers start:

1. Confirm the application uses its intended split Compose path (`docker/coolify/<resource>/compose.yml` for infrastructure or `apps/**/compose.coolify.yml` for deployable apps), or the legacy `docker/compose.coolify.yml` only when intentionally using the monolith.
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
