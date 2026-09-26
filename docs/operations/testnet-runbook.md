# Aeko Testnet — what broke, what fixed it, and how to run it cleanly

> **Historical incident notes.** This runbook preserves investigations from earlier testnet layouts. For current service names, Compose paths, public topology and deployment commands, use [`DEPLOYMENT.md`](../../DEPLOYMENT.md) and [`coolify.md`](./coolify.md). Commands that mention `docker-compose-testnet.yml`, `validator-1`, legacy Traefik labels or multi-validator profiles are historical and should not be copied into the current deployment.


This is the long-form companion to the testnet-recovery PR. Read it once, keep it as a runbook.

> **Deployment model:** the testnet is fronted by **Coolify + Traefik** (auto-TLS,
> auto-deploys on push). The day-to-day workflow lives in
> [`coolify.md`](./coolify.md). This file documents the bugs we hit getting there,
> the operating model under Coolify, and the verification + diagnostic playbook.

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

The explorer indexer is a block-by-block scraper. It needs the full surface — it calls methods that only exist in full mode. Without the `--full-rpc-api` flag, every one of its requests came back as `-32601 Method not found`, which is what you saw spamming the explorer-backend logs in a retry loop.

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

The compose file spins up four containers on a private docker network, fronted by Coolify-proxy (Traefik) for HTTPS termination and subdomain routing.

| Container | Image | What it does | Coolify route | Container port |
|---|---|---|---|---|
| `aeko-validator-1` | `aeko-validator:latest` | Produces blocks, serves RPC + pubsub + gossip | `rpc.aeko.online`, `ws.aeko.online` | `8899`, `8900`, `8001` |
| `aeko-validator-2/3` | same image | **Disabled by default** (multi-validator profile) | — | `8899` each |
| `aeko-faucet` | same image, different entrypoint | **Faucet Daemon**: private signer for policy-approved testnet funding | no public route | `9900` (TCP, Docker network only) |
| `aeko-explorer-backend` | `aeko-explorer-backend:latest` | Indexes blocks from RPC, exposes private REST API | private Docker network | `8088` |
| `aeko-explorer-ui` | `aeko-explorer-ui:latest` | Aeko Scan UI plus same-origin Scan API proxy (`node explorer-ui-server.mjs`) | `scan.aeko.online` | `4000` |

The bootstrap flow on first boot:

1. `validator-entrypoint.sh` sees `AEKO_BOOTSTRAP=1` and no existing `/ledger/genesis.bin`, so it runs `aeko-genesis` to create the genesis block with the bootstrap validator's identity, vote, and stake keypairs, plus the faucet keypair with 500 million AEKO test seed lamports. This test faucet seed is bootstrap liquidity only and is not the `tokenomics.md` 500B governed supply baseline.
2. `aeko-validator` starts, loads from genesis, immediately begins producing slots because `--no-wait-for-vote-to-start-leader` is set.
3. The PoH thread ticks ~3 slots per second. The banking stage processes any transactions in the mempool. The blockstore records the resulting shreds. With one validator, that's the entire pipeline — no network broadcast needed.
4. `aeko-faucet` is independently listening on container port 9900 with the faucet keypair loaded. It is NOT exposed to the public internet — the validator reaches it on the docker bridge at `faucet:9900`.
5. On the public testnet, the Explorer API funding module applies the off-chain queue policy. Approved or constrained developer funding flows call the Validator's protected low-level `requestAirdrop` path, and the Validator connects to the private Faucet Daemon on TCP `9900` to obtain the signed transfer transaction. Funding queue state is policy accounting only; supply accounting follows `tokenomics.md`.
6. `aeko-explorer-backend` reads finalized chain data from validator RPC, persists durable Explorer projections in PostgreSQL, and serves the REST API on `:8088`. The HTTP server binds while historical catch-up runs in a background task, so indexed history grows toward the finalized chain tip without substituting in-memory production state.
7. `aeko-explorer-ui` serves the deployment-neutral Vite SPA from `/app/dist` via `node /app/explorer-ui-server.mjs` (same-origin Scan API proxy, not `serve -s`). At container startup, `docker/explorer-ui-entrypoint.sh` injects the canonical `AEKO_*` endpoint values into `/app/dist/runtime-config.js`; public API calls use that runtime configuration.

---

## Part 3 — How to verify it's working right now

From your laptop or any machine on the internet:

**RPC health.**
```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://rpc.aeko.online
# → {"jsonrpc":"2.0","result":"ok","id":1}
```
If it says `Node is unhealthy`, the chain isn't advancing — see Part 6 diagnostics.

**Chain is advancing.** Same URL, replace method with `getSlot`. Run it twice ten seconds apart; the second number should be ~30 higher. If both numbers are `0`, the leader-stall bug came back (check the `--no-wait-for-vote-to-start-leader` flag is still on the command line in compose).

**Testnet funding works end-to-end.**
```bash
curl -X POST https://scan.aeko.online/api/explorer/testnet/funding/request \
  -H 'Content-Type: application/json' \
  -d '{"address":"<some-pubkey>"}'
aeko balance <some-pubkey> --url https://rpc.aeko.online
```

**Explorer is indexing.** `curl -s https://scan.aeko.online/api/explorer/testnet/blocks?limit=3` returns the three most recent blocks with non-zero `transactionCount`. Externally, the explorer UI at `https://scan.aeko.online` should show a list of recent blocks and a slot counter that ticks up.

**WebSocket reachable.** `wscat -c wss://ws.aeko.online` should connect.

**Validator is stable.** From Coolify UI → resource → Logs (or SSH if needed): `docker inspect aeko-validator-1 --format '{{.State.Status}} restarts={{.RestartCount}} health={{.State.Health.Status}}'` should say `running restarts=0 health=healthy` after the container has been up for at least ten minutes. Also: `docker logs aeko-validator-1 2>&1 | grep -c AEKO_PANIC` should be `0`.

---

## Part 4 — Developer experience: how outsiders connect

A developer building a dApp against your testnet needs four pieces of information: RPC URL, WebSocket URL, the cluster ID, and how to get test AEKO. Here's the canonical guide you should put in your docs page or developer portal.

### 4.1 Pointing the CLI

Install the `aeko` CLI (your fork of `solana` CLI). Then:
```bash
aeko config set --url https://rpc.aeko.online
```
From this point every CLI command (`aeko balance`, `aeko transfer`, `aeko program deploy`, etc.) hits your testnet. Behind the scenes `aeko config get` shows where it's pointed; this lives in `~/.config/aeko/cli/config.yml`.

### 4.2 Creating a wallet

`aeko-keygen new --outfile ~/my-dev-wallet.json` generates a fresh keypair and writes it to disk. `aeko address --keypair ~/my-dev-wallet.json` prints the public key. The same JSON file works for any Solana-compatible tooling (Phantom, Solflare, Anchor, Web3.js) that supports importing a keypair file.

### 4.3 Receiving testnet funding

**From the CLI.**
```bash
aeko airdrop 2 <pubkey>
```

**From JavaScript.** Using `@solana/web3.js`:
```js
import { Connection, PublicKey } from "@solana/web3.js";
const conn = new Connection("https://rpc.aeko.online", "confirmed");
const sig = await conn.requestAirdrop(new PublicKey("..."), 2_000_000_000); // 2 AEKO
await conn.confirmTransaction(sig);
```

The faucet keypair was seeded with 500 million AEKO at genesis, so the well is deep.

### 4.4 Subscribing to live updates

```js
const conn = new Connection(
  "https://rpc.aeko.online",
  { wsEndpoint: "wss://ws.aeko.online", commitment: "confirmed" }
);
conn.onSignature(sig, (notif) => { /* notif.err === null means success */ });
```

`signatureSubscribe`, `accountSubscribe`, `slotSubscribe`, `logsSubscribe` all work. `blockSubscribe` and `voteSubscribe` are explicitly enabled via `--rpc-pubsub-enable-block-subscription` and `--rpc-pubsub-enable-vote-subscription` in the validator command.

### 4.5 Browsing transactions

Send users to `https://scan.aeko.online` for the web UI. The Explorer UI's same-origin read proxy at `https://scan.aeko.online/api/explorer/testnet` exposes `/blocks`, `/transactions`, `/tokens/transfers`, `/nfts`, `/posts`, `/engagement`, `/stakes`, `/search?q=<sig-or-address>`, and `/health`.

### 4.6 Joining as an external validator (advanced)

External validators that want to peer with the testnet point `--entrypoint` at the gossip port. Gossip is a raw UDP/TCP protocol on port 8001 — **Traefik cannot proxy it**, so the entrypoint is a direct host hit on the public IP:

```bash
aeko-validator \
  --entrypoint gossip.aeko.online:8001 \
  --expected-genesis-hash <hash-from-getGenesisHash> \
  --known-validator <validator-1-identity-pubkey> \
  ...
```

The `gossip.aeko.online` DNS record points to the same EC2 IP as the other subdomains; this hostname is the **only** legitimate use of the `gossip.` prefix once `scan.aeko.online` is registered for the explorer UI.

---

## Part 5 — Subdomain & DNS layout (canonical reference)

Coolify-proxy (Traefik) handles all TLS termination and HTTP routing. You do not need nginx, you do not need certbot — Traefik auto-issues Let's Encrypt certs from the labels in `docker-compose-testnet.yml`. The earlier manual nginx+certbot procedure that used to live in this document is **obsolete**; see [`coolify.md`](./coolify.md) for the current setup.

### 5.1 The hostnames

| Subdomain | Routes to | Protocol | Purpose |
|---|---|---|---|
| `rpc.aeko.online` | validator-1:8899 | `https://` | JSON-RPC for wallets, dApps, CLIs |
| `ws.aeko.online` | validator-1:8900 | `wss://` | Pubsub WebSocket |
| `scan.aeko.online/api/explorer/testnet/*` | explorer-ui:4000 -> explorer-backend:8088 | `https://` | Explorer UI read-only proxy |
| `scan.aeko.online` | explorer-ui:3000 | `https://` | Explorer web UI (primary) |
| `gossip.aeko.online` | validator gossip | raw TCP+UDP | validator discovery/peer entrypoint only |
| `cloud.aeko.online` | Coolify dashboard (port 8000, managed by Coolify) | `http://`/`https://` | Operator UI |

The Faucet Daemon on TCP `9900` deliberately has **no public hostname**. User applications use the Testnet Funding Portal/Gateway; only the server-side Funding Gateway is authorized to invoke the deployed validator's low-level `requestAirdrop` path.

### 5.2 Namecheap DNS records

In Namecheap's Advanced DNS panel for `aeko.online`, the following A records should point to your EC2 elastic IP:

```
Type  Host       Value          TTL
A     rpc        3.80.154.37    Automatic
A     ws         3.80.154.37    Automatic
A     api        3.80.154.37    Automatic
A     scan       3.80.154.37    Automatic   (register when ready to migrate off `gossip.`)
A     gossip     3.80.154.37    Automatic   (external-validator entrypoint)
A     cloud      3.80.154.37    Automatic
A     coolify    3.80.154.37    Automatic
```

Make the EC2 IP an **elastic IP**; otherwise a stop/start will reassign the public IP and break every subdomain. Verify with `dig +short <name> @8.8.8.8` after editing.

### 5.3 AWS Security Group — recommended ruleset

With Coolify+Traefik in front, only HTTP/HTTPS and gossip need public ingress:

| Direction | Type | Port | Source | Why |
|---|---|---|---|---|
| Inbound | SSH | 22 | your IP only | Admin |
| Inbound | HTTP | 80 | 0.0.0.0/0 | Traefik (redirects to HTTPS) |
| Inbound | HTTPS | 443 | 0.0.0.0/0 | Traefik (all public traffic) |
| Inbound | Custom UDP | 8001 | 0.0.0.0/0 | Gossip — keep open if external validators federate; remove otherwise |
| Inbound | Custom TCP | 8001 | 0.0.0.0/0 | Gossip — same as above |

**Close from the public**: `8899, 8900, 8088, 3000, 9900`. The docker-proxy binds them to `0.0.0.0` so the SSH-deploy path can still use them, but Traefik reaches them on the docker bridge — the security group is what makes them publicly reachable. Closing them in the SG tightens the attack surface without changing any compose config.

### 5.4 Gossip is not a website

`gossip.aeko.online` is reserved for validator peer discovery on the published TCP/UDP transport range. The Explorer UI is only `https://scan.aeko.online`. Do not configure an HTTP route or Explorer fallback on the gossip hostname.

---

## Part 6 — Operator's daily checklist

1. **Containers up.** Coolify UI → resource page; every service should be green. Equivalent via SSH: `docker ps --filter name=aeko --format "{{.Names}}: {{.Status}}"`.

2. **Chain advancing.** `curl https://rpc.aeko.online -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}'` — run twice 10s apart, slot should grow by ~30.

3. **No panics in the validator log.** `docker logs aeko-validator-1 2>&1 | grep -c AEKO_PANIC` returns `0`.

4. **Explorer indexed something recent.** `curl https://scan.aeko.online/api/explorer/testnet/blocks?limit=1` should return a block whose `unixTimestamp` is within the last minute.

5. **WebSocket reachable.** `wscat -c wss://ws.aeko.online` should connect.

6. **TLS certs valid.** Coolify auto-renews via Traefik — Coolify UI → resource → Logs (or `docker logs coolify-proxy 2>&1 | grep -i acme`). No cert dashboard needed.

When something breaks, the diagnostic order:

- **Step 1: is the validator container healthy?** Coolify UI shows the healthcheck status; via SSH `docker inspect aeko-validator-1 --format '{{.State.Health.Status}}'`. `unhealthy` means `getHealth` is failing — proceed to step 2.
- **Step 2: is the chain advancing?** `getSlot` twice. If stuck, leader-stall bug — check the `--no-wait-for-vote-to-start-leader` flag.
- **Step 3: is the validator panicking?** Grep logs for `AEKO_PANIC`. If yes, the line itself tells you the thread and source location.
- **Step 4: is the SIGILL coming back?** `sudo dmesg --since '5 minutes ago' | grep trap`. If yes, the `AEKO_ENABLE_BROADCAST` gate was bypassed somehow.
- **Step 5: is the explorer behind?** Compare `getSlot` on RPC vs the latest slot in `/blocks?limit=1` — if explorer is more than a few slots behind, restart the indexer from Coolify UI (or `docker restart aeko-explorer-backend`).
- **Step 6: is Traefik routing?** `docker logs coolify-proxy 2>&1 | tail -50`. Look for `error obtaining certificate` (DNS not propagated yet) or `service "xyz" not found` (a Traefik label got mistyped on a recent edit).
- **Step 7: is DNS resolving?** `dig +short <subdomain>.aeko.online @8.8.8.8` from your laptop.
- **Step 8: is the SG blocking?** If a subdomain resolves but doesn't connect, the AWS security group probably hasn't allowed 443 from the right source — check the rules in the EC2 console.
