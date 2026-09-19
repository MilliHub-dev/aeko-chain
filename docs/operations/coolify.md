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
key-preflight -> faucet -> validator
                         |-> social-bootstrap
                         |-> explorer-api -> explorer-ui
```

The validator owns public JSON-RPC/PubSub in this single-validator topology. The non-voting `rpc-node` remains an optional local/portable profile and is not part of the Coolify deployment.

## Required Coolify variables

Add these values in the application's **Environment Variables** section:

```text
AEKO_PUBLIC_IP=<public IP of the Coolify host>
AEKO_KEYS_DIR=/data/aeko/keys
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended immutable 12-character main SHA>
```

Use the full template in [`docker/env.public.example`](../../docker/env.public.example) for optional storage, Explorer, SocialFi and logging settings.

Do not wrap Coolify values in shell quotes. In particular, use `/data/aeko/keys`, not `"/data/aeko/keys"` or `'/data/aeko/keys'`.

## Persistent keys

`AEKO_KEYS_DIR` must be an absolute host directory that exists before deployment. It must contain:

```text
validator-1-keypair.json
vote-1-keypair.json
stake-keypair.json
faucet-keypair.json
```

For example:

```bash
sudo install -d -m 700 /data/aeko/keys
```

Copy existing testnet keys into that directory, or generate new keys only when intentionally creating a new chain identity. Never commit keypairs or place them in a disposable Git checkout.

The Coolify Compose mounts this directory with long-form bind syntax and a simple `${AEKO_KEYS_DIR}` source. Runtime services mount it read-only; the optional `wallet-tools` profile can mount it read-write for explicit operator work.

## Persistent chain state

The Coolify contract declares two Docker-managed named volumes:

- `validator-ledger` for validator ledger/accounts/snapshots.
- `social-state` for SocialFi state keypairs and `social-registry.env`.

Normal redeploys must preserve both volumes. Do not delete them unless intentionally resetting chain state.

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

Do not configure `gossip.aeko.online` as an HTTP route. Point that DNS record directly to `AEKO_PUBLIC_IP` and allow inbound TCP+UDP `8000-8050` at the host/cloud firewall. Gossip starts on `8001` inside that range.

Keep faucet `9900` and PostgreSQL `5432` private.

## First deployment

1. Create a Git-based Docker Compose application in Coolify and select this repository/branch.
2. Set the Compose path to `./docker/compose.coolify.yml`.
3. Add the required environment variables above, without shell quotes.
4. Create/populate `AEKO_KEYS_DIR` on the host.
5. Configure the four HTTP/WebSocket domains.
6. Open TCP+UDP `8000-8050` for validator transport.
7. Deploy.

`key-preflight` must exit successfully before faucet/validator startup. `social-bootstrap` is a one-shot initializer; successful completion is `Exited (0)`, not a long-running healthy container.

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
2. Confirm `AEKO_KEYS_DIR` is an absolute path such as `/data/aeko/keys`.
3. Remove surrounding single or double quotes from the Coolify variable value.
4. Confirm the directory exists on the deployment host.
5. Redeploy after saving the environment value.

Do not replace the Coolify bind mounts with the Dokploy `${VAR:?message}` volume-source form. The separate Coolify contract exists specifically to keep storage parsing portable.
