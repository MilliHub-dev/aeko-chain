# AEKO split Coolify deployment

The split Coolify topology is designed for services that may live on the same
server, different Ubuntu instances, or different Coolify installations.

The rule is simple:

- **network identity is explicit**: testnet, mainnet, localnet, or devnet;
- **service discovery uses URLs/DNS names**, not guessed Docker service names or
  sample private IPs;
- **persistent chain state stays on the host that owns it**;
- **private keypair JSON files are never exposed through the registry service**.

The legacy `docker/compose.coolify.yml` remains a rollback/compatibility
contract. Do not migrate an established chain by only changing a Compose path.

## Six Coolify resources

| Resource | Services | Compose path |
| --- | --- | --- |
| Bootstrap | key preflight, Social bootstrap, Protocol bootstrap, read-only registry | `docker/coolify/bootstrap/compose.yml` |
| Faucet + tools | Faucet daemon, opt-in wallet/operator CLI | `docker/coolify/faucet-tools/compose.yml` |
| Validator | voting Validator / RPC / WebSocket | `docker/coolify/validator/compose.yml` |
| Explorer API | indexer, REST API, funding/readiness control plane | `apps/explorer/backend/compose.coolify.yml` |
| Aeko Scan | Explorer UI and public Explorer API | `apps/explorer/web/compose.coolify.yml` |
| Operations Web | authenticated Admin/operator UI | `apps/admin/compose.coolify.yml` |

The three bootstrap jobs are deliberately one resource. Faucet and wallet tools
are deliberately one resource; `wallet-tools` remains under the `ops`
profile and does not start with the normal Faucet daemon.

Infrastructure-owned resources stay under `docker/coolify/**`. Explorer API,
Aeko Scan, and Operations Web own `compose.coolify.yml` and
`.env.coolify.example` beside their application source under `apps/**`.

## Canonical testnet service names

For the full cross-platform port map and the exact environment override rules,
see [../../docs/operations/network-ports-and-domains.md](../../docs/operations/network-ports-and-domains.md).


Use these names in Coolify and DNS:

| Service | Canonical endpoint | Coolify/container target |
| --- | --- | --- |
| Validator JSON-RPC | `https://rpc.aeko.online` | `validator:8899` |
| Validator WebSocket | `wss://ws.aeko.online` | `validator:8900` |
| Bootstrap registry | `https://registry.aeko.online` | `registry:8089` |
| Explorer API | `https://api.aeko.online` | `explorer-api:8088` |
| Aeko Scan | `https://scan.aeko.online` | `explorer-ui:4000` |
| Operations Web | `https://admin.aeko.online` | `operations-web:3001` |
| Faucet | `faucet.aeko.online:9900` | direct TCP `9900` on the Faucet host |
| Validator gossip/transport | `gossip.aeko.online` | direct TCP+UDP `8000-8050` |

For HTTP/WebSocket services, configure the Coolify Domain against the listed
container port. Their split Compose files use `expose:` and do not publish
host ports merely to communicate across instances.

For **Operations Web**, configure Coolify's application health-check path as
`/healthz`. Do not probe `/`: the Admin root is intentionally protected by
session authentication and unauthenticated requests are redirected to
`/login`. The container healthcheck uses the same public `/healthz` route.

Faucet and validator gossip are different. They are raw TCP/UDP protocols, not
HTTP routes. Their DNS records identify the host, but the required host ports
must still be reachable. Restrict Faucet TCP 9900 to Validator source addresses
with the host/cloud firewall.

## Environment naming

Every chain deployment is one blockchain environment. A mainnet server does
not carry testnet/devnet service URLs, and a testnet server does not carry
mainnet/devnet service URLs.

Public/browser endpoints and backend service origins are deliberately separate.
Aeko Scan exposes the public active-network values:

```text
AEKO_NETWORK=testnet
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_WS_URL=wss://ws.aeko.online
AEKO_EXPLORER_API_URL=https://api.aeko.online
```

Split server resources use their adjacent `.env.example` files to provide
reachable private or DNS-only origins that bypass public Cloudflare/WAF
handling:

```text
AEKO_INTERNAL_RPC_URL=https://<private-or-dns-only-validator-rpc-origin>
AEKO_INTERNAL_WS_URL=wss://<private-or-dns-only-validator-ws-origin>
AEKO_INTERNAL_EXPLORER_API_URL=https://<private-or-dns-only-explorer-api-origin>
AEKO_INTERNAL_REGISTRY_URL=https://<private-or-dns-only-registry-origin>
AEKO_INTERNAL_FAUCET_ADDRESS=<private-or-dns-only-faucet-host>:9900
AEKO_EXPLORER_CORS_ALLOWED_ORIGINS=https://<private-or-dns-only-explorer-api-origin>
```

Compose maps those server-only inputs back to the generic runtime names
(`AEKO_RPC_URL`, `AEKO_WS_URL`, `AEKO_EXPLORER_API_URL`,
`AEKO_REGISTRY_URL`, and `AEKO_FAUCET_ADDRESS`) inside each container, so
application contracts do not change. A raw cross-host `host:port` URL is valid
only when that port is explicitly published and firewall-restricted; otherwise
use a private overlay URL or a DNS-only Coolify origin.

**Aeko Scan is the multi-network exception.** Its generic URLs describe the
active/default public network, while optional complete `AEKO_MAINNET_*` and
`AEKO_TESTNET_*` RPC/WS/Explorer-API triplets describe the other independently
deployed public network. The production Scan resource accepts Mainnet and
Testnet only. Devnet remains a dedicated engineering deployment and Localnet
remains local development; they are not browser-selectable production Scan
targets.

Whether an active URL resolves to the same Docker network, another Ubuntu
machine, or another provider is deployment topology. That is not encoded as
`PUBLIC` or `INTERNAL` in the variable name.

## Who consumes the bootstrap registry?

Only **Explorer API** consumes the generated Social/Protocol registries.

The flow is:

```text
social-bootstrap ──> social-registry.env ┐
                                         ├─> registry.aeko.online
protocol-bootstrap -> protocol-registry.env ┘
                                                   |
                                                   v
                                          Explorer API
                                           /       \
                                          v         v
                                     Aeko Scan    Admin
```

Aeko Scan and Operations Web do **not** mount bootstrap state and do not fetch
the registry files directly. They consume Explorer API.

The registry HTTP service exposes only:

```text
/                         # non-secret JSON discovery manifest
/healthz
/social-registry.env
/protocol-registry.env
```

Every other path returns 404. The registry service mounts only
`/data/aeko/social-state` and `/data/aeko/protocol-state` read-only. It never
mounts `/data/aeko/keys`. Product clients do not read this bootstrap host
directly; they use Explorer API `/registry`, `/registry/social`, and
`/registry/protocol`.

The split bootstrap wrappers invalidate
`.aeko-bootstrap-runtime-ready` before every Social/Protocol verification and
republish it from the completed `.aeko-chain-binding` only after the one-shot
bootstrap exits successfully. Registry `/healthz` requires both readiness
markers and both registry documents. This means a long-running registry
container cannot stay green after a later bootstrap verification fails. The
marker is operational health state only; it never authorizes recreation of
canonical on-chain state.

The two generated registry files contain public chain metadata: genesis binding,
program IDs, state-account public keys, vault/treasury public keys, feature IDs
and slots, and policy values. They do not contain private keypair bytes.

## Explorer registry discovery

The split Explorer API starts through `docker/explorer-api-entrypoint.sh`.

When `AEKO_REGISTRY_URL` is set, startup is fail-closed:

1. fetch `/social-registry.env`;
2. fetch `/protocol-registry.env`;
3. require a registry schema version in both;
4. require a genesis hash in both;
5. require both genesis hashes to match;
6. publish the verified files locally;
7. start `aeko-explorer-backend`.

The entrypoint periodically refreshes the pair. A transient refresh failure
keeps the last verified files; an initial failure prevents Explorer startup.

Local/legacy deployments can continue to mount
`AEKO_SOCIAL_REGISTRY_FILE` and `AEKO_PROTOCOL_REGISTRY_FILE` directly and
leave `AEKO_REGISTRY_URL` unset.

## Persistent state is host-local

Split Coolify uses literal host paths:

```text
/data/aeko/keys
/data/aeko/validator-ledger
/data/aeko/social-state
/data/aeko/protocol-state
/data/aeko/protocol-continuity
```

Create the paths needed by a resource on that resource's host before
deployment. The same path on two different Ubuntu machines is **not shared
storage**.

An established Validator host needs its Validator identity, vote key, and
existing ledger. Stake and Faucet keypairs are genesis-only inputs on that host.
The Faucet host needs the Faucet keypair. The bootstrap/key-custody host needs
the complete key/Protocol continuity material required by the lifecycle jobs.

Do not duplicate private keys merely because two services communicate.

## Cross-instance request paths

With every service on a different instance:

```text
Bootstrap host
  registry.aeko.online:443
          |
          v
Explorer API host ------------------> rpc.aeko.online:443
  api.aeko.online:443
       |          \
       v           v
Scan host        Admin host
scan.aeko...     admin.aeko...

Validator host ---------------------> faucet.aeko.online:9900 (raw TCP)
rpc/ws/gossip
```

No connection above requires Docker service DNS across resources.

## Fresh-chain lifecycle

The full Bootstrap resource must run **after** Validator RPC exists because the
Social and Protocol initializers write on-chain state.

For a genuinely fresh chain:

1. prepare/import/generate the intended chain keys on the key-custody host;
2. run key preflight for those keys before first genesis;
3. start Faucet;
4. start Validator with `AEKO_REQUIRE_EXISTING_LEDGER=0`;
5. return first-genesis flags to their fail-closed established values;
6. deploy the full Bootstrap resource;
7. verify `registry.aeko.online/healthz` and both registry files;
8. deploy Explorer API;
9. deploy Scan and Operations Web.

For an established chain, keep:

```text
AEKO_REQUIRE_EXISTING_LEDGER=1
AEKO_ALLOW_CHAIN_KEY_GENERATION=0
AEKO_RESET_LEDGER=0
```

and migrate the existing state into the fixed `/data/aeko/**` paths before
switching resources.

## Established-chain migration

1. Back up chain keys and all current named-volume state.
2. Identify the real existing Docker volume names; do not guess Coolify
   prefixes.
3. Stop writes before copying state.
4. Copy the Validator ledger, Social state, Protocol state, and Protocol
   continuity into their matching fixed host paths.
5. Preserve ownership, modes, symlinks, timestamps, and hidden lifecycle files.
6. Deploy Faucet + tools.
7. Deploy Validator and verify health plus advancing slots.
8. Deploy Bootstrap and require all three one-shot jobs to exit 0 and Registry
   to become healthy.
9. Verify the registry's genesis hash matches live RPC.
10. Deploy Explorer API and require readiness/network-readiness.
11. Deploy Scan and Operations Web.
12. Run Social and Protocol smoke tests before retiring the legacy resource.

Never start an established Validator against an empty ledger with
`AEKO_REQUIRE_EXISTING_LEDGER=0`.

### Missing canonical Social account after a split migration

An Explorer warning such as `canonical social-posts state account ... does not
exist` means the registry resolved a canonical public key but the active RPC
cannot read that account. Explorer/PostgreSQL indexing can remain healthy while
the Social projection is degraded, so do not treat this as an Explorer database
failure.

For an established chain, first inspect the Validator migration. Confirm that
the original Validator ledger was copied into
`/data/aeko/validator-ledger` and that the Social state directory, including
hidden lifecycle files, was copied into `/data/aeko/social-state`. Keep
`AEKO_REQUIRE_EXISTING_LEDGER=1`, `AEKO_ALLOW_CHAIN_KEY_GENERATION=0`, and
`AEKO_RESET_LEDGER=0` while recovering continuity. Re-run the Bootstrap
resource after restoring the matching state; the Social one-shot must exit 0
before registry health returns 200.

Do **not** delete the registry, regenerate Social keypairs, or set a reset flag
on Bootstrap alone merely to make health green. The same-genesis guard is
deliberately fail-closed because silently replacing a canonical account would
hide ledger/state loss. If the chain is intentionally being replaced, perform
the Validator and bootstrap reset as one coordinated new-chain operation and
then return all reset/first-boot flags to their established values.

## Coolify deployment triggers

Stateful/security-sensitive resources remain intentional releases:

- Validator
- Bootstrap
- Faucet + tools

Explorer API, Scan, and Operations Web may use the split post-promotion webhook
flow documented in `DEPLOYMENT.md`.

Keep Validator/bootstrap/Faucet on immutable image tags. Application resources
may use the promoted `latest` tag when their deployment webhook runs only
after CI promotion.

## Acceptance

Do not accept a deployment from container state alone. Verify:

- RPC `getHealth` is `ok` and slots advance;
- `https://registry.aeko.online/healthz` is healthy;
- both registry files report the same live genesis;
- Explorer liveness/readiness/network-readiness are healthy;
- Social registry/status is complete;
- Protocol registry/status is complete;
- Aeko Scan reads through its direct public API;
- Operations Web can read Explorer API and perform authenticated settings
  operations;
- Faucet TCP 9900 is reachable from Validator but not broadly exposed.
