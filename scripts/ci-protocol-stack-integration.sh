#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
LEDGER_DIR="$WORK_DIR/ledger"
STATE_DIR="$WORK_DIR/protocol-state"
CONTINUITY_DIR="$WORK_DIR/protocol-continuity"
AUTHORITY_KEYPAIR="$WORK_DIR/protocol-authority.json"
REGISTRY_BASELINE="$WORK_DIR/protocol-registry.baseline"
VALIDATOR_LOG="$WORK_DIR/test-validator.log"
EXPLORER_LOG="$WORK_DIR/explorer.log"
POSTGRES_NAME="aeko-protocol-integration-postgres"
RPC_URL="http://127.0.0.1:18899"
EXPLORER_URL="http://127.0.0.1:18088"
VALIDATOR_PID=""
EXPLORER_PID=""

cleanup() {
  set +e
  if [ -n "$EXPLORER_PID" ]; then
    kill "$EXPLORER_PID" >/dev/null 2>&1 || true
    wait "$EXPLORER_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$VALIDATOR_PID" ]; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
  fi
  docker rm -f "$POSTGRES_NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail_with_logs() {
  echo "protocol stack integration failed" >&2
  if [ -s "$VALIDATOR_LOG" ]; then
    echo "--- test validator log ---" >&2
    tail -n 120 "$VALIDATOR_LOG" >&2 || true
  fi
  if [ -s "$EXPLORER_LOG" ]; then
    echo "--- explorer log ---" >&2
    tail -n 120 "$EXPLORER_LOG" >&2 || true
  fi
  exit 1
}
trap fail_with_logs ERR

mkdir -p "$LEDGER_DIR" "$STATE_DIR" "$CONTINUITY_DIR"

# Build only the binaries exercised by this integration path. Previous source
# validation on the shared runner makes these incremental in normal CI.
cargo build --locked -p aeko-validator --bin aeko-test-validator
cargo build --locked -p aeko-keygen --bin aeko-keygen
cargo build --locked -p aeko-protocol-bootstrap --bin aeko-protocol-bootstrap
cargo build --locked -p aeko-explorer-backend --bin aeko-explorer-backend

# TestValidator genesis activates the repository feature set at slot 0. The
# persisted historical pre-activation upgrade path is covered separately by
# the runtime snapshot/archive regression; this live stack test owns bootstrap,
# recovery, Explorer and smoke integration without requiring production feature
# authority private keys in CI.
target/debug/aeko-test-validator   --ledger "$LEDGER_DIR"   --reset   --rpc-port 18899   --faucet-aeko 1000000   --quiet   >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

rpc_ready=0
for _ in $(seq 1 90); do
  if curl -fsS -X POST -H 'Content-Type: application/json'     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'     "$RPC_URL" | grep -q '"result":"ok"'; then
    rpc_ready=1
    break
  fi
  sleep 1
done
if [ "$rpc_ready" -ne 1 ]; then
  echo "test validator RPC did not become healthy" >&2
  false
fi

target/debug/aeko-keygen new   --no-bip39-passphrase   --silent   --outfile "$AUTHORITY_KEYPAIR"

run_bootstrap() {
  AEKO_PROTOCOL_BOOTSTRAP_ENABLED=1   AEKO_RPC_URL="$RPC_URL"   AEKO_PAYER_KEYPAIR="$LEDGER_DIR/faucet-keypair.json"   AEKO_PROTOCOL_AUTHORITY_KEYPAIR="$AUTHORITY_KEYPAIR"   AEKO_PROTOCOL_OUT_DIR="$STATE_DIR"   AEKO_PROTOCOL_CONTINUITY_DIR="$CONTINUITY_DIR"   AEKO_REQUIRE_EXISTING_PROTOCOL_STATE=1   AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION="$1"   AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY=0   AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE="$2"   target/debug/aeko-protocol-bootstrap
}

# First bootstrap is explicit. A second normal run must be idempotent.
run_bootstrap 1 0
cp "$STATE_DIR/protocol-registry.env" "$REGISTRY_BASELINE"
run_bootstrap 0 0
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"

# Simulate replacement of the protocol-state volume while preserving the
# independently persisted continuity volume. Explicit recovery must reuse the
# same canonical keypairs and republish exactly the same registry addresses.
rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"
run_bootstrap 0 1
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"

docker rm -f "$POSTGRES_NAME" >/dev/null 2>&1 || true
docker run -d --name "$POSTGRES_NAME"   -e POSTGRES_USER=aeko   -e POSTGRES_PASSWORD=aeko   -e POSTGRES_DB=aeko_protocol_integration   -p 55432:5432   postgres:16-alpine >/dev/null

postgres_ready=0
for _ in $(seq 1 30); do
  if docker exec "$POSTGRES_NAME"     pg_isready -U aeko -d aeko_protocol_integration >/dev/null 2>&1; then
    postgres_ready=1
    break
  fi
  sleep 1
done
if [ "$postgres_ready" -ne 1 ]; then
  echo "integration PostgreSQL did not become ready" >&2
  false
fi

AEKO_EXPLORER_RPC="$RPC_URL" AEKO_EXPLORER_NETWORK=protocol-ci AEKO_EXPLORER_START_SLOT=0 AEKO_EXPLORER_MAX_BATCH_SIZE=64 AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS=false AEKO_EXPLORER_DATABASE_URL=postgres://aeko:aeko@127.0.0.1:55432/aeko_protocol_integration AEKO_EXPLORER_DB_MAX_CONNECTIONS=4 AEKO_EXPLORER_DB_MIN_CONNECTIONS=1 AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS=10 AEKO_EXPLORER_RPC_TIMEOUT_SECS=15 AEKO_EXPLORER_ASSET_REFRESH_SLOTS=64 AEKO_EXPLORER_SOCIAL_REFRESH_SLOTS=64 AEKO_EXPLORER_MAX_READY_LAG_SLOTS=1000000 AEKO_EXPLORER_BIND=127.0.0.1:18088 AEKO_EXPLORER_REQUEST_TIMEOUT_SECS=30 AEKO_EXPLORER_MAX_BODY_BYTES=1048576 AEKO_EXPLORER_SYNC_INTERVAL_SECS=1 AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=protocol-ci-settings-admin-token-123456789 AEKO_PROTOCOL_REGISTRY_FILE="$STATE_DIR/protocol-registry.env" AEKO_SOCIAL_REGISTRY_FILE="$WORK_DIR/social-registry.env" target/debug/aeko-explorer-backend >"$EXPLORER_LOG" 2>&1 &
EXPLORER_PID=$!

explorer_ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$EXPLORER_URL/registry/protocol" >/dev/null 2>&1; then
    explorer_ready=1
    break
  fi
  sleep 1
done
if [ "$explorer_ready" -ne 1 ]; then
  echo "Explorer protocol endpoint did not become ready" >&2
  false
fi

AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_URL" python3 scripts/smoke-aeko-protocol.py

echo "[PASS] protocol bootstrap, recovery, Explorer and smoke integration"
