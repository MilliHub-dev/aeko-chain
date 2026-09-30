#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRYPOINT="$REPO_ROOT/docker/validator-entrypoint.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_BIN="$TMP_DIR/bin"
KEYS="$TMP_DIR/keys"
mkdir -p "$FAKE_BIN" "$KEYS"

printf '%s\n' identity > "$KEYS/identity.json"
printf '%s\n' vote > "$KEYS/vote.json"

cat > "$FAKE_BIN/aeko-validator" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$AEKO_TEST_VALIDATOR_ARGS"
EOF
chmod +x "$FAKE_BIN/aeko-validator"

cat > "$FAKE_BIN/aeko-genesis" <<'EOF'
#!/usr/bin/env bash
ledger=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--ledger" ]; then
    ledger="$2"
    shift 2
    continue
  fi
  shift
done
: "${ledger:?fake genesis did not receive --ledger}"
mkdir -p "$ledger"
printf '%s\n' genesis > "$ledger/genesis.bin"
printf '%s\n' invoked > "$AEKO_TEST_GENESIS_LOG"
EOF
chmod +x "$FAKE_BIN/aeko-genesis"

ESTABLISHED_LEDGER="$TMP_DIR/established-ledger"
mkdir -p "$ESTABLISHED_LEDGER"
printf '%s\n' genesis > "$ESTABLISHED_LEDGER/genesis.bin"

AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/established-validator.args" AEKO_TEST_GENESIS_LOG="$TMP_DIR/established-genesis.log" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_STAKE_FILE="$KEYS/missing-stake.json" AEKO_FAUCET_FILE="$KEYS/missing-faucet.json" AEKO_FAUCET_ADDRESS="10.20.30.40:9900" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1   bash "$ENTRYPOINT"

test ! -e "$TMP_DIR/established-genesis.log"
grep -Fq -- "--rpc-faucet-address 10.20.30.40:9900" "$TMP_DIR/established-validator.args"
echo "[ok] established validator does not require genesis-only stake/faucet keys"

if env -u AEKO_FAUCET_ADDRESS AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/missing-remote-faucet.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_REQUIRE_REMOTE_FAUCET=1 bash "$ENTRYPOINT" >"$TMP_DIR/missing-remote-faucet.out" 2>&1; then
  echo "split validator unexpectedly accepted a missing Faucet address" >&2
  exit 1
fi
grep -Fq "AEKO_FAUCET_ADDRESS is required for this Validator deployment" "$TMP_DIR/missing-remote-faucet.out"
echo "[ok] split validator fails closed when the remote Faucet address is missing"

if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/http-faucet.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_REQUIRE_REMOTE_FAUCET=1 AEKO_FAUCET_ADDRESS="https://faucet.example.invalid:9900" bash "$ENTRYPOINT" >"$TMP_DIR/http-faucet.out" 2>&1; then
  echo "split validator unexpectedly accepted an HTTP Faucet URL" >&2
  exit 1
fi
grep -Fq "must be raw host:port, not a URL" "$TMP_DIR/http-faucet.out"
echo "[ok] split validator rejects HTTP/WAF Faucet routing"

if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/prompt-faucet.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_REQUIRE_REMOTE_FAUCET=1 AEKO_FAUCET_ADDRESS="Set a private or DNS-only Faucet host:9900" bash "$ENTRYPOINT" >"$TMP_DIR/prompt-faucet.out" 2>&1; then
  echo "split validator unexpectedly accepted deployment prompt text as Faucet address" >&2
  exit 1
fi
grep -Fq "must be a raw host:port without whitespace" "$TMP_DIR/prompt-faucet.out"
echo "[ok] split validator rejects literal deployment prompt text as Faucet address"

FRESH_LEDGER="$TMP_DIR/fresh-ledger"
if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/fresh-validator.args"   AEKO_TEST_GENESIS_LOG="$TMP_DIR/fresh-genesis.log"   PATH="$FAKE_BIN:$PATH"   AEKO_LEDGER_PATH="$FRESH_LEDGER"   AEKO_IDENTITY_FILE="$KEYS/identity.json"   AEKO_VOTE_FILE="$KEYS/vote.json"   AEKO_STAKE_FILE="$KEYS/missing-stake.json"   AEKO_FAUCET_FILE="$KEYS/missing-faucet.json"   AEKO_BOOTSTRAP=1   AEKO_REQUIRE_EXISTING_LEDGER=0     bash "$ENTRYPOINT"; then
  echo "fresh genesis unexpectedly accepted missing stake/faucet keypairs" >&2
  exit 1
fi
echo "[ok] fresh genesis still fails closed without genesis-only keypairs"

printf '%s\n' stake > "$KEYS/stake.json"
printf '%s\n' faucet > "$KEYS/faucet.json"

AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/fresh-validator.args" AEKO_TEST_GENESIS_LOG="$TMP_DIR/fresh-genesis.log" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$FRESH_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_STAKE_FILE="$KEYS/stake.json" AEKO_FAUCET_FILE="$KEYS/faucet.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=0   bash "$ENTRYPOINT"

test -s "$FRESH_LEDGER/genesis.bin"
test -s "$TMP_DIR/fresh-genesis.log"
echo "[ok] fresh genesis still requires and consumes stake/faucet keypairs"

echo "[PASS] validator entrypoint cross-host key-custody contract"
