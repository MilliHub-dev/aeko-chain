#!/usr/bin/env bash
#
# Aeko Testnet — one-shot deploy / redeploy.
#
# What this does (idempotent):
#   1. Sanity-checks the host (docker + compose + disk + ulimits).
#   2. Generates the local-testnet keypair set on first run; reuses on subsequent runs.
#   3. Builds the validator image (only if Dockerfile changed; sccache makes incremental rebuilds fast).
#   4. Brings up faucet + validator-1 + explorer via docker-compose-testnet.yml.
#   5. Waits for getHealth == "ok" and getSlot to advance, then prints the endpoints.
#
# When to use it:
#   * Fresh server provisioning: `git clone ...`, `cd aeko`, `./scripts/deploy-testnet.sh`.
#   * After `git pull` to apply upstream changes: same command — it just rebuilds + restarts what changed.
#   * On the operator's laptop for a single-validator local testnet (override DOMAIN as needed).
#
# What it deliberately does NOT do:
#   * Touch nginx, TLS certs, DNS, or AWS security groups (see docs/operations/testnet-runbook.md Part 5).
#   * Wipe the chain. Named docker volumes (aeko_validator1-ledger, ...) persist across redeploys.
#     To start from genesis again, run `./scripts/deploy-testnet.sh --reset-chain`.
#   * Open the multi-validator topology. validator-2/3 are intentionally left stopped — see runbook §1.4.
#
# Env vars (all optional):
#   COMPOSE_FILE      compose file path (default: docker-compose-testnet.yml)
#   AEKO_DOMAIN       hostname clients will use (default: localhost). Only used for the final URL banner.
#   AEKO_KEYDIR       where keypairs live (default: ./local-testnet)
#   FORCE_REBUILD=1   force `docker compose build` even if the image exists.
#
# Exit codes: 0 success, 1 prerequisites missing, 2 build failed, 3 chain failed to advance.

set -euo pipefail

# ---- locate repo root (script is at scripts/deploy-testnet.sh) ----
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose-testnet.yml}
AEKO_DOMAIN=${AEKO_DOMAIN:-localhost}
AEKO_KEYDIR=${AEKO_KEYDIR:-local-testnet}
FORCE_REBUILD=${FORCE_REBUILD:-0}
RESET_CHAIN=0

for arg in "$@"; do
    case "$arg" in
        --reset-chain) RESET_CHAIN=1 ;;
        --force-rebuild) FORCE_REBUILD=1 ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "unknown flag: $arg"; exit 1 ;;
    esac
done

log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m   %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[err]\033[0m    %s\n' "$*" >&2; }

# ---- 1. host sanity ----
log "checking host prerequisites"
command -v docker >/dev/null 2>&1 || { err "docker not installed"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "docker compose plugin not installed"; exit 1; }
[ -f "$COMPOSE_FILE" ]              || { err "$COMPOSE_FILE not found (run from repo root)"; exit 1; }

# disk space — RocksDB + ledger grows quickly
AVAIL_GB=$(df -BG --output=avail "$REPO_ROOT" 2>/dev/null | tail -1 | tr -dc '0-9')
AVAIL_GB=${AVAIL_GB:-0}
if [ "$AVAIL_GB" -lt 20 ]; then
    warn "only ${AVAIL_GB}GB free on this filesystem; you want at least 20GB headroom for the ledger"
fi

# nofile ulimit — RocksDB needs 1M; docker-compose sets per-container, but the kernel limit matters too
KERN_MAX=$(cat /proc/sys/fs/nr_open 2>/dev/null || echo 0)
if [ "$KERN_MAX" -lt 1000000 ]; then
    warn "kernel fs.nr_open=$KERN_MAX is below 1M; set 'fs.nr_open=1048576' in /etc/sysctl.conf if validator-1 fails to start"
fi

# ---- 2. keypairs ----
KEYS=(faucet-keypair stake-keypair validator-1-keypair vote-1-keypair
      validator-2-keypair vote-2-keypair validator-3-keypair vote-3-keypair)

mkdir -p "$AEKO_KEYDIR"
NEED_KEYS=0
for k in "${KEYS[@]}"; do
    [ -f "$AEKO_KEYDIR/$k.json" ] || NEED_KEYS=1
done

if [ "$NEED_KEYS" -eq 1 ]; then
    log "generating missing keypairs in $AEKO_KEYDIR/ (will reuse existing)"
    # aeko-keygen runs inside a throwaway container so we don't require it on the host
    if ! docker image inspect aeko-validator:latest >/dev/null 2>&1; then
        log "no aeko-validator image yet — running compose build first so aeko-keygen is available"
        docker compose -f "$COMPOSE_FILE" build validator-1 || { err "build failed"; exit 2; }
    fi
    for k in "${KEYS[@]}"; do
        if [ ! -f "$AEKO_KEYDIR/$k.json" ]; then
            log "  $k.json"
            docker run --rm -v "$REPO_ROOT/$AEKO_KEYDIR:/keys" aeko-validator:latest \
                aeko-keygen new --no-bip39-passphrase --silent --outfile "/keys/$k.json"
        fi
    done
    log "keypairs ready"
else
    log "keypairs already present — reusing"
fi

# .gitignore safety: confirm we won't accidentally leak keys
if [ -f "$AEKO_KEYDIR/.gitignore" ]; then
    grep -q '\*.json' "$AEKO_KEYDIR/.gitignore" || warn "$AEKO_KEYDIR/.gitignore does not ignore *.json — keys could leak"
else
    warn "$AEKO_KEYDIR/.gitignore missing — creating one"
    echo '*.json' > "$AEKO_KEYDIR/.gitignore"
fi

# ---- 3. optional chain reset ----
if [ "$RESET_CHAIN" -eq 1 ]; then
    log "--reset-chain: wiping ledger volumes (chain restarts from genesis)"
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    for v in aeko_validator1-ledger aeko_validator2-ledger aeko_validator3-ledger aeko_rpcnode-ledger; do
        docker volume rm "$v" 2>/dev/null || true
    done
fi

# ---- 4. build ----
if [ "$FORCE_REBUILD" -eq 1 ] || ! docker image inspect aeko-validator:latest >/dev/null 2>&1; then
    log "building aeko-validator image (this is the long step on a cold cache)"
    docker compose -f "$COMPOSE_FILE" build validator-1 || { err "build failed"; exit 2; }
else
    log "aeko-validator image present — skipping build (set FORCE_REBUILD=1 to force)"
fi

# ---- 4b. ensure the coolify network exists ----
# docker-compose-testnet.yml declares 'coolify' as an external network so
# coolify-proxy can route to our containers when Coolify is in use. On hosts
# without Coolify, create an empty stand-in so plain `docker compose up`
# doesn't error on a missing external network. The Traefik labels in the
# compose simply sit unused without a proxy to honor them.
if ! docker network inspect coolify >/dev/null 2>&1; then
    log "creating stand-in 'coolify' network (no Coolify installed here)"
    docker network create coolify >/dev/null
fi

# ---- 5. start the services ----
# If a validator is already running and the chain is past slot ~500, auto-set
# AEKO_EXPLORER_START_SLOT so the explorer's sequential catch_up (~7 RPC calls
# per slot) doesn't take hours indexing historical blocks.
if [ -z "${AEKO_EXPLORER_START_SLOT:-}" ]; then
    SLOT=$(curl -s --max-time 2 -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 2>/dev/null \
        | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || true)
    if [ -n "$SLOT" ] && [ "$SLOT" -gt 500 ]; then
        START_SLOT=$((SLOT - 50))
        log "existing chain detected at slot $SLOT — setting AEKO_EXPLORER_START_SLOT=$START_SLOT for fast catch-up"
        export AEKO_EXPLORER_START_SLOT="$START_SLOT"
    fi
fi

log "starting faucet, validator-1, explorer-backend, explorer-ui"
docker compose -f "$COMPOSE_FILE" up -d --no-deps faucet validator-1 explorer-backend explorer-ui

# ---- 6. wait for liveness ----
log "waiting for validator RPC to come up (max 90s)"
HEALTHY=0
for i in $(seq 1 45); do
    sleep 2
    HEALTH=$(curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:8899 2>/dev/null || true)
    case "$HEALTH" in
        *'"result":"ok"'*) HEALTHY=1; break ;;
        *) printf '.' ;;
    esac
done
echo

if [ "$HEALTHY" -ne 1 ]; then
    err "validator RPC did not report getHealth=ok within 90s"
    err "last response: $HEALTH"
    err "logs: docker logs --tail 50 aeko-validator-1"
    exit 3
fi

log "waiting for chain to advance past slot 0 (max 30s)"
ADVANCED=0
SLOT_A=$(curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || echo 0)
for i in $(seq 1 15); do
    sleep 2
    SLOT_B=$(curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || echo 0)
    if [ "${SLOT_B:-0}" -gt "${SLOT_A:-0}" ] && [ "${SLOT_B:-0}" -gt 0 ]; then
        ADVANCED=1
        break
    fi
done

if [ "$ADVANCED" -ne 1 ]; then
    err "chain not advancing — getSlot stuck at $SLOT_A"
    err "this usually means --no-wait-for-vote-to-start-leader is missing or stake is wrong"
    err "logs: docker logs --tail 50 aeko-validator-1 | grep -E 'leader|vote|fork'"
    exit 3
fi

# ---- 7. summary ----
log "✓ testnet is live (slot $SLOT_B, advancing)"
cat <<EOF

  Direct host endpoints (SSH-deploy path — set AEKO_DOMAIN to change the banner):
    RPC          http://${AEKO_DOMAIN}:8899
    PubSub WS    ws://${AEKO_DOMAIN}:8900
    Explorer UI  http://${AEKO_DOMAIN}:3000
    Explorer API http://${AEKO_DOMAIN}:8088
    Faucet       (no direct port — use the validator's requestAirdrop RPC)

  If this host is also fronted by Coolify-proxy (Traefik), the canonical
  public URLs are the HTTPS subdomains — same containers, terminated TLS:
    RPC          https://rpc.aeko.online
    PubSub WS    wss://ws.aeko.online
    Explorer UI  https://scan.aeko.online   (or https://gossip.aeko.online until scan DNS is registered)
    Explorer API https://api.aeko.online

  Quick checks:
    curl -s -X POST -H 'Content-Type: application/json' \\
      -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \\
      http://127.0.0.1:8899

    docker logs -f aeko-validator-1
    docker logs -f aeko-explorer-backend
    docker logs -f aeko-explorer-ui

  See docs/operations/testnet-runbook.md for the full operations guide.

EOF
