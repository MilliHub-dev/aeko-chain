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
| Persistent storage outside the container filesystem | Coolify UI → Persistent Storage |
| Web UI for logs, restarts, redeploys | `http://cloud.aeko.online:8000` (or `coolify.aeko.online` once you wire it) |

The faucet keypair, validator/vote/stake keypairs are **not** in git (they're `.gitignore`d under `local-testnet/`). Two paths to get them onto a Coolify-deployed instance:

- **Persistent storage**: in the Coolify UI, declare a persistent mount like `/keys` for the validator + faucet, then SSH once to drop the JSON files into the mounted host directory. Subsequent deploys reuse the same files.
- **Generate at boot**: extend `validator-entrypoint.sh` to call `aeko-keygen new` for any missing keypair under `/keys/` and create a fresh genesis on first run. Cleaner for ephemeral testnets where you don't care about chain continuity across redeploys.

I picked persistent storage as the default in this runbook because it preserves the chain identity if you ever need to redeploy.

---

## One-time setup (UI work)

These five steps run in the Coolify web UI. Estimated time: 20–30 minutes including DNS propagation.

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
2. Inside the project → **Add Resource → Docker Compose → from GitHub** → pick the source from step 2.
3. Repo: `MilliHub-dev/aeko-chain`. Branch: `main`. Compose path: `docker-compose-testnet.yml`.
4. Check "Auto Deploy on Push" so future pushes to `main` redeploy automatically.
5. Save. Coolify clones the repo and parses the compose file but does **not** deploy yet — it shows the detected services and waits for you to add storage and env vars.

### Step 4 — Configure persistent storage + environment

Per service, in the Coolify UI:

**validator-1** — Persistent Storage:
- Mount path: `/keys` (inside container). Host path: `/data/coolify/aeko/keys-validator`.
- Mount path: `/ledger`. Host path: `/data/coolify/aeko/ledger-validator-1`. (Replaces the named volume in compose.)

**faucet** — Persistent Storage:
- Mount path: `/keys`. Host path: `/data/coolify/aeko/keys-faucet`.

**explorer** — no persistent storage required (the indexer is in-memory).

Environment variables can stay as defined in the compose file. The only one worth overriding from the UI is `AEKO_EXPLORER_START_SLOT` if a chain has been running for a while — set it to `current_slot − 50` to skip the historical catch-up (see [`deploy.md`](./deploy.md#explorer-catch-up-on-long-running-chains)).

### Step 5 — Drop the keypairs onto the persistent storage

SSH to the host once (the only time during normal operation):

```bash
ssh ubuntu@cloud.aeko.online
sudo mkdir -p /data/coolify/aeko/keys-validator /data/coolify/aeko/keys-faucet
```

If you already have keypairs from the SSH-deploy era, copy them:

```bash
sudo cp ~/aeko/local-testnet/validator-1-keypair.json /data/coolify/aeko/keys-validator/identity.json
sudo cp ~/aeko/local-testnet/vote-1-keypair.json      /data/coolify/aeko/keys-validator/vote.json
sudo cp ~/aeko/local-testnet/stake-keypair.json       /data/coolify/aeko/keys-validator/stake.json
sudo cp ~/aeko/local-testnet/faucet-keypair.json      /data/coolify/aeko/keys-validator/faucet.json
sudo cp ~/aeko/local-testnet/faucet-keypair.json      /data/coolify/aeko/keys-faucet/faucet.json
sudo chown -R 1000:1000 /data/coolify/aeko/keys-*
```

If you want a fresh chain identity, generate inside a throwaway container:

```bash
for name in identity vote stake faucet; do
    sudo docker run --rm -v /data/coolify/aeko/keys-validator:/keys aeko-validator:latest \
        aeko-keygen new --no-bip39-passphrase --silent --outfile /keys/$name.json
done
sudo cp /data/coolify/aeko/keys-validator/faucet.json /data/coolify/aeko/keys-faucet/faucet.json
```

This is the only SSH command you should expect to run in normal operation. After this, everything is UI-driven.

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
- Volume migration / chain reset that Coolify can't express cleanly
- Triaging Coolify itself if its dashboard is unreachable
- Rotating keypairs on persistent storage
- Anything in [`testnet-runbook.md` §6](./testnet-runbook.md#part-6--operators-daily-checklist) that requires `dmesg` or kernel-level evidence

When you do SSH in to make changes, **don't edit files in `~/aeko`** — that directory is no longer the source of truth under Coolify. Coolify pulls the repo into its own workspace under `/data/coolify/applications/<uuid>/` on every deploy. Edit through GitHub instead.

---

## Coexistence with the SSH-deploy script

`./scripts/deploy-testnet.sh` is **not** deprecated. It stays useful for:

- Local-laptop testnets (the script runs identically against Docker for Mac / Linux).
- Servers where Coolify isn't installed or is sick.
- Fast iterative debugging when you don't want to push-to-deploy.

The script auto-creates an empty `coolify` Docker network on hosts that don't have one, so the same compose file works both ways. The Traefik labels are inert without a Traefik proxy; the host-port mappings (`8899:8899` etc.) are unaffected by Coolify and continue to serve direct traffic.

In other words, the compose file is the lowest common denominator. Coolify reads it, the script reads it, both produce a healthy testnet.

---

## What's deliberately out of scope here

- **Multi-validator (validator-2, validator-3)**: their entries are in the compose but they're stopped. The broadcast-stage `ud2` trap (see [`testnet-runbook.md` §1.4](./testnet-runbook.md#14-the-phantom-ud2-trap-in-broadcast_shreds)) needs root-causing before turning them on. Set `AEKO_ENABLE_BROADCAST=1` in the Coolify env vars only after the bug is fixed.

- **Tightening AWS security group**: with Coolify-proxy fronting everything, you only need 80/443 open publicly. Closing 8899/8900/8088/3000 from the world is recommended once the subdomains are verified working. Do this in the AWS console, not Coolify.

- **Backups of persistent storage**: out of scope of this doc. Coolify has a backup feature for postgres-backed resources; for raw bind-mounted directories like `/data/coolify/aeko/keys-*` you're responsible for snapshotting. `restic` to an S3 bucket is the canonical answer.
