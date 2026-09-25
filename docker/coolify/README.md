# Split Coolify deployments

This directory is the independently deployable Coolify topology for AEKO.

The legacy docker/compose.coolify.yml remains available for the existing
single-Compose deployment. Do not switch an established chain to this split
layout by only changing the Compose path. The split layout intentionally uses
stable host paths under /data/aeko so persistent state is independent of
Coolify and Compose project names. Migrate the existing named-volume contents
first.

## Deployment units

| Resource | Compose path | Persistent state | Required upstream |
| --- | --- | --- | --- |
| Key bootstrap | docker/coolify/key-bootstrap/compose.yml | /data/aeko/keys; reads Protocol state and continuity | none |
| Faucet | docker/coolify/faucet/compose.yml | /data/aeko/keys | none |
| Validator | docker/coolify/validator/compose.yml | /data/aeko/keys and /data/aeko/validator-ledger | private Faucet TCP endpoint |
| Social bootstrap | docker/coolify/social-bootstrap/compose.yml | /data/aeko/keys and /data/aeko/social-state | validator RPC |
| Protocol bootstrap | docker/coolify/protocol-bootstrap/compose.yml | /data/aeko/keys, /data/aeko/protocol-state and /data/aeko/protocol-continuity | validator RPC |
| Explorer API | docker/coolify/explorer-api/compose.yml | read-only bootstrap registries when co-located; PostgreSQL externally | validator RPC and PostgreSQL |
| Explorer UI | docker/coolify/explorer-ui/compose.yml | none | private Explorer API endpoint |
| Operations Web | docker/coolify/operations-web/compose.yml | none | validator RPC and private Explorer API |
| Wallet tools | docker/coolify/wallet-tools/compose.yml | /data/aeko/keys | none |

Each folder contains its own .env.example. Coolify dashboard variables remain
the runtime source of values. The examples are documentation and are not loaded
with env_file, so a missing checked-in .env cannot break a deployment.

## Stable storage contract

Coolify validates Compose storage before starting containers and the existing
deployment contract does not allow environment interpolation in bind source
fields. Every split bind source is therefore a literal path.

The split layout also avoids Docker-managed names for chain state. A named
volume is scoped by a Compose project. Moving the validator into another
Coolify resource could otherwise silently give it a fresh empty
validator-ledger volume.

The fixed state locations are:

    /data/aeko/keys
    /data/aeko/validator-ledger
    /data/aeko/social-state
    /data/aeko/protocol-state
    /data/aeko/protocol-continuity

Any of these directories may itself be a mount point backed by dedicated block
storage or another durable filesystem. The container contract only requires
the path and data to be present.

## Cross-resource networking

Separate Coolify Compose resources do not share service-name DNS. Do not use
validator:8899, faucet:9900 or explorer-api:8088 across split resources.

Set the consuming resource to a reachable private address, private DNS name,
VPN address, or another operator-controlled internal route:

    AEKO_INTERNAL_FAUCET_ADDRESS=<private-host>:9900
    AEKO_INTERNAL_RPC_URL=http://<private-validator-host>:8899
    AEKO_INTERNAL_EXPLORER_API_URL=http://<private-explorer-api-host>:8088

RPC and WebSocket may still have public ingress where intended. Faucet TCP 9900
and Explorer API 8088 should remain private. If resources live on different
servers, network reachability is an infrastructure prerequisite. These Compose
files intentionally do not fabricate a cross-server Docker network.

## Coolify deployment-trigger isolation

Separate Compose resources prevent one deployment operation from recreating
every service, but Git auto-deploy must also be configured per Coolify
application.

For the validator and lifecycle jobs, the production-safe default is:

- Validator: disable Auto Deploy. Keep an immutable AEKO_IMAGE_TAG and deploy
  only when a validated validator image/config change is intentionally released.
- Key bootstrap, Social bootstrap, Protocol bootstrap and wallet-tools: disable
  Auto Deploy. These are operator/lifecycle jobs, not commit-driven daemons.
- Faucet: either disable Auto Deploy or use a Faucet-specific Watch Paths rule.
- Explorer API, Explorer UI and Operations Web: Auto Deploy may remain enabled,
  but configure Watch Paths so unrelated monorepo commits do not redeploy them.

In Coolify, Watch Paths are configured under Configuration > General > Build.
Auto Deploy is under Configuration > Advanced > Deployment & Git.

A practical minimum Watch Paths policy for the stateless application surfaces
is:

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

If image publication is controlled by CI and AEKO_IMAGE_TAG is an immutable
commit tag, prefer a dedicated manual/deploy-webhook promotion after the image
is published instead of racing a Git webhook against image publication.

## Same-server versus cross-server networking

Coolify gives each Docker Compose application a resource-specific network.
Therefore separate resources must not assume bare service-name DNS.

When dependent resources are on the same Coolify destination, the operator may
enable Connect To Predefined Network for the applications that need to talk to
one another. Even then, verify the generated/attached hostname in the deployed
configuration and set the AEKO_INTERNAL_* variable explicitly; do not hard-code
a guessed service name.

When resources are on different servers, use a private routed address, private
DNS, VPN/overlay network or another controlled internal route. Do not make
Faucet 9900 or Explorer API 8088 public merely to make the split topology work.

## State and key affinity

Independent deployment does not mean every service is safe on an arbitrary
host without its required state.

- Validator requires the established validator, vote, stake and Faucet
  identities plus the established ledger.
- Faucet requires faucet-keypair.json.
- Social bootstrap needs the Faucet payer key and owns social-state.
- Protocol bootstrap needs the Faucet payer and Protocol authority key and owns
  both Protocol state directories.
- Key bootstrap is a chain-identity lifecycle job. Run it where the
  authoritative keys and Protocol continuity data are mounted.
- Copying private key material to more hosts increases custody surface. Prefer
  running bootstrap jobs on the chain or operations host even though their
  deployments are independent.

## Explorer API on another server

The normal co-located path mounts Social and Protocol registry directories
read-only. The Explorer registry loader also accepts environment values, and
non-empty environment values take precedence over registry files.

An Explorer API on another server can therefore use exported registry values
instead of writable bootstrap state. Its .env.example lists all Social and
Protocol registry overrides. Populate the complete canonical set from
social-registry.env and protocol-registry.env, and update them after an
intentional chain reset. Never invent addresses or mix values from different
genesis hashes.

## Established-chain migration

Treat migration as a controlled maintenance operation. Keep the monolithic
resource as the rollback path until the split deployment passes acceptance.

1. Back up /data/aeko/keys and all current Coolify named volumes.
2. Identify the actual current volume names. Coolify prefixes names with its
   resource or Compose project identifier, so do not guess them.
3. Stop writes before copying each state volume.
4. Create /data/aeko/validator-ledger, /data/aeko/social-state,
   /data/aeko/protocol-state and /data/aeko/protocol-continuity.
5. Copy the current validator-ledger, social-state, protocol-state and
   protocol-continuity volume contents into their matching fixed directories.
6. Preserve ownership, modes, symlinks, timestamps and hidden lifecycle files,
   including .aeko-bootstrap-in-progress and .aeko-chain-binding.
7. Keep AEKO_REQUIRE_EXISTING_LEDGER=1 and
   AEKO_ALLOW_CHAIN_KEY_GENERATION=0 for an established chain.
8. Deploy Faucet, then Validator. Verify RPC health and advancing slots.
9. Run Social bootstrap and Protocol bootstrap and require successful one-shot
   completion.
10. Deploy Explorer API, Explorer UI and Operations Web independently.
11. Run the repository network readiness and Social/Protocol smoke checks
    before retiring the monolithic Coolify resource.

Never start an established validator against an empty split ledger directory
with AEKO_REQUIRE_EXISTING_LEDGER=0. That creates a replacement chain; it does
not migrate the existing one.

## Fresh-chain order

For a genuinely new chain:

1. Prepare the fixed /data/aeko directories.
2. Run Key bootstrap with AEKO_ALLOW_CHAIN_KEY_GENERATION=1.
3. Deploy Faucet.
4. Deploy Validator with AEKO_REQUIRE_EXISTING_LEDGER=0.
5. Return the first-boot flags to their fail-closed values.
6. Run Social bootstrap.
7. Run Protocol bootstrap.
8. Deploy Explorer API.
9. Deploy Explorer UI and Operations Web.

A one-shot bootstrap showing Exited (0) is success, not an unhealthy daemon.
