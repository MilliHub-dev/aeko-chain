#!/usr/bin/env bash
#
# AEKO Testnet — one-shot local/server deploy using the canonical Dockerfile
# and portable docker-compose.yml.
#
# What this does (idempotent):
#   1. Sanity-checks Docker, disk and ulimits.
#   2. Generates missing keypairs with the `tools` Docker target.
#   3. Builds the role-specific runtime images from the single root Dockerfile.
#   4. Starts faucet + validator + explorer-api + explorer-ui.
#   5. Verifies RPC health and that slots advance.
#
# PostgreSQL is external. Set EXPLORER_DATABASE_URL for persistent explorer
# storage. If it is unset the explorer uses its in-memory fallback.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
AEKO_DOMAIN=${AEKO_DOMAIN:-localhost}
AEKO_KEYDIR=${AEKO_KEYDIR:-local-testnet}
AEKO_IMAGE_REPOSITORY=${AEKO_IMAGE_REPOSITORY:-surdma}
AEKO_IMAGE_TAG=${AEKO_IMAGE_TAG:-latest}
FORCE_REBUILD=${FORCE_REBUILD:-0}
RESET_CHAIN=0

for arg in "$@"; do
  case "$arg" in
    --reset-chain) RESET_CHAIN=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m   %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[err]\033[0m    %s\n' "$*" >&2; }

log "checking host prerequisites"
command -v docker >/dev/null 2>&1 || { err "docker not installed"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "docker compose plugin not installed"; exit 1; }
[ -f "$COMPOSE_FILE" ] || { err "$COMPOSE_FILE not found"; exit 1; }
[ -f Dockerfile ] || { err "root Dockerfile not found"; exit 1; }

AVAIL_GB=$(df -BG --output=avail "$REPO_ROOT" 2>/dev/null | tail -1 | tr -dc '0-9')
AVAIL_GB=${AVAIL_GB:-0}
if [ "$AVAIL_GB" -lt 20 ]; then
  warn "only ${AVAIL_GB}GB free; keep at least 20GB headroom for the ledger"
fi

KERN_MAX=$(cat /proc/sys/fs/nr_open 2>/dev/null || echo 0)
if [ "$KERN_MAX" -lt 1000000 ]; then
  warn "kernel fs.nr_open=$KERN_MAX is below 1M"
fi

mkdir -p "$AEKO_KEYDIR"
KEYS=(faucet-keypair stake-keypair validator-1-keypair vote-1-keypair rpc-node-keypair)
NEED_KEYS=0
for key in "${KEYS[@]}"; do
  [ -f "$AEKO_KEYDIR/$key.json" ] || NEED_KEYS=1
done

TOOLS_IMAGE="${AEKO_IMAGE_REPOSITORY}/aeko-tools:${AEKO_IMAGE_TAG}"
if [ "$NEED_KEYS" -eq 1 ]; then
  log "generating missing keypairs in $AEKO_KEYDIR/"
  if [ "$FORCE_REBUILD" -eq 1 ] || ! docker image inspect "$TOOLS_IMAGE" >/dev/null 2>&1; then
    docker build --target tools -t "$TOOLS_IMAGE" . || { err "tools image build failed"; exit 2; }
  fi
  for key in "${KEYS[@]}"; do
    if [ ! -f "$AEKO_KEYDIR/$key.json" ]; then
      log "  $key.json"
      docker run --rm \
        -v "$REPO_ROOT/$AEKO_KEYDIR:/keys" \
        "$TOOLS_IMAGE" \
        aeko-keygen new --no-bip39-passphrase --silent --outfile "/keys/$key.json"
    fi
  done
fi

if [ -f "$AEKO_KEYDIR/.gitignore" ]; then
  grep -q '\*.json' "$AEKO_KEYDIR/.gitignore" || warn "$AEKO_KEYDIR/.gitignore does not ignore *.json"
else
  echo '*.json' > "$AEKO_KEYDIR/.gitignore"
fi

export AEKO_KEYS_DIR="$REPO_ROOT/$AEKO_KEYDIR"
export AEKO_IMAGE_REPOSITORY AEKO_IMAGE_TAG

if [ "$RESET_CHAIN" -eq 1 ]; then
  log "--reset-chain: stopping stack and deleting chain volumes"
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
fi

build_target() {
  local target=$1
  local image=$2
  if [ "$FORCE_REBUILD" -eq 1 ] || ! docker image inspect "$image" >/dev/null 2>&1; then
    log "building $image (target=$target)"
    docker build --target "$target" -t "$image" . || { err "$target image build failed"; exit 2; }
  else
    log "$image already present — skipping build"
  fi
}

build_target validator "${AEKO_IMAGE_REPOSITORY}/aeko-validator:${AEKO_IMAGE_TAG}"
build_target faucet "${AEKO_IMAGE_REPOSITORY}/aeko-faucet:${AEKO_IMAGE_TAG}"
build_target explorer-api "${AEKO_IMAGE_REPOSITORY}/aeko-explorer-api:${AEKO_IMAGE_TAG}"
build_target explorer-ui "${AEKO_IMAGE_REPOSITORY}/aeko-explorer-ui:${AEKO_IMAGE_TAG}"
build_target social-bootstrap "${AEKO_IMAGE_REPOSITORY}/aeko-social-bootstrap:${AEKO_IMAGE_TAG}"

if [ -z "${AEKO_EXPLORER_START_SLOT:-}" ]; then
  SLOT=$(curl -s --max-time 2 -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 2>/dev/null \
    | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || true)
  if [ -n "$SLOT" ] && [ "$SLOT" -gt 500 ]; then
    export AEKO_EXPLORER_START_SLOT=$((SLOT - 50))
    log "existing chain at slot $SLOT; explorer starts at $AEKO_EXPLORER_START_SLOT"
  fi
fi

log "starting faucet, validator, explorer-api and explorer-ui"
docker compose -f "$COMPOSE_FILE" up -d faucet validator explorer-api explorer-ui

log "waiting for validator RPC (max 90s)"
HEALTHY=0
HEALTH=""
for _ in $(seq 1 45); do
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
  err "logs: docker logs --tail 50 aeko-validator"
  exit 3
fi

log "waiting for chain to advance past slot 0 (max 30s)"
ADVANCED=0
SLOT_A=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 \
  | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || echo 0)
SLOT_B=$SLOT_A
for _ in $(seq 1 15); do
  sleep 2
  SLOT_B=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' http://127.0.0.1:8899 \
    | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || echo 0)
  if [ "${SLOT_B:-0}" -gt "${SLOT_A:-0}" ] && [ "${SLOT_B:-0}" -gt 0 ]; then
    ADVANCED=1
    break
  fi
done

if [ "$ADVANCED" -ne 1 ]; then
  err "chain not advancing — getSlot stuck at $SLOT_A"
  err "logs: docker logs --tail 50 aeko-validator"
  exit 3
fi

log "✓ testnet is live (slot $SLOT_B, advancing)"
cat <<EOF2

  Direct host endpoints:
    RPC          http://${AEKO_DOMAIN}:8899
    PubSub WS    ws://${AEKO_DOMAIN}:8900
    Explorer API http://${AEKO_DOMAIN}:8088
    Explorer UI  http://${AEKO_DOMAIN}:4000

  Canonical public endpoints behind your reverse proxy:
    RPC          https://rpc.aeko.online
    PubSub WS    wss://ws.aeko.online
    Explorer API https://api.aeko.online
    Explorer UI  https://scan.aeko.online
    Gossip       gossip.aeko.online:8001 (raw TCP/UDP, not HTTP)

  Quick checks:
    curl -s -X POST -H 'Content-Type: application/json' \\
      -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \\
      http://127.0.0.1:8899

    docker logs -f aeko-validator
    docker logs -f aeko-explorer-api
    docker logs -f aeko-explorer-ui

  See DEPLOYMENT.md for the deployment topology.

EOF2
