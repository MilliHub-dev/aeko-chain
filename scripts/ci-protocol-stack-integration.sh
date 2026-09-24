#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
LEDGER_DIR="$WORK_DIR/ledger"
STATE_DIR="$WORK_DIR/protocol-state"
CONTINUITY_DIR="$WORK_DIR/protocol-continuity"
SOCIAL_STATE_DIR="$WORK_DIR/social-state"
AUTHORITY_KEYPAIR="$WORK_DIR/protocol-authority.json"
RECIPIENT_KEYPAIR="$WORK_DIR/recipient.json"
HISTORY_FILE="$WORK_DIR/historical-state.json"
REGISTRY_BASELINE="$WORK_DIR/protocol-registry.baseline"
SOCIAL_REGISTRY_BASELINE="$WORK_DIR/social-registry.baseline"
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

mkdir -p "$LEDGER_DIR" "$STATE_DIR" "$CONTINUITY_DIR" "$SOCIAL_STATE_DIR"

# Build only the binaries exercised by this integration path. Previous source
# validation on the shared runner makes these incremental in normal CI.
cargo build --locked -p aeko-validator --bin aeko-test-validator --bin aeko-validator
cargo build --locked -p aeko-keygen --bin aeko-keygen
cargo build --locked -p aeko-social-bootstrap --bin aeko-social-bootstrap
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
    # Do not SIGTERM the validator during the continuity assertion. The admin
    # RPC exit path is the repository's supported shutdown contract and gives
    # Blockstore/RPC transaction-status services time to flush before restart.
    target/debug/aeko-validator --ledger "$LEDGER_DIR" exit --force

    local stopped=0
    for _ in $(seq 1 60); do
      if ! kill -0 "$VALIDATOR_PID" >/dev/null 2>&1; then
        stopped=1
        break
      fi
      sleep 0.5
    done
    if [ "$stopped" -ne 1 ]; then
      echo "test validator did not stop after admin RPC exit request" >&2
      return 1
    fi

    local status=0
    set +e
    wait "$VALIDATOR_PID"
    status=$?
    set -e
    VALIDATOR_PID=""

    if [ "$status" -ne 0 ]; then
      echo "test validator exited unsuccessfully after admin RPC shutdown: $status" >&2
      return "$status"
    fi
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
signature = rpc("requestAirdrop", [recipient, 1_000_000_000])

# A confirmed transaction is not sufficient for a restart-continuity assertion:
# TestValidator replays rooted ledger state on restart. Wait until the airdrop is
# finalized/rooted before stopping the validator so the test does not mistake an
# intentionally discarded unrooted fork for ledger corruption.
for _ in range(180):
    status = rpc("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])
    value = status["value"][0]
    if value is not None and value.get("err") is not None:
        raise RuntimeError(f"airdrop transaction failed: {signature}: {value['err']}")
    if value is not None:
        confirmation_status = value.get("confirmationStatus")
        confirmations = value.get("confirmations")
        if confirmation_status == "finalized" or (
            confirmation_status is None and confirmations is None
        ):
            break
    time.sleep(0.5)
else:
    raise RuntimeError(f"airdrop transaction was not finalized: {signature}")

transaction = None
for _ in range(60):
    transaction = rpc(
        "getTransaction",
        [signature, {"encoding": "json", "commitment": "finalized", "maxSupportedTransactionVersion": 0}],
    )
    if transaction is not None:
        break
    time.sleep(0.5)
if transaction is None:
    raise RuntimeError("finalized pre-restart historical transaction is not queryable")

slot = int(transaction["slot"])
for _ in range(60):
    finalized_slot = int(rpc("getSlot", [{"commitment": "finalized"}]))
    if finalized_slot >= slot:
        break
    time.sleep(0.5)
else:
    raise RuntimeError(
        f"validator finalized slot did not reach historical transaction slot: {finalized_slot} < {slot}"
    )

balance = int(rpc("getBalance", [recipient, {"commitment": "finalized"}])["value"])

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
print(f"[ok] created finalized historical transaction {signature} at slot {slot}")
PY

stop_validator
start_validator 0
wait_for_rpc

RPC_URL="$RPC_URL" HISTORY_FILE="$HISTORY_FILE" python3 - <<'PY'
import json
import os
import time
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

# RPC health can turn green while ledger replay is still advancing from genesis.
# Poll the finalized view until the persisted transaction, account balance and
# finalized slot all converge on the pre-restart state. A genuine continuity
# failure still times out with the last observed replay state.
last_balance = None
last_transaction = None
last_finalized_slot = None
for _ in range(180):
    last_balance = int(
        rpc("getBalance", [expected["recipient"], {"commitment": "finalized"}])["value"]
    )
    last_transaction = rpc(
        "getTransaction",
        [
            expected["signature"],
            {
                "encoding": "json",
                "commitment": "finalized",
                "maxSupportedTransactionVersion": 0,
            },
        ],
    )
    last_finalized_slot = int(rpc("getSlot", [{"commitment": "finalized"}]))

    transaction_slot_matches = (
        last_transaction is not None
        and int(last_transaction["slot"]) == int(expected["slot"])
    )
    if (
        last_balance == int(expected["balance"])
        and transaction_slot_matches
        and last_finalized_slot >= int(expected["slot"])
    ):
        break
    time.sleep(0.5)
else:
    observed_transaction_slot = (
        None if last_transaction is None else int(last_transaction["slot"])
    )
    raise RuntimeError(
        "historical state did not recover after validator restart: "
        f"balance {expected['balance']} -> {last_balance}, "
        f"transaction slot {expected['slot']} -> {observed_transaction_slot}, "
        f"finalized slot -> {last_finalized_slot}"
    )

print(f"[ok] ledger restart preserved finalized genesis, account state and transaction {expected['signature']}")
PY

run_social_bootstrap() {
  local allow_missing_state="${1:-0}"
  local reset_ledger="${2:-0}"
  AEKO_RPC_URL="$RPC_URL" \
  AEKO_PAYER_KEYPAIR="$LEDGER_DIR/faucet-keypair.json" \
  AEKO_BOOTSTRAP_OUT_DIR="$SOCIAL_STATE_DIR" \
  AEKO_BOOTSTRAP_ALLOW_MISSING_STATE="$allow_missing_state" \
  AEKO_RESET_LEDGER="$reset_ledger" \
  target/debug/aeko-social-bootstrap
}

run_protocol_bootstrap() {
  local allow_missing_state="${1:-0}"
  local reset_ledger="${2:-0}"
  AEKO_RPC_URL="$RPC_URL" \
  AEKO_PAYER_KEYPAIR="$LEDGER_DIR/faucet-keypair.json" \
  AEKO_PROTOCOL_AUTHORITY_KEYPAIR="$AUTHORITY_KEYPAIR" \
  AEKO_PROTOCOL_OUT_DIR="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_DIR="$CONTINUITY_DIR" \
  AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE="$allow_missing_state" \
  AEKO_RESET_LEDGER="$reset_ledger" \
  target/debug/aeko-protocol-bootstrap
}

rpc_value() {
  local method="$1"
  python3 - "$RPC_URL" "$method" <<'PY'
import json
import sys
import urllib.request

rpc_url, method = sys.argv[1:3]
body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": []}).encode()
request = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=15) as response:
    payload = json.load(response)
if payload.get("error"):
    raise SystemExit(f"{method}: {payload['error']}")
print(payload["result"])
PY
}

assert_registry_bound() {
  local registry="$1"
  local genesis="$2"
  grep -qx 'AEKO_REGISTRY_SCHEMA_VERSION=2' "$registry"
  grep -qx "AEKO_CHAIN_GENESIS_HASH=$genesis" "$registry"
}

# First canonical establishment on the preserved genesis: both control planes
# initialize automatically, then a normal redeploy must verify without changing
# canonical registry identity.
GENESIS_ONE="$(rpc_value getGenesisHash)"
run_social_bootstrap 0 0
run_protocol_bootstrap 0 0
assert_registry_bound "$SOCIAL_STATE_DIR/social-registry.env" "$GENESIS_ONE"
assert_registry_bound "$STATE_DIR/protocol-registry.env" "$GENESIS_ONE"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
test ! -e "$SOCIAL_STATE_DIR/.aeko-bootstrap-in-progress"
test ! -e "$STATE_DIR/.aeko-bootstrap-in-progress"
test ! -e "$CONTINUITY_DIR/.aeko-bootstrap-in-progress"

cp "$SOCIAL_STATE_DIR/social-registry.env" "$SOCIAL_REGISTRY_BASELINE"
cp "$STATE_DIR/protocol-registry.env" "$REGISTRY_BASELINE"
run_social_bootstrap 0 0
run_protocol_bootstrap 0 0
cmp "$SOCIAL_REGISTRY_BASELINE" "$SOCIAL_STATE_DIR/social-registry.env"
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
echo "[ok] normal redeploy preserved Social and Protocol canonical identity"

# Same-genesis established-state loss must fail closed. A missing keypair makes
# the bootstrap derive a replacement address that is absent on chain; neither
# control plane may silently bless that replacement during a normal redeploy.
cp -a "$SOCIAL_STATE_DIR" "$WORK_DIR/social-state.before-corruption"
rm "$SOCIAL_STATE_DIR/social-posts-state.json"
if run_social_bootstrap 0 0; then
  echo "Social bootstrap unexpectedly accepted missing established same-genesis state" >&2
  exit 1
fi
rm -rf "$SOCIAL_STATE_DIR"
cp -a "$WORK_DIR/social-state.before-corruption" "$SOCIAL_STATE_DIR"

cp -a "$STATE_DIR" "$WORK_DIR/protocol-state.before-corruption"
cp -a "$CONTINUITY_DIR" "$WORK_DIR/protocol-continuity.before-corruption"
rm "$CONTINUITY_DIR/tokenomics-state.json"
if run_protocol_bootstrap 0 0; then
  echo "Protocol bootstrap unexpectedly accepted missing established same-genesis state" >&2
  exit 1
fi
rm -rf "$STATE_DIR" "$CONTINUITY_DIR"
cp -a "$WORK_DIR/protocol-state.before-corruption" "$STATE_DIR"
cp -a "$WORK_DIR/protocol-continuity.before-corruption" "$CONTINUITY_DIR"
echo "[ok] established same-genesis state loss fails closed"

# Real new-genesis replacement. The reset flag is allowed to purge canonical
# bootstrap artifacts exactly once for the replacement chain. Repeating the flag
# against the already-completed replacement genesis must be idempotent.
stop_validator
start_validator 1
wait_for_rpc
GENESIS_TWO="$(rpc_value getGenesisHash)"
if [ "$GENESIS_TWO" = "$GENESIS_ONE" ]; then
  echo "intentional validator reset did not produce a replacement genesis" >&2
  exit 1
fi

printf '%s\n' "stale-state" >"$SOCIAL_STATE_DIR/stale-before-reset"
printf '%s\n' "stale-state" >"$STATE_DIR/stale-before-reset"
printf '%s\n' "stale-continuity" >"$CONTINUITY_DIR/stale-before-reset"
run_social_bootstrap 0 1
run_protocol_bootstrap 0 1
test ! -e "$SOCIAL_STATE_DIR/stale-before-reset"
test ! -e "$STATE_DIR/stale-before-reset"
test ! -e "$CONTINUITY_DIR/stale-before-reset"
assert_registry_bound "$SOCIAL_STATE_DIR/social-registry.env" "$GENESIS_TWO"
assert_registry_bound "$STATE_DIR/protocol-registry.env" "$GENESIS_TWO"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"

cp "$SOCIAL_STATE_DIR/social-registry.env" "$SOCIAL_REGISTRY_BASELINE"
cp "$STATE_DIR/protocol-registry.env" "$REGISTRY_BASELINE"
run_social_bootstrap 0 1
run_protocol_bootstrap 0 1
cmp "$SOCIAL_REGISTRY_BASELINE" "$SOCIAL_STATE_DIR/social-registry.env"
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"
echo "[ok] explicit reset replaced foreign-chain state once and is same-genesis idempotent"

# The operator must be able to return AEKO_RESET_LEDGER to zero immediately
# after accepting the replacement chain. Routine redeploy keeps the replacement
# genesis and all canonical identities.
run_social_bootstrap 0 0
run_protocol_bootstrap 0 0
cmp "$SOCIAL_REGISTRY_BASELINE" "$SOCIAL_STATE_DIR/social-registry.env"
cmp "$REGISTRY_BASELINE" "$STATE_DIR/protocol-registry.env"
echo "[ok] replacement chain remains stable after reset flag returns to zero"

# Simulate a crash after a third intentional reset has purged bootstrap roots
# and durably written RESET_IN_PROGRESS, but before any canonical account was
# recreated. The next deployment deliberately has AEKO_RESET_LEDGER=0 and must
# resume from the durable marker rather than failing on stale operator state.
stop_validator
start_validator 1
wait_for_rpc
GENESIS_THREE="$(rpc_value getGenesisHash)"
if [ "$GENESIS_THREE" = "$GENESIS_TWO" ]; then
  echo "interrupted-reset scenario did not produce a third genesis" >&2
  exit 1
fi

rm -rf "$SOCIAL_STATE_DIR" "$STATE_DIR" "$CONTINUITY_DIR"
mkdir -p "$SOCIAL_STATE_DIR" "$STATE_DIR" "$CONTINUITY_DIR"
for root in "$SOCIAL_STATE_DIR" "$STATE_DIR" "$CONTINUITY_DIR"; do
  cat >"$root/.aeko-bootstrap-in-progress" <<EOF
AEKO_BOOTSTRAP_MODE=reset
AEKO_CHAIN_GENESIS_HASH=$GENESIS_THREE
EOF
done

run_social_bootstrap 0 0
run_protocol_bootstrap 0 0
assert_registry_bound "$SOCIAL_STATE_DIR/social-registry.env" "$GENESIS_THREE"
assert_registry_bound "$STATE_DIR/protocol-registry.env" "$GENESIS_THREE"
cmp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
for root in "$SOCIAL_STATE_DIR" "$STATE_DIR" "$CONTINUITY_DIR"; do
  test ! -e "$root/.aeko-bootstrap-in-progress"
  grep -qx "AEKO_CHAIN_GENESIS_HASH=$GENESIS_THREE" "$root/.aeko-chain-binding"
done
echo "[ok] interrupted reset resumed safely after AEKO_RESET_LEDGER returned to zero"

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
AEKO_EXPLORER_PERSIST_SOCIALFI_VIEWS=true \
AEKO_EXPLORER_DATABASE_URL=postgres://aeko:aeko@127.0.0.1:55432/aeko_protocol_integration \
AEKO_EXPLORER_DB_MAX_CONNECTIONS=4 \
AEKO_EXPLORER_DB_MIN_CONNECTIONS=1 \
AEKO_EXPLORER_DB_ACQUIRE_TIMEOUT_SECS=10 \
AEKO_EXPLORER_RPC_TIMEOUT_SECS=15 \
AEKO_EXPLORER_ASSET_REFRESH_SLOTS=64 \
AEKO_EXPLORER_SOCIAL_REFRESH_SLOTS=16 \
AEKO_EXPLORER_MAX_READY_LAG_SLOTS=1000000 \
AEKO_EXPLORER_BIND=127.0.0.1:18088 \
AEKO_EXPLORER_REQUEST_TIMEOUT_SECS=30 \
AEKO_EXPLORER_MAX_BODY_BYTES=1048576 \
AEKO_EXPLORER_SYNC_INTERVAL_SECS=1 \
AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=protocol-ci-settings-admin-token-123456789 \
AEKO_RESET_LEDGER=0 \
AEKO_PROTOCOL_REGISTRY_FILE="$STATE_DIR/protocol-registry.env" \
AEKO_SOCIAL_REGISTRY_FILE="$SOCIAL_STATE_DIR/social-registry.env" \
target/debug/aeko-explorer-backend >"$EXPLORER_LOG" 2>&1 &
EXPLORER_PID=$!

explorer_ready=0
for _ in $(seq 1 90); do
  if curl -fsS "$EXPLORER_URL/health" >/dev/null 2>&1; then
    explorer_ready=1
    break
  fi
  sleep 1
done
if [ "$explorer_ready" -ne 1 ]; then
  echo "Explorer strict readiness did not become healthy" >&2
  false
fi

network_ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$EXPLORER_URL/network/readiness" >/dev/null 2>&1; then
    network_ready=1
    break
  fi
  sleep 1
done
if [ "$network_ready" -ne 1 ]; then
  echo "Explorer network readiness did not certify Social + Protocol" >&2
  false
fi

AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_URL" python3 scripts/smoke-aeko-social.py
AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_URL" python3 scripts/smoke-aeko-protocol.py

python3 - "$EXPLORER_URL" "$GENESIS_THREE" <<'PY'
import json
import sys
import urllib.request

base, genesis = sys.argv[1:3]
with urllib.request.urlopen(base + "/network/readiness", timeout=15) as response:
    envelope = json.load(response)
data = envelope["data"]
if data["ok"] is not True:
    raise RuntimeError(f"network readiness not healthy: {data}")
if data["genesisHash"] != genesis:
    raise RuntimeError(f"network readiness genesis mismatch: {data['genesisHash']} != {genesis}")
if data["social"]["healthy"] != 5 or data["social"]["total"] != 5:
    raise RuntimeError(f"Social readiness is not 5/5: {data['social']}")
if data["social"]["healthyCustody"] != 5 or data["social"]["custodyTotal"] != 5:
    raise RuntimeError(f"Social custody readiness is not 5/5: {data['social']}")
if data["protocol"]["executablePrograms"] != 11 or data["protocol"]["programTotal"] != 11:
    raise RuntimeError(f"Protocol executable programs are not 11/11: {data['protocol']}")
if data["protocol"]["healthy"] != 8 or data["protocol"]["total"] != 8:
    raise RuntimeError(f"Protocol canonical state is not 8/8: {data['protocol']}")
if data["protocol"]["healthyCustody"] != 3 or data["protocol"]["custodyTotal"] != 3:
    raise RuntimeError(f"Protocol custody readiness is not 3/3: {data['protocol']}")
print("[ok] strict network readiness reports Social 5/5 state + 5/5 custody, Protocol 11/11 programs + 8/8 state + 3/3 custody")
PY

echo "[PASS] ledger continuity, genesis-bound Social/Protocol lifecycle, interrupted-reset recovery, Explorer readiness and smoke integration"

