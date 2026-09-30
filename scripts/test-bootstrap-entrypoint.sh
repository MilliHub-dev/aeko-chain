#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRYPOINT="$ROOT/docker/bootstrap-entrypoint.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STATE="$TMP/state"
mkdir -p "$STATE"
printf 'stale\n' >"$STATE/.aeko-bootstrap-runtime-ready"

cat >"$TMP/fail.sh" <<'EOF'
#!/bin/sh
exit 23
EOF
chmod +x "$TMP/fail.sh"

set +e
AEKO_BOOTSTRAP_STATE_DIR="$STATE" "$ENTRYPOINT" "$TMP/fail.sh"
status=$?
set -e
if [ "$status" -ne 23 ]; then
  echo "expected wrapped bootstrap failure status 23, got $status" >&2
  exit 1
fi
if [ -e "$STATE/.aeko-bootstrap-runtime-ready" ]; then
  echo "stale readiness marker survived a failed bootstrap" >&2
  exit 1
fi

cat >"$TMP/succeed.sh" <<'EOF'
#!/bin/sh
printf 'AEKO_REGISTRY_SCHEMA_VERSION=2\nAEKO_CHAIN_GENESIS_HASH=test-genesis\n' >"$AEKO_BOOTSTRAP_STATE_DIR/.aeko-chain-binding"
EOF
chmod +x "$TMP/succeed.sh"

AEKO_BOOTSTRAP_STATE_DIR="$STATE" "$ENTRYPOINT" "$TMP/succeed.sh"
cmp "$STATE/.aeko-chain-binding" "$STATE/.aeko-bootstrap-runtime-ready"

rm -f "$STATE/.aeko-chain-binding" "$STATE/.aeko-bootstrap-runtime-ready"
cat >"$TMP/no-binding.sh" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$TMP/no-binding.sh"

set +e
AEKO_BOOTSTRAP_STATE_DIR="$STATE" "$ENTRYPOINT" "$TMP/no-binding.sh"
status=$?
set -e
if [ "$status" -ne 70 ]; then
  echo "expected missing-binding status 70, got $status" >&2
  exit 1
fi
if [ -e "$STATE/.aeko-bootstrap-runtime-ready" ]; then
  echo "readiness marker was published without a chain binding" >&2
  exit 1
fi

echo "bootstrap entrypoint lifecycle: ok"
