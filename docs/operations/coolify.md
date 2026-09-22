# Deploying AEKO with Coolify

This guide describes the current single-validator public testnet deployment. The canonical topology and acceptance criteria live in [`DEPLOYMENT.md`](../../DEPLOYMENT.md); this page focuses only on Coolify-specific setup.

## Deployment contract

Use the repository's image-only Coolify Compose file:

```text
./docker/compose.coolify.yml
```

Coolify does not build the AEKO Rust or web applications from source. It pulls the published images selected by `AEKO_IMAGE_REPOSITORY` and `AEKO_IMAGE_TAG`.

The default public services are:

```text
key-bootstrap (one shot) -> faucet -> validator -> social-bootstrap
                                      |-> explorer-api
explorer-ui (independent liveness)
```

The validator owns public JSON-RPC/PubSub in this single-validator topology. The non-voting `rpc-node` remains an optional local/portable profile and is not part of the Coolify deployment.

## Required Coolify variables

Add these values in the application's **Environment Variables** section:

```text
AEKO_PUBLIC_IP=<public IP of the Coolify host>
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended immutable 12-character main SHA>
ADMIN_PASSWORD=<operator password for admin.aeko.online>
ADMIN_SESSION_SECRET=<16+ random characters>
FAUCET_API_KEY=<shared secret; set the same value as AEKO_FAUCET_API_KEY on the Aeko backend>
```

Use the full template in [`docker/env.public.example`](../../docker/env.public.example) for optional storage, Explorer, SocialFi and logging settings.

Do not wrap Coolify environment values in shell quotes. The key directory is not an environment variable in the Coolify contract; it is deliberately fixed to the literal host path `/data/aeko/keys` so Coolify never parses `${...}` inside a volume source.

## Persistent keys

Coolify uses the fixed host directory `/data/aeko/keys`. The Compose stack now includes a one-shot `key-bootstrap` service that creates this directory through the bind mount and generates only keypairs that are missing. Existing non-empty keypair files are preserved and validated rather than replaced.

After first successful deployment, the persistent directory contains:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

You do not need to set `AEKO_KEYS_DIR` in the Coolify dashboard and you do not need to generate these files manually for a fresh chain. If this Coolify deployment is replacing an existing Dokploy/AEKO deployment, copy the **same four existing keypairs** into this directory before deploying so the bootstrap preserves them. Replacing them changes validator/faucet identity and can make the persisted ledger unusable for the intended chain. Generate new keys only when intentionally creating a fresh chain identity.

For a fresh chain, no host-side key command is required. After the first successful deployment, you may inspect `/data/aeko/keys` on the Coolify host if you want to back up the generated identities. Never commit keypairs or place them in a disposable Git checkout.

The Coolify Compose mounts this directory with long-form bind syntax and the literal source `/data/aeko/keys`. Runtime services mount it read-only; the optional `wallet-tools` profile can mount it read-write for explicit operator work. This is intentional: the current Coolify volume validator rejects `${...}` interpolation in a bind source.

## Persistent chain state

The Coolify contract declares three Docker-managed named volumes:

- `validator-ledger` for validator ledger/accounts/snapshots.
- `social-state` for SocialFi state keypairs and `social-registry.env`.
- `admin-state` for the faucet policy and grant ledger of the admin app (admin.aeko.online / chain.aeko.online).

Normal redeploys must preserve all three volumes. Do not delete them unless intentionally resetting chain state.

For a deliberate fresh-genesis recovery, set both:

```text
AEKO_RESET_LEDGER=1
AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1
```

Redeploy once, verify bootstrap succeeds, then return both values to `0`.

## Domains and ports

Configure Coolify domains against these internal services:

| Public endpoint | Service | Container port |
| --- | --- | ---: |
| `https://rpc.aeko.online` | `validator` | `8899` |
| `wss://ws.aeko.online` | `validator` | `8900` |
| `https://api.aeko.online` | `explorer-api` | `8088` |
| `https://scan.aeko.online` | `explorer-ui` | `4000` |
| `https://chain.aeko.online` | `admin` | `3001` (public faucet only) |
| `https://admin.aeko.online` | `admin` | `3001` (operator console) |

Do not configure `gossip.aeko.online` as an HTTP route. Point that DNS record directly to `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. Gossip starts on `8001` inside that range.

Keep faucet `9900` and PostgreSQL `5432` private.

## First deployment

1. Create a Git-based Docker Compose application in Coolify and select this repository/branch.
2. Set the Compose path to `./docker/compose.coolify.yml`.
3. Add the required environment variables above, without shell quotes. Do not add `AEKO_KEYS_DIR`.
4. Configure the four HTTP/WebSocket domains.
5. Open TCP+UDP `8000-8050` for validator transport.
6. Deploy.

The Coolify stack uses `key-bootstrap` as a one-shot initializer, not the old fail-only preflight. It creates missing persistent keypairs and exits successfully; the faucet then starts, followed by the validator. Existing key files are never overwritten. `social-bootstrap` remains a one-shot initializer; successful completion is `Exited (0)`, which is an expected completed state rather than an unhealthy long-running service. `wallet-tools` is an opt-in `ops` profile and is not part of the default deployment.

## Acceptance

Do not certify the deployment from container status alone.

RPC health:

```bash
curl -s https://rpc.aeko.online \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

The result must be `"ok"`, and repeated `getSlot` calls must advance.

Then check:

```bash
curl -s https://api.aeko.online/registry/social
curl -s https://api.aeko.online/social/status
```

Both SocialFi views must report complete state before accepting SocialFi. For the full read-path smoke test:

```bash
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_EXPLORER_API_URL=https://api.aeko.online \
python3 scripts/smoke-aeko-social.py
```

The signed browser write path in the Explorer test console remains the final end-to-end check.

## Volume parsing failures

If Coolify reports an error such as `Invalid Docker volume definition` or `Invalid volume source` before containers start:

1. Confirm the application uses `./docker/compose.coolify.yml`, not the Dokploy or old legacy Compose path.
2. Confirm every key bind source in the selected Compose is the literal `/data/aeko/keys` path with no `${...}` interpolation.
3. Reload the Compose definition in Coolify and redeploy. The `key-bootstrap` service owns first-boot creation of the persistent key directory and missing keypairs.

Do not replace the Coolify bind mounts with any `${...}` volume-source form, including the Dokploy `${VAR:?message}` pattern. The separate Coolify contract uses a literal host path specifically to satisfy Coolify's storage parser.


## Key troubleshooting

The reusable `docker/key-preflight.sh` helper still uses exit 64 for missing/empty key files and exit 65 for invalid keypair content, but Coolify no longer runs that helper as a Compose startup dependency. This prevents a helper-container failure from leaving unrelated services permanently waiting.

If the faucet or validator fails because a key is unavailable, inspect the fixed host directory directly:

```bash
sudo ls -la /data/aeko/keys
sudo test -s /data/aeko/keys/faucet-keypair.json
sudo test -s /data/aeko/keys/stake-keypair.json
sudo test -s /data/aeko/keys/validator-1-keypair.json
sudo test -s /data/aeko/keys/vote-1-keypair.json
```

Preserve the existing identities when continuing an existing chain; do not regenerate keys merely to make container status green.
