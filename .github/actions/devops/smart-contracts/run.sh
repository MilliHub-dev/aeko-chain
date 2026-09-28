#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

LIVE_TESTNET="${AEKO_SMART_CONTRACT_LIVE_TESTNET:-false}"
LIVE_RPC_URL="${AEKO_SMART_CONTRACT_RPC_URL:-https://rpc.aeko.online}"
LIVE_FUNDING_BASE="${AEKO_SMART_CONTRACT_FUNDING_URL:-https://scan.aeko.online/api/explorer/testnet}"
REQUESTED_AIRDROP_AEKO="${AEKO_SMART_CONTRACT_AIRDROP_AEKO:-10}"

WORK_DIR="$(mktemp -d)"
PROGRAM_DIR="$WORK_DIR/hello-program"
PROGRAM_SO="$PROGRAM_DIR/hello_aeko_program.so"
PROGRAM_KEYPAIR="$PROGRAM_DIR/hello_aeko_program-keypair.json"
LIVE_PAYER="$WORK_DIR/live-payer.json"

cleanup() {
  local status=$?
  trap - EXIT
  rm -rf "$WORK_DIR"
  exit "$status"
}
trap cleanup EXIT

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  local body

  body="$(RPC_METHOD="$method" RPC_PARAMS="$params" python3 - <<'PY'
import json
import os

print(json.dumps(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": os.environ["RPC_METHOD"],
        "params": json.loads(os.environ["RPC_PARAMS"]),
    },
    separators=(",", ":"),
))
PY
)"

  curl --fail-with-body --silent --show-error     --connect-timeout 10 --max-time 25 --retry 2 --retry-all-errors     -H 'Content-Type: application/json'     -H 'Accept: application/json'     --data-binary "$body"     "$LIVE_RPC_URL"
}

json_rpc_result() {
  local payload="$1"
  PAYLOAD="$payload" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["PAYLOAD"])
if payload.get("error"):
    raise SystemExit(f"RPC error: {payload['error']}")
if "result" not in payload:
    raise SystemExit(f"RPC response has no result: {payload!r}")

result = payload["result"]
if isinstance(result, (dict, list)):
    print(json.dumps(result, separators=(",", ":")))
else:
    print(result)
PY
}

mkdir -p "$PROGRAM_DIR"

# Always prove the developer contract builds, even if the public Testnet is
# temporarily unavailable. This lane never builds Validator/Faucet/bootstrap
# binaries and never owns network Docker images.
cargo build --locked -p aeko-keygen --bin aeko-keygen
cargo build --locked -p aeko-cli --bin aeko
bash ./cargo-build-sbf --manifest-path contracts/hello-aeko-program/Cargo.toml --sbf-out-dir "$PROGRAM_DIR" -- --locked
cargo check --locked --manifest-path contracts/hello-aeko-program/Cargo.toml --example invoke_hello

test -s "$PROGRAM_SO"
test -s "$PROGRAM_KEYPAIR"
echo "[ok] Hello AEKO SBF artifact and program keypair built"

if [ "$LIVE_TESTNET" != "true" ]; then
  echo "[PASS] SBF smart contract build completed; live Testnet deployment was not requested."
  exit 0
fi

echo "==> Probing live AEKO Testnet RPC: $LIVE_RPC_URL"
health_json="$(rpc_call getHealth)"
health="$(json_rpc_result "$health_json")"
if [ "$health" != "ok" ]; then
  echo "Live AEKO Testnet RPC is not healthy: $health" >&2
  exit 1
fi

genesis_json="$(rpc_call getGenesisHash)"
genesis="$(json_rpc_result "$genesis_json")"
slot_json="$(rpc_call getSlot '[{"commitment":"confirmed"}]')"
slot="$(json_rpc_result "$slot_json")"
if ! [[ "$slot" =~ ^[0-9]+$ ]] || [ "$slot" -le 0 ]; then
  echo "Live AEKO Testnet returned an invalid slot: $slot" >&2
  exit 1
fi
echo "[ok] live AEKO Testnet RPC healthy; genesis=$genesis slot=$slot"

echo "==> Reading live Test Console funding policy"
policy_json="$(curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 25 --retry 2 --retry-all-errors -H 'Accept: application/json' "$LIVE_FUNDING_BASE/funding/policy")"

funding_amount="$(POLICY_JSON="$policy_json" REQUESTED="$REQUESTED_AIRDROP_AEKO" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["POLICY_JSON"])
data = payload.get("data")
if not isinstance(data, dict):
    raise SystemExit(f"funding policy has no data envelope: {payload!r}")
if data.get("enabled") is not True:
    raise SystemExit("live Test Console funding policy is disabled")

requested = float(os.environ["REQUESTED"])
console_cap = float(data.get("consoleAirdropCapAeko", 0))
faucet_cap = float(data.get("faucetPerRequestCapAeko", 0))
amount = min(requested, console_cap, faucet_cap)
if amount <= 0:
    raise SystemExit(
        f"no usable Test Console airdrop amount: requested={requested}, "
        f"consoleCap={console_cap}, faucetCap={faucet_cap}"
    )

print(f"{amount:.9f}".rstrip("0").rstrip("."))
PY
)"
echo "[ok] live Test Console funding available; requesting $funding_amount AEKO"

target/debug/aeko-keygen new --no-bip39-passphrase --silent --outfile "$LIVE_PAYER"
payer="$(target/debug/aeko-keygen pubkey "$LIVE_PAYER")"
test -n "$payer"
echo "[ok] created ephemeral deploy wallet $payer"

airdrop_body="$(PAYER="$payer" AMOUNT="$funding_amount" python3 - <<'PY'
import json
import os

print(json.dumps(
    {
        "address": os.environ["PAYER"],
        "amountAeko": float(os.environ["AMOUNT"]),
    },
    separators=(",", ":"),
))
PY
)"

airdrop_json="$(curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 40 --retry 1 --retry-all-errors -X POST -H 'Content-Type: application/json' -H 'Accept: application/json' --data "$airdrop_body" "$LIVE_FUNDING_BASE/funding/airdrop")"

airdrop_signature="$(AIRDROP_JSON="$airdrop_json" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["AIRDROP_JSON"])
data = payload.get("data")
if not isinstance(data, dict):
    raise SystemExit(f"airdrop response has no data envelope: {payload!r}")

signature = str(data.get("signature") or "").strip()
if not signature:
    raise SystemExit(f"airdrop returned no signature: {data!r}")

print(signature)
PY
)"
echo "[ok] Test Console airdrop submitted: $airdrop_signature"

balance_params="$(PAYER="$payer" python3 - <<'PY'
import json
import os

print(json.dumps(
    [os.environ["PAYER"], {"commitment": "confirmed"}],
    separators=(",", ":"),
))
PY
)"

funded=0
for _ in $(seq 1 60); do
  balance_json="$(rpc_call getBalance "$balance_params")"
  balance="$(BALANCE_JSON="$balance_json" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["BALANCE_JSON"])
if payload.get("error"):
    raise SystemExit(f"getBalance failed: {payload['error']}")

result = payload.get("result")
value = result.get("value") if isinstance(result, dict) else result
print(int(value or 0))
PY
)"
  if [ "$balance" -gt 0 ]; then
    funded=1
    echo "[ok] ephemeral deploy wallet funded with $balance lamports"
    break
  fi
  sleep 2
done

if [ "$funded" -ne 1 ]; then
  echo "Test Console airdrop did not produce a spendable wallet balance." >&2
  exit 1
fi

AEKO_RPC_URL="$LIVE_RPC_URL" AEKO_HELLO_PAYER_KEYPAIR="$LIVE_PAYER" AEKO_HELLO_PROGRAM_SO="$PROGRAM_SO" AEKO_HELLO_PROGRAM_KEYPAIR="$PROGRAM_KEYPAIR" python3 scripts/smoke-hello-program.py

echo "[PASS] live AEKO Testnet SBF build -> ephemeral wallet -> Test Console airdrop -> AEKO CLI deploy -> SVM invoke verified."
