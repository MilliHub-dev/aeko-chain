#!/usr/bin/env bash
set -euo pipefail

ENTRYPOINT="${AEKO_GOSSIP_ENTRYPOINT:-gossip.aeko.online:8001}"
TIMEOUT_SECS="${AEKO_GOSSIP_TIMEOUT_SECS:-20}"
MIN_NODES="${AEKO_GOSSIP_MIN_NODES:-1}"
ALLOW_PRIVATE="${AEKO_GOSSIP_ALLOW_PRIVATE:-0}"

case "$TIMEOUT_SECS" in
  ''|*[!0-9]*) echo "AEKO_GOSSIP_TIMEOUT_SECS must be a positive integer" >&2; exit 64 ;;
  0) echo "AEKO_GOSSIP_TIMEOUT_SECS must be greater than zero" >&2; exit 64 ;;
esac
case "$MIN_NODES" in
  ''|*[!0-9]*) echo "AEKO_GOSSIP_MIN_NODES must be a positive integer" >&2; exit 64 ;;
  0) echo "AEKO_GOSSIP_MIN_NODES must be greater than zero" >&2; exit 64 ;;
esac
case "$ALLOW_PRIVATE" in
  0|1) ;;
  *) echo "AEKO_GOSSIP_ALLOW_PRIVATE must be 0 or 1" >&2; exit 64 ;;
esac

command -v aeko-gossip >/dev/null 2>&1 || {
  echo "aeko-gossip is required; use the AEKO tools image or install the release CLI tools" >&2
  exit 69
}

args=()
if [ "$ALLOW_PRIVATE" = "1" ]; then
  args+=(--allow-private-addr)
fi

echo "==> Probing AEKO gossip entrypoint $ENTRYPOINT (min_nodes=$MIN_NODES timeout=${TIMEOUT_SECS}s)"
aeko-gossip "${args[@]}" spy \
  --entrypoint "$ENTRYPOINT" \
  --num-nodes "$MIN_NODES" \
  --timeout "$TIMEOUT_SECS"

echo "[PASS] gossip entrypoint is discoverable through the AEKO gossip protocol"
