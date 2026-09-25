# Split Coolify deployments

This directory is the preferred independently deployable Coolify topology for
AEKO. The legacy `docker/compose.coolify.yml` remains intact as the current
all-in-one compatibility and rollback contract.

Do not migrate an established chain by only changing a Coolify Compose path.
The split topology intentionally changes deployment and storage identity, so
existing state must be migrated deliberately.

## Deployment units

The split is by lifecycle and failure boundary, not blindly one service per
Compose file.

| Coolify resource | Services | Why they are grouped | External dependencies |
| --- | --- | --- | --- |
| `bootstrap` | `key-bootstrap`, `social-bootstrap`, `protocol-bootstrap` | one-shot chain/bootstrap lifecycle with the same key and canonical-state boundary | reachable Validator RPC |
| `faucet-tools` | `faucet`, `wallet-tools` | shared operator/key-custody surface; wallet tools remain an opt-in `ops` profile | none |
| `validator` | `validator` | stateful consensus/RPC process that must not restart for unrelated app changes | reachable Faucet TCP endpoint |
| `explorer-api` | `explorer-api` | indexer/API lifecycle and PostgreSQL are independent from UI | reachable Validator RPC + PostgreSQL |
| `explorer-ui` | `explorer-ui` | stateless browser/UI release lifecycle | reachable server-side Explorer API |
| `operations-web` | `operations-web` | authenticated operator UI/control lifecycle | reachable Validator RPC + Explorer API |

Compose paths:

    docker/coolify/bootstrap/compose.yml
    docker/coolify/faucet-tools/compose.yml
    docker/coolify/validator/compose.yml
    docker/coolify/explorer-api/compose.yml
    docker/coolify/explorer-ui/compose.yml
    docker/coolify/operations-web/compose.yml

Every resource has an adjacent `.env.example`. Coolify dashboard variables
remain the runtime source of values; none of these resources uses `env_file:`.

## Bootstrap resource

The three bootstrap services intentionally share one Compose resource.

`social-bootstrap` and `protocol-bootstrap` depend only on the co-located
`key-bootstrap` completing successfully. They do **not** depend on a
`validator` Compose service. Both receive Validator RPC through
`AEKO_INTERNAL_RPC_URL`, which may be a private IP, private DNS name, VPN
address, or other reachable server-side URL on another Ubuntu instance.

The Social and Protocol binaries already perform bounded RPC readiness checks.
A successful bootstrap is a one-shot `Exited (0)` state.

For an established chain, deploy this resource only after Validator RPC is
healthy.

For a brand-new chain, key generation is a two-stage lifecycle because the
Social and Protocol services require a live Validator:

1. run the `key-bootstrap` service with
   `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`;
2. deploy `faucet-tools` and then the Validator for first genesis;
3. return `AEKO_ALLOW_CHAIN_KEY_GENERATION=0`;
4. deploy/redeploy the full `bootstrap` resource so Social and Protocol
   canonical state is initialized.

The bootstrap resource should normally live on the chain/key-custody host.
Moving it to another server means that host must also receive the required
chain payer/protocol key material, which increases secret-custody surface.

## Faucet + wallet tools resource

`faucet-tools` contains the long-running private Faucet daemon and the
operator CLI container because both use `/data/aeko/keys`.

`wallet-tools` has `profiles: ["ops"]`; it is not started by the normal
Faucet deployment. There is no runtime `depends_on` relationship between the
two services.

A Validator on another machine reaches Faucet through the explicit
`AEKO_INTERNAL_FAUCET_ADDRESS` configured on the Validator resource.

## No assumed cross-resource Docker DNS

Different Coolify Compose applications have different service networks, and
resources may be on completely different Ubuntu instances. Therefore the split
contract never assumes these cross-resource names:

    validator:8899
    faucet:9900
    explorer-api:8088

Use explicit reachable endpoints instead:

    AEKO_INTERNAL_FAUCET_ADDRESS=<private-faucet-host>:9900
    AEKO_INTERNAL_RPC_URL=http://<private-validator-host>:8899
    AEKO_INTERNAL_EXPLORER_API_URL=http://<private-explorer-api-host>:8088

Here, `INTERNAL` means server-side/private configuration. It does not mean
"must be Docker-internal" or "must be on the same machine."

When resources are on the same Coolify destination, you may use Coolify's
predefined network after verifying the actual hostname. Still configure the
consumer through the explicit environment variable rather than hard-coding a
service name.

When resources are on different servers, use private routing, private DNS, a
VPN/overlay network, or another controlled internal path.

## Private host-port bindings

Cross-server consumers cannot reach Docker `expose:` ports on another host.
The split resources therefore provide host-port bindings for the server-side
services that may be consumed remotely, with loopback as the safe default.

Faucet:

    AEKO_FAUCET_BIND_IP=127.0.0.1
    AEKO_FAUCET_HOST_PORT=9900

Validator RPC/WS:

    AEKO_RPC_BIND_IP=127.0.0.1
    AEKO_RPC_HOST_PORT=8899
    AEKO_WS_BIND_IP=127.0.0.1
    AEKO_WS_HOST_PORT=8900

Explorer API:

    AEKO_EXPLORER_API_BIND_IP=127.0.0.1
    AEKO_EXPLORER_API_HOST_PORT=8088

For cross-server traffic, change only the required `*_BIND_IP` to the
host's VPN/private-interface address and restrict the port with host/cloud
firewall rules. Do not use `0.0.0.0` for Faucet or Explorer API merely to make
routing easier.

Coolify public domains can still route to container ports through the platform
network; a loopback host binding does not replace or define domain routing.

## Stable /data contract

The legacy monolithic Coolify stack uses project-scoped named volumes for chain
state. The split topology uses stable literal host paths so a new Coolify
resource/project name cannot silently create empty replacement state:

    /data/aeko/keys
    /data/aeko/validator-ledger
    /data/aeko/social-state
    /data/aeko/protocol-state
    /data/aeko/protocol-continuity

These paths are deliberately not environment-interpolated because Coolify
validates bind sources before starting containers.

A path may itself be backed by an attached block volume or another durable
filesystem. What matters to the container contract is that the path is stable
and contains the correct established data.

### Host-local means host-local

The same path on two Ubuntu servers is **not** shared state. If resources that
need the same key material are placed on different hosts, provision the
required files deliberately through the operator's secure storage/custody
process. Do not assume `/data/aeko/keys` magically synchronizes across
instances.

The current Validator bootstrap contract still mounts the established chain key
directory, including the Faucet key used by genesis/bootstrap safeguards.
Separating the Faucet daemon changes network lifecycle, not that persisted
first-genesis/key continuity contract.

Copying private keys to more hosts increases risk. Prefer the smallest possible
number of key-custody hosts.

## Explorer API on another host

When Explorer API is co-located with canonical bootstrap state, it reads these
files read-only:

    /data/aeko/social-state/social-registry.env
    /data/aeko/protocol-state/protocol-registry.env

When Explorer API is on another server, those local paths do not refer to the
bootstrap host. The backend already supports non-empty environment registry
values taking precedence over registry files. Its `.env.example` therefore
contains the complete Social/Protocol override surface needed for a remote
Explorer host.

Export the canonical values from the actual bootstrap registries. Do not invent
addresses, mix values from different genesis hashes, or copy writable bootstrap
state just to make Explorer start.

## Coolify auto-deploy isolation

Separate Compose files solve deployment coupling only if Coolify is also
configured not to redeploy unrelated resources on every repository push.

Recommended production policy:

- `validator`: disable Auto Deploy; promote an immutable `AEKO_IMAGE_TAG`
  only for intentional Validator releases.
- `bootstrap`: disable Auto Deploy; it is a lifecycle job.
- `faucet-tools`: normally disable Auto Deploy; update Faucet intentionally.
- `explorer-api`, `explorer-ui`, `operations-web`: either use explicit
  release promotion or configure Watch Paths for their own surface.

Example Watch Paths:

    Explorer API:
      docker/coolify/explorer-api/**
      apps/explorer/backend/**

    Explorer UI:
      docker/coolify/explorer-ui/**
      apps/explorer/web/**
      docker/explorer-ui-entrypoint.sh

    Operations Web:
      docker/coolify/operations-web/**
      apps/admin/**

This is what prevents a UI/Admin-only Git change from redeploying Validator even
though everything still lives in one monorepo.

## Established-chain migration

Keep `docker/compose.coolify.yml` as the rollback path until the split
deployment has passed acceptance.

1. Back up `/data/aeko/keys` and all current Coolify named volumes.
2. Identify the actual existing Docker volume names. Do not guess Coolify's
   project prefix.
3. Stop writes before copying state.
4. Create:
       /data/aeko/validator-ledger
       /data/aeko/social-state
       /data/aeko/protocol-state
       /data/aeko/protocol-continuity
5. Copy the existing named-volume contents into the matching fixed paths.
6. Preserve ownership, permissions, symlinks, timestamps, and hidden lifecycle
   files such as `.aeko-bootstrap-in-progress` and `.aeko-chain-binding`.
7. Keep:
       AEKO_REQUIRE_EXISTING_LEDGER=1
       AEKO_ALLOW_CHAIN_KEY_GENERATION=0
       AEKO_RESET_LEDGER=0
8. Deploy `faucet-tools`.
9. Deploy `validator`; verify RPC health and advancing slots.
10. Deploy `bootstrap`; require key, Social, and Protocol one-shot success.
11. Deploy `explorer-api`.
12. Deploy `explorer-ui` and `operations-web` independently.
13. Run network readiness plus Social/Protocol smoke checks.
14. Retire the legacy monolithic resource only after the split topology is
    verified.

Never point an established Validator at an empty
`/data/aeko/validator-ledger` with
`AEKO_REQUIRE_EXISTING_LEDGER=0`. That creates a replacement chain rather
than migrating the current one.

## Acceptance

A deployment is not accepted because containers merely started.

Require:

- Validator RPC `getHealth` returns `ok`;
- slots advance;
- Explorer liveness and readiness pass;
- network readiness returns healthy;
- Social registry/status is complete;
- Protocol registry/status is complete;
- registry genesis matches the live Validator genesis;
- signed read/write smoke paths still work where applicable.

See `docs/operations/coolify.md` for the concrete public endpoint checks.
