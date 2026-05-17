# Deploying / redeploying the Aeko testnet

This is the short version. For the why-it-broke-and-how-it-works background, read [`testnet-runbook.md`](./testnet-runbook.md).

The goal of this document: any operator with SSH access to a fresh Ubuntu host can bring the testnet up from a clean checkout in one command, and any subsequent change (whether made locally or via SSH) flows through the same git → pull → redeploy loop with zero hand-editing on the server.

---

## 1. The deploy contract

The repository is the source of truth. **Nothing important lives only on the server.** Concretely:

- Source code, Dockerfiles, compose files, entrypoint scripts — all in git.
- The deploy script (`scripts/deploy-testnet.sh`) — in git.
- The validator/vote/stake/faucet **keypairs** — NOT in git (they're secrets). The deploy script generates them on first run and reuses them on every subsequent run. They live under `local-testnet/*.json` which is `.gitignore`d.
- The **chain ledger** — NOT in the repo. It lives in named docker volumes (`aeko_validator1-ledger` etc.) that persist across container/repo replacements. The chain survives a `git pull && deploy` cycle.

If you find yourself editing a file directly on the server "just this once," stop. Either commit the change in git and pull it on the server, or it's lost the moment the next deploy happens.

---

## 2. Fresh server (first deploy ever)

On a clean Ubuntu 22.04+ host:

```bash
# 1. install prerequisites
sudo apt-get update
sudo apt-get install -y git docker.io docker-compose-plugin curl
sudo usermod -aG docker $USER
newgrp docker   # so the current shell sees the group change

# 2. raise the file descriptor ceiling (RocksDB needs it)
echo 'fs.nr_open = 1048576' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 3. clone the repo
git clone https://github.com/MilliHub-dev/aeko-chain.git ~/aeko
cd ~/aeko

# 4. one command brings the whole stack up
./scripts/deploy-testnet.sh
```

That's the entire fresh-server flow. The script generates keypairs the first time, builds the validator image (slow — 20–30 min on a cold cache, fast on subsequent runs because of sccache), starts the containers, waits for `getHealth=ok` and a non-zero slot, and prints the endpoint summary.

If anything fails the script exits with a specific code and tells you what to look at. Common ones:

- Exit 1: missing docker / wrong working directory.
- Exit 2: `docker compose build` failed — read the build log; usually it's a Cargo network/cache issue, re-running often resolves it.
- Exit 3: chain didn't advance — read `docker logs aeko-validator-1` and look for the signatures in the runbook §6.

### Securing the network layer (optional but strongly recommended for public testnets)

The fresh deploy exposes raw RPC/pubsub/explorer ports through the docker-proxy. For anything internet-facing, follow [runbook §5](./testnet-runbook.md#part-5--moving-from-ips-to-clean-subdomains) to add DNS, nginx + TLS, and tighten the AWS security group.

---

## 3. Redeploy after a code change

Everything flows through git. There are exactly two valid edit paths.

### Path A — change made on your laptop

```bash
# 1. on your laptop
git checkout -b <descriptive-branch>
# ... edit files ...
git commit -m "fix(scope): short description"
git push origin HEAD
gh pr create   # or open via GitHub UI
# review + merge into main

# 2. on the server
ssh ubuntu@cloud.aeko.online
cd ~/aeko
git pull origin main
./scripts/deploy-testnet.sh   # rebuilds only what changed
```

### Path B — change made on the server via SSH

```bash
# 1. on the server
cd ~/aeko
git checkout -b <descriptive-branch>
# ... edit files ...
git commit -m "fix(scope): short description"
git push origin HEAD            # requires git credentials configured on the server

# 2. on the server (or laptop after pull)
gh pr create                    # GitHub CLI; or open via UI
# review + merge into main

# 3. back on the server (or wherever you want to deploy)
git checkout main
git pull origin main
./scripts/deploy-testnet.sh
```

The deploy script is **idempotent**. Running it when nothing has changed just verifies health and exits in a few seconds. Running it after a `git pull` rebuilds the image only if Dockerfile/sources changed (Docker's layer cache + sccache handle that), restarts containers, and waits for liveness. The chain ledger in the named volume is preserved across all of this.

To start over from genesis (loses the chain history), pass `--reset-chain`:

```bash
./scripts/deploy-testnet.sh --reset-chain
```

To force a rebuild even if Docker thinks nothing changed:

```bash
FORCE_REBUILD=1 ./scripts/deploy-testnet.sh
```

### Explorer catch-up on long-running chains

The explorer indexer (`aeko-explorer-backend`) walks every slot from `AEKO_EXPLORER_START_SLOT` to the current tip sequentially, making roughly seven RPC calls per slot (block, transactions, token transfers, NFT updates, social posts, creator rewards, engagement events, social stakes, wallet profiles). On a fresh genesis this is instant. On a chain that's been running for hours, indexing every historical slot can take a very long time — long enough that the explorer container looks hung and its HTTP endpoint never opens.

The deploy script handles this automatically: if it detects an existing healthy chain past slot ~500, it sets `AEKO_EXPLORER_START_SLOT` to `current_slot - 50` so the explorer catches up the most recent window only. Fresh genesis runs use the compose default of `0`.

To override manually (e.g. after a chain reset that the script can't see, or to deliberately re-index a window):

```bash
AEKO_EXPLORER_START_SLOT=12000 ./scripts/deploy-testnet.sh
```

Indexed history is in-memory only; the explorer rebuilds its view from the start slot every time its container restarts. There is no on-disk persistence of indexed data, so picking a recent start slot does not "lose" anything that wasn't already going to be discarded on the next restart.

---

## 4. Migrating to a different server (or rebuilding from scratch)

The whole point of this design is that the server is disposable. To move to a new host:

1. **(optional) back up keypairs.** The new host can either generate fresh keypairs (which means a fresh genesis and a new chain) or reuse the existing ones to keep the same chain identity. To reuse:

   ```bash
   # on the old host
   tar czf /tmp/aeko-keys.tar.gz -C ~/aeko local-testnet

   # on your laptop
   scp -i path/to/aeko_alpha.pem ubuntu@old-host:/tmp/aeko-keys.tar.gz .
   scp -i path/to/aeko_alpha.pem aeko-keys.tar.gz ubuntu@new-host:/tmp/

   # on the new host (after the git clone in §2 step 3)
   tar xzf /tmp/aeko-keys.tar.gz -C ~/aeko
   ```

2. **(optional) snapshot the chain.** If you want chain continuity (block history, account state), copy the rocksdb snapshot too. Skip this for a fresh chain.

   ```bash
   # on the old host
   docker exec aeko-validator-1 ls /ledger    # confirm path
   docker run --rm -v aeko_validator1-ledger:/src -v /tmp:/dst alpine \
     tar czf /dst/aeko-ledger.tar.gz -C /src .

   # transfer the tarball via scp like above, then on the new host:
   docker volume create aeko_validator1-ledger
   docker run --rm -v aeko_validator1-ledger:/dst -v /tmp:/src alpine \
     tar xzf /src/aeko-ledger.tar.gz -C /dst
   ```

3. **Bring it up.** Same one-liner as a fresh deploy: `./scripts/deploy-testnet.sh`. The script sees the existing keypairs and ledger and just starts the containers.

4. **Repoint DNS.** Update the A records for `rpc.aeko.online`, `ws.aeko.online`, `api.aeko.online`, `cloud.aeko.online` in Namecheap to the new IP. Re-issue TLS certs with certbot (the existing certs are tied to the old IP — Let's Encrypt re-validates per-IP for HTTP-01 challenges; if you used DNS-01 challenges originally, the certs migrate).

5. **Decommission the old host** once the new one is verified healthy and DNS has propagated.

---

## 5. Reconciling a server that drifted from git

If you (or a previous operator) edited files directly on the server without committing — meaning `~/aeko/` is not a git checkout, or it is but it has untracked/modified files — here's the safe way to get back to a known state without losing anything.

```bash
# 1. stop the containers (named volumes are NOT deleted)
docker compose -f docker-compose-testnet.yml down

# 2. full backup of the current state
mv ~/aeko ~/aeko-backup-$(date +%Y%m%d-%H%M%S)

# 3. fresh checkout
git clone https://github.com/MilliHub-dev/aeko-chain.git ~/aeko
cd ~/aeko

# 4. restore keypairs (and any wallets) from the backup
cp ~/aeko-backup-*/local-testnet/*.json local-testnet/
cp ~/aeko-backup-*/test-wallet.json . 2>/dev/null || true

# 5. bring everything back up — chain state in named volumes is preserved
./scripts/deploy-testnet.sh

# 6. once verified healthy, delete the backup (or keep it as long as you have disk)
# rm -rf ~/aeko-backup-*
```

If the server had real source code edits that never made it to git, those edits live in `~/aeko-backup-*/`. Diff that against the fresh checkout, decide what's worth keeping, and PR it through Path A above.

---

## 6. Troubleshooting

Anything that goes wrong should be findable in [`testnet-runbook.md` §6](./testnet-runbook.md#part-6--operators-daily-checklist). The most common failure modes after a redeploy:

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy script exits 3 with "getHealth not ok" | Validator failed to boot. | `docker logs --tail 80 aeko-validator-1` — look for `ERROR` lines. |
| Deploy script exits 3 with "chain not advancing" | Leader-stall regression. | Confirm `--no-wait-for-vote-to-start-leader` is still in the compose `command:` block. |
| Container immediately restarts with exit 132 | `AEKO_ENABLE_BROADCAST=1` was set unintentionally and the ud2 trap is back. | Unset it (default behavior). For multi-validator, see [runbook §1.4](./testnet-runbook.md#14-the-phantom-ud2-trap-in-broadcast_shreds). |
| Genesis fails with "bzip2 not found" | Dockerfile.validator on disk doesn't have the bzip2 line. | Make sure you're on `main` and re-deploy. |
| Explorer endpoint returns empty data | Indexer paused after RPC went unhealthy. | `docker restart aeko-explorer` and wait 30s. |
| External clients can't reach RPC | DNS/nginx/security group misconfigured. | See [runbook §5](./testnet-runbook.md#part-5--moving-from-ips-to-clean-subdomains). |

When in doubt, the operator's checklist in [runbook §6](./testnet-runbook.md#part-6--operators-daily-checklist) is the canonical step-by-step.
