#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
LEDGER_DIR="$WORK_DIR/ledger"
PROGRAM_DIR="$WORK_DIR/hello-program"
PROGRAM_SO="$PROGRAM_DIR/hello_aeko_program.so"
PROGRAM_KEYPAIR="$PROGRAM_DIR/hello_aeko_program-keypair.json"
VALIDATOR_LOG="$WORK_DIR/test-validator.log"
RPC_URL="http://127.0.0.1:18999"
VALIDATOR_PID=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e

  if [ "$status" -ne 0 ] && [ -s "$VALIDATOR_LOG" ]; then
    echo "--- smart-contract AEKO TestValidator log ---" >&2
    tail -n 160 "$VALIDATOR_LOG" >&2 || true
  fi

  if [ -n "$VALIDATOR_PID" ] && kill -0 "$VALIDATOR_PID" >/dev/null 2>&1; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
  fi

  rm -rf "$WORK_DIR"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$LEDGER_DIR" "$PROGRAM_DIR"

cargo build --locked -p aeko-validator --bin aeko-test-validator
cargo build --locked -p aeko-keygen --bin aeko-keygen
cargo build --locked -p aeko-cli --bin aeko

bash ./cargo-build-sbf \
  --manifest-path contracts/hello-aeko-program/Cargo.toml \
  --sbf-out-dir "$PROGRAM_DIR" \
  -- \
  --locked

cargo check --locked \
  --manifest-path contracts/hello-aeko-program/Cargo.toml \
  --example invoke_hello

test -s "$PROGRAM_SO"
test -s "$PROGRAM_KEYPAIR"

target/debug/aeko-test-validator \
  --ledger "$LEDGER_DIR" \
  --rpc-port 18999 \
  --faucet-aeko 1000000 \
  --quiet \
  --reset >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

ready=0
for _ in $(seq 1 120); do
  if curl -fsS -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "$RPC_URL" | grep -q '"result":"ok"'; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "AEKO TestValidator did not become healthy for smart-contract validation." >&2
  exit 1
fi

AEKO_RPC_URL="$RPC_URL" \
AEKO_HELLO_PAYER_KEYPAIR="$LEDGER_DIR/faucet-keypair.json" \
AEKO_HELLO_PROGRAM_SO="$PROGRAM_SO" \
AEKO_HELLO_PROGRAM_KEYPAIR="$PROGRAM_KEYPAIR" \
python3 scripts/smoke-hello-program.py

echo "[PASS] SBF smart contract built, deployed with AEKO CLI, invoked on AEKO SVM, and verified on-chain."
