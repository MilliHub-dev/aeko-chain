#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
LEDGER_DIR="$WORK_DIR/ledger"
STATE_DIR="$WORK_DIR/protocol-state"
CONTINUITY_DIR="$WORK_DIR/protocol-continuity"
AUTHORITY_KEYPAIR="$WORK_DIR/protocol-authority.json"
RECIPIENT_KEYPAIR="$WORK_DIR/recipient.json"
HISTORY_FILE="$WORK_DIR/historical-state.json"
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

start_validator() {
  local reset="$1"
  local args=(
    target/debug/aeko-test-validator
    --ledger "$LEDGER_DIR"
    --rpc-port 18899
    --faucet-aeko 1000000
    --quiet
  )
  if [ "$reset" = "1" ]; then
    args+=(--reset)
  fi
  : >"$VALIDATOR_LOG"
  "${args[@]}" >"$VALIDATOR_LOG" 2>&1 &
  VALIDATOR_PID=$!
}

stop_validator() {
  if [ -n "$VALIDATOR_PID" ]; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
    VALIDATOR_PID=""
  fi
}

wait_for_rpc() {
  local ready=0
  for _ in $(seq 1 90); do
    if curl -fsS -X POST -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
      "$RPC_URL" | grep -q '"result":"ok"'; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "test validator RPC did not become healthy" >&2
    return 1
  fi
}

# TestValidator genesis activates the repository feature set at slot 0. The
# persisted historical pre-activation upgrade path is covered separately by
# the runtime snapshot/archive regression; this live stack test owns ledger
# restart/history continuity, bootstrap, recovery, Explorer and smoke acceptance
# without placing production feature-authority private keys in CI.
start_validator 1
wait_for_rpc

target/debug/aeko-keygen new \
  --no-bip39-passphrase \
  --silent \
  --outfile "$AUTHORITY_KEYPAIR"
target/debug/aeko-keygen new \
  --no-bip39-passphrase \
  --silent \
  --outfile "$RECIPIENT_KEYPAIR"
RECIPIENT_PUBKEY="$(target/debug/aeko-keygen pubkey "$RECIPIENT_KEYPAIR")"

# Create and record real transaction history before restarting from the same
# ledger. The restart must preserve genesis identity, account state and the
# historical transaction query surface.
RPC_URL="$RPC_URL" RECIPIENT_PUBKEY="$RECIPIENT_PUBKEY" HISTORY_FILE="$HISTORY_FILE" python3 - <<'PY'
import json
import os
import time
import urllib.request

rpc_url = os.environ["RPC_URL"]
recipient = os.environ["RECIPIENT_PUBKEY"]
history_file = os.environ["HISTORY_FILE"]


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    request = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload.get("result")


genesis = rpc("getGenesisHash")
slot = int(rpc("getSlot"))
signature = rpc("requestAirdrop", [recipient, 1_000_000_000])
for _ in range(60):
    status = rpc("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])
    value = status["value"][0]
    if value is not None and value.get("err") is None:
        break
    time.sleep(0.5)
else:
    raise RuntimeError(f"airdrop transaction was not confirmed: {signature}")

balance = int(rpc("getBalance", [recipient, {"commitment": "confirmed"}])["value"])
transaction = rpc(
    "getTransaction",
    [signature, {"encoding": "json", "commitment": "confirmed", "maxSupportedTransactionVersion": 0}],
)
if transaction is None:
    raise RuntimeError("pre-restart historical transaction is not queryable")

with open(history_file, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "genesis": genesis,
            "slot": slot,
            "recipient": recipient,
            "balance": balance,
            "signature": signature,
        },
        handle,
    )
print(f"[ok] created historical transaction {signature} at slot >= {slot}")
PY

stop_validator
start_validator 0
wait_for_rpc

RPC_URL="$RPC_URL" HISTORY_FILE="$HISTORY_FILE" python3 - <<'PY'
import json
import os
import urllib.request

rpc_url = os.environ["RPC_URL"]
history_file = os.environ["HISTORY_FILE"]


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    request = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload.get("result")


with open(history_file, encoding="utf-8") as handle:
    expected = json.load(handle)

actual_genesis = rpc("getGenesisHash")
if actual_genesis != expected["genesis"]:
    raise RuntimeError(f"genesis changed across restart: {expected['genesis']} -> {actual_genesis}")
actual_balance = int(rpc("getBalance", [expected["recipient"], {"commitment": "confirmed"}])["value"])
if actual_balance != expected["balance"]:
    raise RuntimeError(f"historical account balance changed: {expected['balance']} -> {actual_balance}")
transaction = rpc(
    "getTransaction",
    [expected["signature"], {"encoding": "json", "commitment": "confirmed", "maxSupportedTransactionVersion": 0}],
)
if transaction is None:
    raise RuntimeError("historical transaction disappeared after validator restart")
if int(rpc("getSlot")) < int(expected["slot"]):
    raise RuntimeError("validator slot regressed after ledger restart")
print(f"[ok] ledger restart preserved genesis, account state and transaction {expected['signature']}")
PY

run_bootstrap() {
  AEKO_PROTOCOL_BOOTSTRAP_ENABLED=1 \
  AEKO_RPC_URL="$RPC_URL" \
  AEKO_PAYER_KEYPAIR="$LEDGER_DIR/faucet-keypair.json" \
  AEKO_PROTOCOL_AUTHORITY_KEYPAIR="$AUTHORITY_KEYPAIR" \
  AEKO_PROTOCOL_OUT_DIR="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_DIR="$CONTINUITY_DIR" \
  AEKO_REQUIRE_EXISTING_PROTOCOL_STATE=1 \
  AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION="$1" \
  AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY=0 \
  AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE="$2" \
  target/debug/aeko-protocol-bootstrap
}

# First bootstrap is explicit. A second normal run must be idempotent.
run_bootstrap 1 0
cp "$STATE_DIR/protocol-registry.env" "$REGISTRY_BASELINE"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
run_bootstrap 0 0
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"

# Simulate replacement of protocol-state while continuity survives. Normal
# bootstrap must fail before writing replacement state; deliberate recovery then
# reuses the preserved canonical keypairs and republishes the identical registry.
rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"
if run_bootstrap 0 0; then
  echo "protocol bootstrap unexpectedly accepted a missing established state volume" >&2
  exit 1
fi
if [ -n "$(find "$STATE_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "fail-closed protocol-state check wrote files before rejecting recovery" >&2
  exit 1
fi
run_bootstrap 0 1
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"

docker rm -f "$POSTGRES_NAME" >/dev/null 2>&1 || true
docker run -d --name "$POSTGRES_NAME" \
  -e POSTGRES_USER=aeko \
  -e POSTGRES_PASSWORD=aeko \
  -e POSTGRES_DB=aeko_protocol_integration \
  -p 55432:5432 \
  postgres:16-alpine >/dev/null

postgres_ready=0
for _ in $(seq 1 30); do
  if docker exec "$POSTGRES_NAME" pg_isready -U aeko -d aeko_protocol_integration >/dev/null 2>&1; then
    postgres_ready=1
    break
  fi
  sleep 1
done
if [ "$postgres_ready" -ne 1 ]; then
  echo "integration PostgreSQL did not become ready" >&2
  false
fi

AEKO_EXPLORER_RPC="$RPC_URL" \
AEKO_EXPLORER_NETWORK=protocol-ci \
AEKO_EXPLORER_START_SLOT=0 \
AEKO_EXPLORER_MAX_BATCH_SIZE=64 \
AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS=false \
AEKO_EXPLORER_DATABASE_URL=postgres://aeko:aeko@127.0.0.1:55432/aeko_protocol_integration \
AEKO_EXPLORER_DB_MAX_CONNECTIONS=4 \
AEKO_EXPLORER_DB_MIN_CONNECTIONS=1 \
AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS=10 \
AEKO_EXPLORER_RPC_TIMEOUT_SECS=15 \
AEKO_EXPLORER_ASSET_REFRESH_SLOTS=64 \
AEKO_EXPLORER_SOCIAL_REFRESH_SLOTS=64 \
AEKO_EXPLORER_MAX_READY_LAG_SLOTS=1000000 \
AEKO_EXPLORER_BIND=127.0.0.1:18088 \
AEKO_EXPLORER_REQUEST_TIMEOUT_SECS=30 \
AEKO_EXPLORER_MAX_BODY_BYTES=1048576 \
AEKO_EXPLORER_SYNC_INTERVAL_SECS=1 \
AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=protocol-ci-settings-admin-token-123456789 \
AEKO_PROTOCOL_REGISTRY_FILE="$STATE_DIR/protocol-registry.env" \
AEKO_SOCIAL_REGISTRY_FILE="$WORK_DIR/social-registry.env" \
target/debug/aeko-explorer-backend >"$EXPLORER_LOG" 2>&1 &
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

echo "[PASS] protocol ledger continuity, bootstrap idempotency/recovery, Explorer and smoke integration"
