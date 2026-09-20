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
EXPLORER_DATABASE_URL=postgres://user:password@host:5432/aeko_explorer
AEKO_IMAGE_REPOSITORY=surdma
AEKO_IMAGE_TAG=<recommended immutable 12-character main SHA>
```

Use the full template in [`docker/env.public.example`](../../docker/env.public.example) for optional storage, Explorer, SocialFi and logging settings.

Do not wrap Coolify environment values in shell quotes. The key directory is not an environment variable in the Coolify contract; it is deliberately fixed to the literal host path `/data/aeko/keys` so Coolify never parses `${...}` inside a volume source.

## Persistent keys

The fixed Coolify host directory `/data/aeko/keys` must exist before deployment. It must contain:

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

If this Coolify deployment is replacing an existing Dokploy/AEKO deployment, copy the **same four existing keypairs** into this directory. Replacing them changes validator/faucet identity and can make the persisted ledger unusable for the intended chain. Generate new keys only when intentionally creating a fresh chain identity.

Before deploying, verify the directory on the **Coolify deployment server**:

```bash
sudo test -d /data/aeko/keys
for key in faucet-keypair.json stake-keypair.json validator-1-keypair.json vote-1-keypair.json; do
  sudo test -s "/data/aeko/keys/$key" || { echo "missing: $key"; exit 1; }
done
sudo ls -la /data/aeko/keys
```

Never commit keypairs or place them in a disposable Git checkout.

The Coolify Compose mounts this directory with long-form bind syntax and the literal source `/data/aeko/keys`. Runtime services mount it read-only; the optional `wallet-tools` profile can mount it read-write for explicit operator work. This is intentional: the current Coolify volume validator rejects `${...}` interpolation in a bind source.

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
4. Create/populate `/data/aeko/keys` on the host.
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
2. Confirm every key bind source in the selected Compose is the literal `/data/aeko/keys` path with no `${...}` interpolation.
3. Confirm `/data/aeko/keys` exists on the deployment host.
4. Confirm the four required keypair files are present and non-empty.
5. Reload the Compose definition in Coolify and redeploy.

Do not replace the Coolify bind mounts with any `${...}` volume-source form, including the Dokploy `${VAR:?message}` pattern. The separate Coolify contract uses a literal host path specifically to satisfy Coolify's storage parser.


## Key preflight exit codes

`key-preflight` deliberately fails before faucet/validator startup when persistent identity material is not usable.

- **Exit 64**: a required file is missing, empty, or not a regular file. If the log names `/keys/faucet-keypair.json`, the bind mount parsed successfully but `/data/aeko/keys` on the Coolify host does not contain that file.
- **Exit 65**: the file exists but `aeko-keygen pubkey` cannot parse it as a valid AEKO keypair.

For exit 64, verify the exact Coolify variable value and inspect the same absolute path on the deployment server:

```bash
# Coolify compose binds this exact host directory; it is not parameterized.
sudo ls -la /data/aeko/keys
sudo test -s /data/aeko/keys/faucet-keypair.json
sudo test -s /data/aeko/keys/stake-keypair.json
sudo test -s /data/aeko/keys/validator-1-keypair.json
sudo test -s /data/aeko/keys/vote-1-keypair.json
```

If the old deployment stores the keys elsewhere, copy those existing files into `/data/aeko/keys` and preserve them outside the Coolify resource lifecycle. Do not solve exit 64 by generating replacement identities unless a fresh genesis is intentional.
