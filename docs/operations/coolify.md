# Deploying the Aeko testnet via Coolify

Coolify is now the recommended way to manage the testnet. Push to GitHub, Coolify deploys. SSH stays reserved for break-glass — see [`deploy.md`](./deploy.md) for the SSH path.

This document covers the one-time Coolify setup and the day-to-day workflow once it's wired up. The repo itself has already been made Coolify-compatible: `docker-compose-testnet.yml` carries Traefik labels for the planned subdomains, and the services join the `coolify` external network so `coolify-proxy` can route to them.

***

## What Coolify gives you

| Capability | Source |
|---|---|
| Reads compose from your private GitHub repo, builds image, runs container stack | Coolify's docker-compose resource type |
| Auto-deploys on push to a tracked branch | GitHub App webhook → Coolify |
| Public HTTPS at `rpc.aeko.online`, `ws.aeko.online`, `cloud.aeko.online`, `api.aeko.online` | `coolify-proxy` (Traefik) reads the labels in the compose file |
| Let's Encrypt certs auto-issued and renewed | Built into `coolify-proxy` |
| Environment variables and secrets per resource | Coolify UI → Environment Variables |
| Web UI for logs, restarts, redeploys | `http://cloud.aeko.online:8000` (or `coolify.aeko.online` once wired) |

### How keypairs and ledger data persist

**Ledger volumes** — `validator1-ledger` (and `validator2-ledger`, `validator3-ledger`) are named Docker volumes. Coolify creates them as `<app-id>_validator1-ledger` on first deploy and they survive all subsequent redeploys. No action needed — these are fully managed by Docker.

**Keypairs** — the compose file bind-mounts individual JSON files from `./local-testnet/` (relative to Coolify's checkout directory at `/data/coolify/applications/<uuid>/`). These files are `.gitignore`d, so git never touches them. They survive `git pull`-based redeploys. **They do NOT survive a forced re-clone** (e.g., if you delete and re-add the Coolify resource). Back them up separately.

> **Important for docker-compose resources**: Coolify shows "Volume mounts are read-only in the Coolify dashboard" at the top of the Persistent Storage page. This is expected — all volume configuration must live in `docker-compose-testnet.yml`, not the UI. The volumes you see listed there (with empty source paths and `/ledger` destinations) are the named volumes Docker created from the compose file; they are correct and require no changes.

***

## One-time setup (UI work)

These steps run in the Coolify web UI. Estimated time: 20–30 minutes including DNS propagation.

### Step 1 — Put Coolify itself behind HTTPS

GitHub App webhooks require an HTTPS endpoint to reach. Right now your dashboard is plain HTTP on `:8000`. Fix this first.

1. In Namecheap, add an A record: `coolify.aeko.online → 3.80.154.37` (your EC2 IP).
2. Wait for DNS to propagate (verify with `dig +short coolify.aeko.online @8.8.8.8`).
3. In Coolify UI → **Settings → General → Instance Domain** → set `https://coolify.aeko.online`. Coolify-proxy will request a Let's Encrypt cert and start serving the dashboard at that hostname.
4. Re-bookmark the new URL; the `:8000` HTTP entry stays available as a fallback.

### Step 2 — Add the GitHub App source

1. Coolify UI → **Sources → New → GitHub App**.
2. Click "Create new GitHub App". Coolify opens a GitHub manifest prompt; accept it. GitHub creates a new app under your account named something like `coolify-aeko`.
3. Once back in Coolify, click **Install Repositories** and pick `MilliHub-dev/aeko-chain` (only — don't grant access to all repos).
4. Coolify shows the source as "Connected".

The app installation gives Coolify webhook events for `push`, `pull_request`, and `release`, plus read access to the repo's contents.

### Step 3 — Create the testnet project + resource

1. Coolify UI → **Projects → New Project** → name it `aeko-testnet`.
2. Inside the project → **Add Resource → Private Repository (with GitHub App)** → select the source you created in Step 2.
3. Coolify will detect `docker-compose-testnet.yml` automatically. If it prompts for the compose file path, enter `docker-compose-testnet.yml`.
4. Set the branch to `main`.
5. Check **Auto Deploy on Push** so future pushes to `main` redeploy automatically.
6. Save. Coolify clones the repo to `/data/coolify/applications/<uuid>/` and parses the compose file. It shows the detected services but does **not** deploy yet.

> The application UUID is visible in the Coolify dashboard URL when you're inside the resource (e.g., the URL contains `/xn2nges6p6bmvhzphqxsoiay`). Note it — you'll need it in Step 5.

### Step 4 — Configure environment variables (optional)

Coolify UI → resource → **Environment Variables**.

The only variable worth setting before first deploy:

| Variable | When to set |
|---|---|
| `AEKO_EXPLORER_START_SLOT` | If the chain has been running for a while — set it to `current_slot − 50` to skip historical catch-up. Leave unset (defaults to `0`) on a fresh genesis. |

All other configuration lives in `docker-compose-testnet.yml` and does not need to be re-entered here.

> **Do not try to configure volumes or bind mounts through the Coolify UI** for this resource. The "Persistent Storage" page is read-only for compose-based apps. Volume configuration is in the compose file and is already correct.

### Step 5 — Place keypairs on the host

SSH to the host once. This is the only SSH operation required for initial setup.

```bash
ssh ubuntu@cloud.aeko.online
```

The keypair files must live in Coolify's checkout of the repo at:

```
/data/coolify/applications/<uuid>/local-testnet/
```

For this deployment, `<uuid>` is `xn2nges6p6bmvhzphqxsoiay`, so the path is:

```
/data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet/
```

**If you already have keypairs from the SSH-deploy era** (e.g., in `~/aeko/local-testnet/`), copy them:

```bash
APP=/data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet
OLD=~/aeko/local-testnet

sudo cp $OLD/validator-1-keypair.json  $APP/validator-1-keypair.json
sudo cp $OLD/vote-1-keypair.json       $APP/vote-1-keypair.json
sudo cp $OLD/stake-keypair.json        $APP/stake-keypair.json
sudo cp $OLD/faucet-keypair.json       $APP/faucet-keypair.json
```

**If you want to generate fresh keypairs** (creates a new chain identity):

```bash
APP=/data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet
sudo mkdir -p $APP

for name in validator-1-keypair vote-1-keypair stake-keypair faucet-keypair; do
    sudo docker run --rm \
        -v $APP:/keys \
        aeko-validator:latest \
        aeko-keygen new --no-bip39-passphrase --silent --outfile /keys/$name.json
done
```

> **Back these up.** The files survive `git pull` redeploys because they're untracked (`.gitignore`d). If you ever delete the Coolify resource and re-add it, the checkout directory will be recreated from scratch and these files will be gone. Copy them somewhere safe — S3, 1Password, or your `~ubuntu/` home dir.

Verify the files are in place:

```bash
ls -la /data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet/
# expect: faucet-keypair.json  stake-keypair.json  validator-1-keypair.json  vote-1-keypair.json
```

### Step 6 — Point DNS at the EC2 IP and deploy

In Namecheap, add four A records (all pointing to `3.80.154.37`):

```
Type  Host       Value
A     rpc        3.80.154.37
A     ws         3.80.154.37
A     api        3.80.154.37
A     cloud      3.80.154.37    (if not already)
```

After DNS propagates, click **Deploy** in the Coolify UI. Coolify pulls the repo, runs `docker compose up`, registers the Traefik labels, and `coolify-proxy` requests Let's Encrypt certs for each hostname. First deploy can take 20–30 minutes because the validator image build is cold; subsequent deploys reuse sccache and finish in 1–3 minutes.

Verify:

```bash
curl https://rpc.aeko.online -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
# → {"jsonrpc":"2.0","result":"ok","id":1}

curl https://cloud.aeko.online/    # explorer UI returns HTML
curl https://api.aeko.online/blocks?limit=3   # JSON with recent blocks
wscat -c wss://ws.aeko.online       # WebSocket connects
```

***

## Day-to-day workflow

```
laptop edits → git push → GitHub webhook → Coolify pulls + redeploys
```

That's it. The auto-deploy hook on `main` does the work. No SSH needed.

### When to use the Coolify UI

- **Deploy a specific commit / rollback**: project → resource → "Deployments" tab → pick a prior commit → "Redeploy".
- **Tail logs**: resource → "Logs" tab. Filter by container.
- **Restart a single service**: resource → service row → "Restart". (Reuses the existing container image, doesn't re-clone.)
- **Override an env var without committing it to the repo**: resource → "Environment Variables" → add/edit. Survives redeploys.

### When you still need SSH

Reserve SSH for these only:

- Inspecting host-OS state (`docker network ls`, `df -h`, kernel limits)
- Placing or rotating keypairs under the application directory (see Step 5)
- Triaging Coolify itself if its dashboard is unreachable
- Anything in [`testnet-runbook.md` §6](./testnet-runbook.md#part-6--operators-daily-checklist) that requires `dmesg` or kernel-level evidence

When you SSH in to make config changes, **do not edit files under `/data/coolify/applications/<uuid>/`** except for the `local-testnet/` keypair files — everything else is overwritten on the next `git pull` redeploy.

***

## Coexistence with the SSH-deploy script

`./scripts/deploy-testnet.sh` is **not** deprecated. It stays useful for:

- Local-laptop testnets (the script runs identically against Docker for Mac / Linux).
- Servers where Coolify isn't installed or is sick.
- Fast iterative debugging when you don't want to push-to-deploy.

The script auto-creates an empty `coolify` Docker network on hosts that don't have one, so the same compose file works both ways. The Traefik labels are inert without a Traefik proxy; the host-port mappings (`8899:8899` etc.) are unaffected by Coolify and continue to serve direct traffic.

***

## Optional: enable the external-facing RPC node

`validator-1` produces blocks AND serves public RPC. Under any real load that conflates two responsibilities into one container: a slow `getProgramAccounts` request from a dApp can starve the banking stage and stall block production. The compose file ships a second, opt-in service for exactly this: `rpc-node`.

`rpc-node` is a **non-voting validator** (`--no-voting`, no vote account). It joins the cluster via gossip (`--entrypoint validator-1:8001`), pulls a snapshot, replays the ledger, and from then on tracks the chain like any other validator — but it never proposes blocks and never votes. It's a read replica: same RPC surface, isolated load. dApps reading from `rpc.aeko.online` end up here while the leader stays uncontested.

### Enabling it

1. **Generate an identity keypair for the node:**
   ```bash
   docker run --rm \
     -v /data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet:/keys \
     aeko-validator:latest \
     aeko-keygen new --no-bip39-passphrase --silent --outfile /keys/rpc-node-keypair.json
   ```
2. **Flip the profile in Coolify UI** → resource → Environment Variables → `COMPOSE_PROFILES=rpc-node` (or `multi-validator,rpc-node` if you've also enabled the extra block-producing validators). Save and redeploy.
3. **Watch the catch-up** — `docker logs aeko-rpc-node 2>&1 | grep -E 'snapshot|caught up'`. First boot takes minutes-to-hours depending on chain age (this is why the healthcheck has a 180 s `start_period`).
4. **Verify load balancing** — `for i in 1 2 3 4; do curl -s https://rpc.aeko.online -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getIdentity"}'; echo; done` should return two distinct identity pubkeys as Traefik round-robins between `validator-1` and `rpc-node`.

### How Traefik routes both

Both services declare `traefik.http.routers.aeko-rpc.service=aeko-rpc` and `loadbalancer.server.port=8899`. Traefik treats them as two backends of the same service and round-robins requests. When the `rpc-node` profile is inactive, only validator-1 backs the route. No conditional labels, no DNS changes needed — flip the profile, the LB pool changes.

### Naming clarification

`gossip.aeko.online` was originally being used as a temporary alias for the explorer UI while `scan.aeko.online` was being registered. Long term, the `gossip.` name is reserved for the **gossip protocol entrypoint** that external validators use:

```bash
aeko-validator \
  --entrypoint gossip.aeko.online:8001 \
  --expected-genesis-hash <hash> \
  --no-voting \
  ...
```

This is exactly the same thing `rpc-node` is doing internally — `gossip.aeko.online:8001` resolves to the EC2 IP, hits validator-1's gossip socket, and the joining node syncs. The `rpc-node` profile spins this up *inside* the compose stack for the public-facing read replica; teams running their own AEKO validator elsewhere use the same hostname externally.

***

## Optional: bootstrap the SocialFi state accounts

The five SocialFi programs (`social-posts`, `social-rewards`, `social-staking`, `social-anti-spam`, `social-monetization`) are **native builtins** — registered in `runtime/src/builtins.rs`, compiled into every validator. Their program IDs are recognized by the SVM the moment the chain starts. What they each still need before they're *usable* is a **state account**: an account owned by the program holding its global config (authority pubkey, fee parameters, reward vault, etc.) and the accumulators dApps write to.

The repo ships `social-bootstrap/`, a binary that creates all five state accounts and runs the matching `Initialize*` instruction in one go. Run it **once**, after the chain is producing blocks; the resulting pubkeys are what your dApp backend needs in env (see [`FRONTEND-DEV-GUIDE.md`](../../FRONTEND-DEV-GUIDE.md) for the consuming code).

### Running it from the host

```bash
# SSH into the Coolify host
ssh ubuntu@cloud.aeko.online

# Inside the validator container — already has aeko-cli and the keypairs.
# (Pick any container that has the binaries; explorer-backend doesn't.)
APP=/data/coolify/applications/xn2nges6p6bmvhzphqxsoiay
docker compose -f $APP/docker-compose-testnet.yml exec validator-1 \
  /usr/local/bin/aeko config set --url http://localhost:8899

# Build and run the bootstrap binary on the host (one-shot — not part of compose).
cd $APP
cargo run --release -p aeko-social-bootstrap -- 2>&1 | tee social-bootstrap.log
```

> Don't have a Rust toolchain on the host? Build the binary inside the validator image instead:
> ```bash
> docker run --rm -v $APP:/app -w /app aeko-validator:latest \
>   sh -c "cargo build --release -p aeko-social-bootstrap && cp target/release/aeko-social-bootstrap /app/local-testnet/"
> $APP/local-testnet/aeko-social-bootstrap
> ```

### Required environment

The binary reads these env vars (all paths are on the host, not inside a container):

| Var | Required | What it is |
|---|---|---|
| `AEKO_RPC_URL` | optional | RPC endpoint to submit to. Defaults to `http://localhost:8899` — fine when running from the host. Set to `https://rpc.aeko.online` to submit from elsewhere. |
| `AEKO_PAYER_KEYPAIR` | **required** | Path to a funded keypair file. Pays rent for five accounts (~0.1 AEKO total) and signs the create_account instructions. The faucet keypair from `local-testnet/faucet-keypair.json` works fine for the initial bootstrap. |
| `AEKO_AUTHORITY_KEYPAIR` | optional | Keypair that becomes the config authority on every program. Defaults to the payer. Use a separate key if you want to rotate the dApp's admin without disturbing the funding wallet. |
| `AEKO_TREASURY_ADDRESS` | optional | Pubkey that receives platform fees (monetization) and is recorded in rewards. Defaults to the authority pubkey. |
| `AEKO_REWARD_VAULT` | optional | Pubkey of the token account that holds creator-reward AEKO. Defaults to authority (placeholder). Replace with a real reward-vault pubkey before users start claiming. |
| `AEKO_STAKE_VAULT` | optional | Pubkey for staked AEKO custody. Defaults to authority (placeholder). |
| `AEKO_BOOTSTRAP_OUT_DIR` | optional | Where to write the generated state-account keypair JSON files. Defaults to `./local-testnet/social-state/`. |

### What you get

The binary prints a paste-ready env block when it finishes, e.g.:

```
SOCIAL_POSTS_STATE_ACCOUNT=2QB8wEBJ8jjMQu...
SOCIAL_REWARDS_STATE_ACCOUNT=4xRz3p9QwLm7n...
REWARD_VAULT_ACCOUNT=<the value you passed, or authority pubkey>
SOCIAL_STAKING_STATE_ACCOUNT=...
STAKING_COOLDOWN_EPOCHS=7
SOCIAL_ANTI_SPAM_STATE_ACCOUNT=...
SOCIAL_MONETIZATION_STATE_ACCOUNT=...
AEKO_TREASURY_ADDRESS=...
AEKO_PLATFORM_FEE_BPS=200
```

Paste these into the dApp backend's env (or into Coolify env vars on the admin-webapp resource, once that exists).

### Re-running

It's safe to re-run. The binary persists the generated state-account keypairs to `AEKO_BOOTSTRAP_OUT_DIR`; subsequent runs reuse them. The on-chain init handler refuses to re-initialize an account that's already owned by the program, and the binary treats that error as a no-op and continues.

If you want to **regenerate** one or more state accounts (different authority, fresh slate), delete the corresponding `<program>-state.json` file from the out-dir before re-running. A new keypair will be generated and a new account created. **Back up the old keypair first** if anything is already pointing at it.

### What still needs work

- **`REWARD_VAULT` / `STAKE_VAULT` are placeholders by default** — they default to the authority pubkey because there's no AEKO-20 token account creation built into this bootstrap yet. For a production-ready setup you'd create real token accounts under the rewards / staking program and pass their pubkeys via the env vars above before running the bootstrap. That's a next-PR concern.
- **The end-to-end happy path (anchor a post, claim a reward, open a stake)** has not been exercised by integration tests. The on-chain handlers were written but never wired into a running cluster before — verifying the full flow is the natural follow-up once the bootstrap binary is run on testnet.

***

## What's deliberately out of scope here

- **Multi-validator (validator-2, validator-3)**: their entries are in the compose file but are disabled by default via `profiles: ["multi-validator"]` (they require the broadcast-stage `ud2` bug to be fixed first — see [`testnet-runbook.md` §1.4](./testnet-runbook.md#14-the-phantom-ud2-trap-in-broadcast_shreds)). To enable them, set `COMPOSE_PROFILES=multi-validator` in Coolify's environment variables and place the corresponding keypairs in `local-testnet/` first.

- **Tightening AWS security group**: with Coolify-proxy fronting everything, you only need 80/443 open publicly. Closing 8899/8900/8088/3000 from the world is recommended once the subdomains are verified working. Do this in the AWS console, not Coolify.
- **Backups of persistent storage**: out of scope of this doc. Coolify has a backup feature for postgres-backed resources; for raw bind-mounted directories like `/data/coolify/applications/xn2nges6p6bmvhzphqxsoiay/local-testnet/keys-*` you're responsible for snapshotting. `restic` to an S3 bucket is the canonical answer.

- **Backups of keypairs and ledger data**: keypairs in `local-testnet/` need manual backup (they're untracked by git). The named ledger volumes (`xn2nges6p6bmvhzphqxsoiay_validator1-ledger`) are on the host's Docker volume store — snapshot via `docker run --rm -v <volume>:/data alpine tar -cz /data` or use `restic` to S3.
