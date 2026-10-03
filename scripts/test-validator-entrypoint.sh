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
grep -Fq "AEKO_FAUCET_ADDRESS contains placeholder/guidance text" "$TMP_DIR/prompt-faucet.out"
echo "[ok] split validator rejects literal deployment prompt text as Faucet address"

if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/placeholder-faucet.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_REQUIRE_REMOTE_FAUCET=1 AEKO_FAUCET_ADDRESS="<private-faucet-host>:9900" bash "$ENTRYPOINT" >"$TMP_DIR/placeholder-faucet.out" 2>&1; then
  echo "split validator unexpectedly accepted an angle-bracket Faucet placeholder" >&2
  exit 1
fi
grep -Fq "AEKO_FAUCET_ADDRESS contains placeholder/guidance text" "$TMP_DIR/placeholder-faucet.out"
echo "[ok] split validator rejects angle-bracket Faucet placeholders before startup"

for faucet_address in "127.0.0.1:9900" "localhost:9900" "0.0.0.0:9900" "[::1]:9900"; do
  label=$(printf '%s' "$faucet_address" | sed 's/[^A-Za-z0-9]/_/g')
  if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/invalid-remote-faucet-${label}.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_REQUIRE_REMOTE_FAUCET=1 AEKO_FAUCET_ADDRESS="$faucet_address" bash "$ENTRYPOINT" >"$TMP_DIR/invalid-remote-faucet-${label}.out" 2>&1; then
    echo "split validator unexpectedly accepted non-routable remote Faucet address: $faucet_address" >&2
    exit 1
  fi
  grep -Fq "must identify a remotely reachable Faucet host, not loopback/wildcard" "$TMP_DIR/invalid-remote-faucet-${label}.out"
done
echo "[ok] split validator rejects loopback/wildcard Faucet targets"

if env -u AEKO_GOSSIP_HOST AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/missing-gossip.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_FAUCET_ADDRESS="10.20.30.40:9900" AEKO_REQUIRE_GOSSIP_HOST=1 bash "$ENTRYPOINT" >"$TMP_DIR/missing-gossip.out" 2>&1; then
  echo "split validator unexpectedly accepted a missing gossip host" >&2
  exit 1
fi
grep -Fq "AEKO_GOSSIP_HOST is required for this Validator deployment" "$TMP_DIR/missing-gossip.out"
echo "[ok] split validator fails closed when the gossip host is missing"

if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/prompt-gossip.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_FAUCET_ADDRESS="10.20.30.40:9900" AEKO_REQUIRE_GOSSIP_HOST=1 AEKO_GOSSIP_HOST="Set gossip hostname" bash "$ENTRYPOINT" >"$TMP_DIR/prompt-gossip.out" 2>&1; then
  echo "split validator unexpectedly accepted deployment prompt text as gossip host" >&2
  exit 1
fi
grep -Fq "AEKO_GOSSIP_HOST contains placeholder/guidance text" "$TMP_DIR/prompt-gossip.out"
echo "[ok] split validator rejects literal deployment prompt text as gossip host"

if AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/url-gossip.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_FAUCET_ADDRESS="10.20.30.40:9900" AEKO_REQUIRE_GOSSIP_HOST=1 AEKO_GOSSIP_HOST="https://gossip.example.invalid" bash "$ENTRYPOINT" >"$TMP_DIR/url-gossip.out" 2>&1; then
  echo "split validator unexpectedly accepted a URL-shaped gossip host" >&2
  exit 1
fi
grep -Fq "AEKO_GOSSIP_HOST must be a hostname or IP without a URL scheme" "$TMP_DIR/url-gossip.out"
echo "[ok] split validator rejects URL-shaped gossip host values"

AEKO_TEST_VALIDATOR_ARGS="$TMP_DIR/explicit-gossip.args" PATH="$FAKE_BIN:$PATH" AEKO_LEDGER_PATH="$ESTABLISHED_LEDGER" AEKO_IDENTITY_FILE="$KEYS/identity.json" AEKO_VOTE_FILE="$KEYS/vote.json" AEKO_BOOTSTRAP=1 AEKO_REQUIRE_EXISTING_LEDGER=1 AEKO_FAUCET_ADDRESS="10.20.30.40:9900" AEKO_REQUIRE_GOSSIP_HOST=1 AEKO_GOSSIP_HOST="gossip.example.invalid" AEKO_DYNAMIC_PORT_RANGE="8000-8050" bash "$ENTRYPOINT"
grep -Fq -- "--gossip-host gossip.example.invalid" "$TMP_DIR/explicit-gossip.args"
grep -Fq -- "--gossip-port 8001" "$TMP_DIR/explicit-gossip.args"
grep -Fq -- "--dynamic-port-range 8000-8050" "$TMP_DIR/explicit-gossip.args"
echo "[ok] split validator advertises the explicitly configured gossip endpoint and transport range"

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
