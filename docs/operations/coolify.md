# Deploying the Aeko testnet via Coolify

Coolify is now the recommended way to manage the testnet. Push to GitHub, Coolify deploys. SSH stays reserved for break-glass — see [`deploy.md`](./deploy.md) for the SSH path.

This document covers the one-time Coolify setup and the day-to-day workflow once it's wired up. The repo itself has already been made Coolify-compatible: `docker-compose-testnet.yml` carries Traefik labels for the planned subdomains, and the services join the `coolify` external network so `coolify-proxy` can route to them.

---

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

---

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

---

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

---

## Coexistence with the SSH-deploy script

`./scripts/deploy-testnet.sh` is **not** deprecated. It stays useful for:

- Local-laptop testnets (the script runs identically against Docker for Mac / Linux).
- Servers where Coolify isn't installed or is sick.
- Fast iterative debugging when you don't want to push-to-deploy.

The script auto-creates an empty `coolify` Docker network on hosts that don't have one, so the same compose file works both ways. The Traefik labels are inert without a Traefik proxy; the host-port mappings (`8899:8899` etc.) are unaffected by Coolify and continue to serve direct traffic.

---

## What's deliberately out of scope here

- **Multi-validator (validator-2, validator-3)**: their entries are in the compose file but are disabled by default via `profiles: ["multi-validator"]` (they require the broadcast-stage `ud2` bug to be fixed first — see [`testnet-runbook.md` §1.4](./testnet-runbook.md#14-the-phantom-ud2-trap-in-broadcast_shreds)). To enable them, set `COMPOSE_PROFILES=multi-validator` in Coolify's environment variables and place the corresponding keypairs in `local-testnet/` first.

- **Tightening AWS security group**: with Coolify-proxy fronting everything, you only need 80/443 open publicly. Closing 8899/8900/8088/3000 from the world is recommended once the subdomains are verified working. Do this in the AWS console, not Coolify.

- **Backups of keypairs and ledger data**: keypairs in `local-testnet/` need manual backup (they're untracked by git). The named ledger volumes (`xn2nges6p6bmvhzphqxsoiay_validator1-ledger`) are on the host's Docker volume store — snapshot via `docker run --rm -v <volume>:/data alpine tar -cz /data` or use `restic` to S3.
