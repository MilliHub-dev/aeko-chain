# Aeko Testnet — what broke, what fixed it, and how to run it cleanly

This is the long-form companion to the testnet-recovery PR. Read it once, keep it as a runbook.

---

## Part 1 — The four root causes (in plain English)

The testnet was running but producing zero blocks. From a developer's perspective everything looked dead: RPC returned `Node is unhealthy`, the explorer page had no transactions, airdrops never confirmed. Underneath there were **four independent bugs stacked on top of each other**, each one masking the next.

### 1.1 The single-validator leader stall

Solana validators have a safety rule: don't try to lead a slot until you've successfully voted on something recently. The reasoning is that if a validator restarts after a long absence, jumping straight into block production can fork the network. So the validator says "I'll wait for my vote to land in a block before I lead."

Now imagine a fresh testnet where there's only one validator. It's supposed to lead every slot. But it can't lead its first slot until it's voted. And it can't vote until a block exists to vote on. And it can't produce a block until it leads. Classic chicken-and-egg.

You'd see this in the logs once per second forever: `Haven't landed a vote, so skipping my leader slot`. The chain stays at slot 0.

**The fix:** the `--no-wait-for-vote-to-start-leader` flag tells the validator to bypass that safety check on its first boot. Bootstrap validators in any single-node Solana cluster need this — `solana-test-validator` sets it by default; production deployments that use `solana-validator` directly need to pass it explicitly. Adding it to validator-1's command line in `docker-compose-testnet.yml` is the whole fix.

### 1.2 Explorer indexer getting "Method not found" from RPC

The validator's JSON-RPC server has two modes: a **minimal** mode (just the methods needed for basic wallet operations) and a **full** mode that includes things like `getProgramAccounts`, `getInflationRate`, `getInflationGovernor`, `getStakeActivation`, etc.

The explorer indexer is a block-by-block scraper. It needs the full surface — it calls methods that only exist in full mode. Without the `--full-rpc-api` flag, every one of its requests came back as `-32601 Method not found`, which is what you saw spamming `aeko-explorer` logs in a retry loop.

**The fix:** add `--full-rpc-api` to validator-1's command. While we're at it, expose host port `8900` for the pubsub WebSocket so wallets can subscribe to live transaction confirmations (this is what makes "your transaction confirmed!" appear in a dApp without page refresh). Port `8900` was previously claimed by `validator-2` for a different purpose; renumber that to `8902` to free `8900` for canonical use on validator-1.

### 1.3 bzip2 was missing from the runtime Docker image

This is the kind of bug that's invisible until you trip it. When the validator creates a snapshot (which happens at genesis and periodically thereafter), it spawns a `tar --bzip2` subprocess to archive the ledger into `genesis.tar.bz2`. The runtime stage of `Dockerfile.validator` was a minimal Debian image with only `ca-certificates`, `curl`, and `libudev1`. **No bzip2.**

So every snapshot attempt failed instantly with `bzip2: not found` (exit 127) and `tar: Wrote only 4096 of 10240 bytes`. The error propagated as an `Io(Custom)` error from the snapshot service. But here's the cascade: the snapshot service is holding locks while it does this. When it panics on the failed snapshot, those locks get **poisoned** — Rust's term for "the previous lock holder died unexpectedly, so anyone who tries to acquire this lock now will get an error instead of the data."

The lock-poisoning then cascaded into the **broadcast stage**, which does `bank_forks.read().unwrap()` on a `RwLock`. Because that lock was poisoned, `.unwrap()` panicked — and that panic's exit signal (a `ud2` illegal-instruction trap, exit code 132) is what `dmesg` was reporting as `traps: solBroadcastTx[…] trap invalid opcode`.

**The fix has two parts:** (a) `apt-get install bzip2` in the runtime Dockerfile stage so snapshot creation actually works; (b) make the cascade-prone unwraps poison-tolerant so a single unrelated failure can't take the entire broadcast stage down. Concretely, instead of `.read().unwrap()` we use `match … { Ok(g) => g, Err(p) => p.into_inner() }` — meaning "if the lock is poisoned, just use the data anyway." It's safe here because the broadcast stage only reads stats and forks; it doesn't depend on invariants that the panicked thread might have left half-written.

### 1.4 The phantom `ud2` trap in `broadcast_shreds`

After fixing 1–3, the validator successfully produced its first leader slot — then died exactly like before, with `solBroadcastTx` hitting an invalid opcode at a fixed offset inside `aeko_turbine::broadcast_stage::broadcast_shreds`. But this time something strange: the panic hook never fired. We had patched the hook to print a loud `!!! AEKO_PANIC !!!` line before exiting; the log was clean. **The crash was not going through Rust's panic machinery at all.**

When the compiler emits `ud2` after a function call, it normally means "this function is `-> !` so we shouldn't get here." But the function being called in this case is `aeko_measure::Measure::start("send_mmsg")` — a trivial constructor that just returns a struct. There's no reason for the compiler to mark its return as unreachable.

The honest answer is **this one was never fully root-caused.** It's most likely an LLVM optimizer bug exposed by something specific to this fork — possibly the panic-strategy interaction with `#[track_caller]`, possibly LTO inlining, possibly the rust-toolchain `1.85` being used inside the `rust:1.75` base image. It needs a proper bisect against upstream Solana and probably a backtrace from a debug build.

**The pragmatic fix for now:** the entire `broadcast_shreds` function is short-circuited behind a new environment variable `AEKO_ENABLE_BROADCAST`. When unset (the default), the function increments the shred-count stat and returns `Ok(())` immediately, skipping the crashing code path. This is **correct behavior for a single-validator testnet** — there are no peers to fan shreds out to, so the broadcast step is a no-op anyway. Block production happens in completely separate stages (PoH ticking, banking, blockstore record); broadcast is just network dissemination to peers.

When you go to a real multi-validator cluster you'll need to flip `AEKO_ENABLE_BROADCAST=1` and finish the investigation. Until then, single-validator works fine.

---

## Part 2 — Mental model of what's actually running

The compose file spins up four containers on a private docker network:

| Container | Image | What it does | Exposed on host |
|---|---|---|---|
| `aeko-validator-1` | `aeko-validator:latest` | Produces blocks, serves RPC + pubsub | `8001`, `8899`, `8900` |
| `aeko-validator-2/3` | same image | **Currently stopped** — restart-loop bug | `8902`, `8901` (if started) |
| `aeko-faucet` | same image, different entrypoint | Holds the genesis faucet keypair, hands out free SOL on request | `9900` (TCP only, internal) |
| `aeko-explorer` | `aeko-explorer:latest` | Indexes blocks from RPC + serves a web UI | `8088` (API), `3000` (UI) |

The bootstrap flow on first boot:

1. `validator-entrypoint.sh` sees `AEKO_BOOTSTRAP=1` and no existing `/ledger/genesis.bin`, so it runs `aeko-genesis` to create the genesis block with the bootstrap validator's identity, vote, and stake keypairs, plus the faucet keypair with 500 million AEKO seed lamports.
2. `aeko-validator` starts, loads from genesis, immediately begins producing slots because `--no-wait-for-vote-to-start-leader` is set.
3. The PoH thread ticks ~3 slots per second. The banking stage processes any transactions in the mempool. The blockstore records the resulting shreds. With one validator, that's the entire pipeline — no network broadcast needed.
4. `aeko-faucet` is independently listening on container port 9900 with the faucet keypair loaded.
5. When a developer hits `requestAirdrop` on the RPC, the validator's RPC server opens a TCP connection to `faucet:9900`, sends a request, gets back a signed transfer transaction, submits it through its own banking pipeline, and returns the signature.
6. The explorer hits the RPC every block, pulls `getBlock` data, persists into its database, exposes a REST API on `:8088`, and serves a Next.js UI on `:3000`.

The reason **all of this currently uses raw IPs and ports**: when the testnet was first deployed, nginx wasn't wired up for the validator services. Port 80/443 currently goes to coolify (which has its own thing running). The validator/RPC/pubsub/explorer all answer on their docker-proxy ports directly, which means clients have to know URLs like `http://cloud.aeko.online:8899` instead of clean subdomains. Part 5 fixes that.

---

## Part 3 — How to verify it's working right now

From your laptop or any machine on the internet, these checks confirm each piece:

**RPC health.** `curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://cloud.aeko.online:8899` should return `{"jsonrpc":"2.0","result":"ok","id":1}`. If it says `Node is unhealthy`, the chain isn't advancing — re-check the validator with `ssh ... 'sudo docker logs --tail 20 aeko-validator-1'`.

**Chain is advancing.** Same URL, replace method with `getSlot`. Run it twice ten seconds apart; the second number should be ~30 higher. If both numbers are `0`, the leader-stall bug came back (check the `--no-wait-for-vote-to-start-leader` flag is still on the command line in compose).

**Airdrop works end-to-end.** Use the `aeko` CLI from inside the validator container, or any external Solana-compatible CLI pointed at the testnet RPC. Run `aeko airdrop 1 <some-pubkey> --url http://cloud.aeko.online:8899`. Then `aeko balance <some-pubkey> --url http://cloud.aeko.online:8899` should show `1 AEKO`.

**Explorer is indexing.** Inside the server: `curl -s http://127.0.0.1:8088/blocks?limit=3` returns the three most recent blocks with non-zero `transactionCount`. Externally, the explorer UI at `http://cloud.aeko.online:3000` should show a list of recent blocks and a slot counter that ticks up.

**Validator is stable.** `ssh ... 'sudo docker inspect aeko-validator-1 --format "{{.State.Status}} restarts={{.RestartCount}}"'` should say `running restarts=0` after the container has been up for at least ten minutes. Also: `sudo docker logs aeko-validator-1 2>&1 | grep -c AEKO_PANIC` should be `0`.

---

## Part 4 — Developer experience: how outsiders connect

A developer building a dApp against your testnet needs four pieces of information: RPC URL, WebSocket URL, the cluster ID, and how to get test SOL. Here's the canonical guide you should put in your docs page or developer portal.

### 4.1 Pointing the CLI

Install the `aeko` CLI (your fork of `solana` CLI). Then `aeko config set --url http://cloud.aeko.online:8899`. From this point every CLI command (`aeko balance`, `aeko transfer`, `aeko program deploy`, etc.) hits your testnet. Behind the scenes `aeko config get` shows where it's pointed; this lives in `~/.config/aeko/cli/config.yml`.

### 4.2 Creating a wallet

`aeko-keygen new --outfile ~/my-dev-wallet.json` generates a fresh keypair and writes it to disk. `aeko address --keypair ~/my-dev-wallet.json` prints the public key. The same JSON file works for any Solana-compatible tooling (Phantom, Solflare, Anchor, Web3.js) that supports importing a keypair file.

For users of your dApp web UI, the wallet flow is whatever your frontend implements — typically Web3.js's `@solana/web3.js` `Keypair.generate()` or an injected wallet adapter (Phantom-style). Either way, what they get is a 32-byte Ed25519 private key with a Base58-encoded public key.

### 4.3 Receiving the airdrop

Three equivalent paths:

**From the CLI.** `aeko airdrop 2 <pubkey> --url http://cloud.aeko.online:8899`. Returns a signature. Confirms within a few seconds.

**From JavaScript.** Using `@solana/web3.js` (which works against your fork because it speaks the same JSON-RPC):

```js
import { Connection, PublicKey } from "@solana/web3.js";
const conn = new Connection("http://cloud.aeko.online:8899", "confirmed");
const sig = await conn.requestAirdrop(new PublicKey("..."), 2_000_000_000); // 2 AEKO
await conn.confirmTransaction(sig);
```

**From raw curl.** Just hit the RPC method directly with a JSON body. Useful for shell scripts and Postman testing.

The faucet hands out up to whatever per-time cap you've configured (default unlimited in development clusters). The faucet keypair was seeded with 500 million AEKO at genesis, so the well is deep.

### 4.4 Subscribing to live updates

For a responsive UI you don't want to poll `getSignatureStatuses` every second. Open a WebSocket to the pubsub endpoint and use `signatureSubscribe`:

```js
const conn = new Connection(
  "http://cloud.aeko.online:8899",
  { wsEndpoint: "ws://cloud.aeko.online:8900", commitment: "confirmed" }
);
conn.onSignature(sig, (notif) => { /* notif.err === null means success */ });
```

Same pattern works for `accountSubscribe` (watch a balance change), `slotSubscribe` (watch the chain tick), `logsSubscribe` (watch program output). All of this needs port 8900 reachable, which currently it isn't from the public internet — see Part 5.

### 4.5 Browsing transactions

Send users to `http://cloud.aeko.online:3000` for the web UI. For programmatic access, the explorer's REST API at port 8088 exposes `/blocks`, `/transactions`, `/tokens/transfers`, `/nfts`, `/posts`, `/engagement`, `/stakes`, `/search?q=<sig-or-address>`. Again, 8088 needs to be reachable externally — see Part 5.

---

## Part 5 — Moving from IPs to clean subdomains

Right now `networkConfig.js` falls back to `${PROTOCOL}//${HOSTNAME}:8899` etc. — meaning the frontend talks to whatever hostname the user typed in their browser, on hard-coded ports. That works for development but it's ugly, it's not HTTPS, and wallets that enforce secure-context constraints (most do) will refuse to connect to a plain `http://...:8899` from an `https://` page.

The fix is a four-layer change: **subdomains** in DNS, **security group** rules at AWS, **nginx** terminating TLS and reverse-proxying to the validator containers, and **Vite environment variables** so the frontend uses clean URLs instead of constructing them at runtime.

### 5.1 Recommended subdomain layout

You have `aeko.online`. The current host is `cloud.aeko.online → 3.80.154.37`. The recommendation is to keep `cloud.aeko.online` as the explorer landing page (matches the existing branding) and add sibling subdomains for each service. Don't nest under `cloud.` — flat names are shorter and easier for devs to remember.

| Subdomain | Points to (port behind nginx) | Public protocol | Purpose |
|---|---|---|---|
| `cloud.aeko.online` | 3000 (existing) | `https://` | Explorer web UI |
| `rpc.aeko.online` | 8899 | `https://` | JSON-RPC for wallets, dApps, CLIs |
| `ws.aeko.online` | 8900 | `wss://` | Pubsub WebSocket for live updates |
| `api.aeko.online` | 8088 | `https://` | Explorer REST API for analytics dashboards |
| `gossip.aeko.online` | 8001 | (raw TCP/UDP, no nginx) | Optional — only if external validators join |

The faucet (port 9900) deliberately does **not** get a subdomain. It speaks a custom binary TCP protocol that's not HTTP-compatible; nginx can't proxy it cleanly, and dApps don't talk to it directly — they go through the RPC's `requestAirdrop` method, which then talks to the internal `faucet:9900` Docker hostname. Keep 9900 internal.

If you ever stand up additional environments (staging, devnet-2), use `rpc.staging.aeko.online`, `rpc.devnet-2.aeko.online`, etc. — same pattern, namespaced one level deeper.

### 5.2 Namecheap DNS records

In Namecheap's Advanced DNS panel for `aeko.online`, add **four A records** pointing to your EC2 elastic IP (currently `3.80.154.37`):

```
Type  Host       Value          TTL
A     rpc        3.80.154.37    Automatic
A     ws         3.80.154.37    Automatic
A     api        3.80.154.37    Automatic
A     gossip     3.80.154.37    Automatic
```

Leave the existing `cloud → 3.80.154.37` record alone. Propagation usually completes in 5–30 minutes; you can verify with `dig +short rpc.aeko.online @8.8.8.8` from your laptop.

**Important:** make the EC2 instance's IP an **elastic IP** if it isn't already. Otherwise a stop/start cycle will assign a new public IP and break every subdomain at once. In the EC2 console: Elastic IPs → Allocate → Associate with your instance.

### 5.3 AWS Security Group rules

The instance currently allows 22 (SSH), 80, 443, 8899, 3000, 8001, and 9900 publicly. For the new subdomain layout, **only 80 and 443 need to be open to the world** — everything else is talked to via nginx. That's a major security improvement: right now anyone on the internet can directly hit the validator's gossip and faucet sockets.

In the EC2 security group attached to your instance:

| Direction | Type | Port | Source | Why |
|---|---|---|---|---|
| Inbound | SSH | 22 | your IP only | Admin |
| Inbound | HTTP | 80 | 0.0.0.0/0 | nginx (redirects to HTTPS) |
| Inbound | HTTPS | 443 | 0.0.0.0/0 | nginx (all public traffic) |
| Inbound | Custom UDP | 8001 | 0.0.0.0/0 | Only if external validators will join via gossip — otherwise remove |
| Inbound | Custom TCP | 8001 | 0.0.0.0/0 | Same |

**Remove from public**: 8899, 8900, 8088, 9900, 3000 — close them in the security group so they're only reachable from `localhost` (which nginx is). The docker-proxy already binds to `0.0.0.0` for these, but the security group is what makes them internet-reachable. Tighten the SG and they become localhost-only without changing any docker config.

### 5.4 nginx as the front door

Install nginx on the host directly (not in a container — simpler). On Ubuntu:

```
sudo apt-get install -y nginx
sudo systemctl enable --now nginx
```

You'll likely have a conflict with `coolify-proxy` which currently holds port 80. Either move coolify aside or pick one. If you're not using coolify, stop and disable it:

```
sudo docker stop coolify-proxy coolify coolify-realtime coolify-sentinel coolify-db coolify-redis
sudo docker update --restart=no coolify-proxy coolify coolify-realtime coolify-sentinel coolify-db coolify-redis
```

(If you ARE using coolify for something else, you'll need to configure nginx to listen on different ports OR add the testnet subdomains to coolify's reverse proxy instead. The principles below apply to coolify too — just the syntax is different.)

Then create `/etc/nginx/sites-available/aeko-testnet` with **one server block per subdomain**. Here's the minimum content (replace any host-IP references with `127.0.0.1` because nginx is on the same host as the docker-proxy):

```nginx
# /etc/nginx/sites-available/aeko-testnet

# RPC: rpc.aeko.online → :8899
server {
    listen 80;
    listen [::]:80;
    server_name rpc.aeko.online;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name rpc.aeko.online;

    # certs filled in by certbot, see 5.5 below
    ssl_certificate     /etc/letsencrypt/live/rpc.aeko.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rpc.aeko.online/privkey.pem;

    # Solana RPC is JSON over POST — keep request body limit reasonable
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8899;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS so browsers can call the RPC from any dApp frontend
        add_header Access-Control-Allow-Origin *  always;
        add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        if ($request_method = OPTIONS) { return 204; }
    }
}

# WebSocket: ws.aeko.online → :8900
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ws.aeko.online;

    ssl_certificate     /etc/letsencrypt/live/ws.aeko.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ws.aeko.online/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8900;
        proxy_http_version 1.1;

        # WebSocket-specific upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;  # keep idle WS connections alive
        proxy_send_timeout 86400s;
    }
}

# Explorer API: api.aeko.online → :8088
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.aeko.online;

    ssl_certificate     /etc/letsencrypt/live/api.aeko.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.aeko.online/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        add_header Access-Control-Allow-Origin * always;
    }
}

# Explorer UI: cloud.aeko.online → :3000
server {
    listen 80;
    listen [::]:80;
    server_name cloud.aeko.online;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name cloud.aeko.online;

    ssl_certificate     /etc/letsencrypt/live/cloud.aeko.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cloud.aeko.online/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Next.js may use WebSockets for HMR, future-proof:
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable the site and reload:

```
sudo ln -s /etc/nginx/sites-available/aeko-testnet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.5 TLS certificates with Let's Encrypt

`certbot` automates this. Install once, then run it per-hostname:

```
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d rpc.aeko.online \
  -d ws.aeko.online \
  -d api.aeko.online \
  -d cloud.aeko.online \
  --agree-tos -m devsurdma@gmail.com --non-interactive --redirect
```

Certbot will rewrite the nginx config to add the SSL paths automatically, request certs for all four hostnames in a single API call, and install a systemd timer (`certbot.timer`) that renews them every ~60 days. Verify with `sudo certbot certificates`.

If certbot complains about a hostname not resolving, DNS hasn't propagated yet — `dig +short <name> @8.8.8.8` until you see the right IP, then re-run.

### 5.6 Pointing the frontend at the new URLs

`networkConfig.js` already supports environment overrides via `VITE_AEKO_TESTNET_*` variables. In the web app's `.env.production` (or wherever Vite reads from during build):

```
VITE_AEKO_TESTNET_RPC=https://rpc.aeko.online
VITE_AEKO_TESTNET_WS=wss://ws.aeko.online
VITE_AEKO_TESTNET_EXPLORER=https://cloud.aeko.online
VITE_AEKO_TESTNET_EXPLORER_API=https://api.aeko.online
VITE_AEKO_TESTNET_FAUCET_URL=https://rpc.aeko.online
```

The last one is deliberately the RPC URL, not a `faucet.aeko.online` — because the faucet isn't HTTP. Any code that wants to airdrop should call `connection.requestAirdrop()` against the RPC, which forwards to the internal faucet TCP socket. Whatever UI element the frontend shows for "request airdrop" should be wired to that RPC call, not a direct request to the faucet port.

Rebuild and redeploy the frontend (whatever your pipeline is — `npm run build` then upload to S3/Vercel/wherever), and the wallet pages will start using clean HTTPS URLs.

### 5.7 Validator's own `--public-rpc-address`

One subtlety: the validator's `getClusterNodes` RPC method advertises the validator's own contact information — currently it reports `127.0.0.1:8899` because that's what it binds to inside the container. If you want external dApps to see the canonical `rpc.aeko.online` in cluster info responses, add `--public-rpc-address rpc.aeko.online:443` to the validator's command line in `docker-compose-testnet.yml`. This is cosmetic for most use cases but matters if other validators or RPC nodes will federate with yours.

---

## Part 6 — Operator's daily checklist

Once everything in Part 5 is wired up, here's what to sanity-check whenever you touch anything:

1. **Containers up.** `sudo docker ps --filter name=aeko --format "{{.Names}}: {{.Status}}"` should show `aeko-validator-1`, `aeko-faucet`, `aeko-explorer` all `Up`, with the validator's uptime increasing across checks (i.e. not silently restart-looping).

2. **Chain advancing.** `curl https://rpc.aeko.online -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}'` — run twice 10s apart, slot should grow by ~30.

3. **No panics in the validator log.** `sudo docker logs aeko-validator-1 2>&1 | grep -c AEKO_PANIC` returns `0`. If it returns anything else, grep for the actual line — the eprintln will give you thread name, source location, and message.

4. **Explorer indexed something recent.** `curl https://api.aeko.online/blocks?limit=1` should return a block whose `unixTimestamp` is within the last minute.

5. **WebSocket reachable.** `wscat -c wss://ws.aeko.online` should connect (install `wscat` via npm if you don't have it). If it hangs, nginx config or security group is wrong.

6. **TLS certs valid.** `sudo certbot certificates` — every cert should show "VALID" with > 30 days remaining. If anything's < 30 days, run `sudo certbot renew --dry-run` and check the timer is running with `systemctl status certbot.timer`.

When something breaks, the diagnostic order to follow:

- Step 1: is the validator container up? `docker ps`. If not, `docker logs --tail 50 aeko-validator-1`.
- Step 2: is the chain advancing? `getSlot` twice. If stuck, leader-stall bug — check the `--no-wait-for-vote-to-start-leader` flag.
- Step 3: is the validator panicking? Grep logs for `AEKO_PANIC`. If yes, the line itself tells you the thread and source location.
- Step 4: is the SIGILL coming back? `sudo dmesg --since '5 minutes ago' | grep trap`. If yes, the `AEKO_ENABLE_BROADCAST` gate was bypassed somehow.
- Step 5: is the explorer behind? Compare `getSlot` on RPC vs the latest slot in `/blocks?limit=1` — if explorer is more than a few slots behind, restart the indexer with `docker restart aeko-explorer`.
- Step 6: is nginx healthy? `sudo systemctl status nginx`, `sudo nginx -t`. Check `/var/log/nginx/error.log` for upstream errors.
- Step 7: is DNS resolving? `dig +short <subdomain>.aeko.online @8.8.8.8` from your laptop.
