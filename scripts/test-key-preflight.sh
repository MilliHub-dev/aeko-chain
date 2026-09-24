#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SCRIPT="$REPO_ROOT/docker/key-preflight.sh"
WORK_DIR="$(mktemp -d)"
MOCK_BIN="$WORK_DIR/bin"
mkdir -p "$MOCK_BIN"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cat >"$MOCK_BIN/aeko-keygen" <<'MOCK'
#!/bin/sh
set -eu

command="$1"
shift
case "$command" in
  new)
    outfile=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --outfile)
          shift
          outfile="$1"
          ;;
      esac
      shift
    done
    [ -n "$outfile" ] || exit 2
    mkdir -p "$(dirname "$outfile")"
    printf '{"mock":"%s"}\n' "$(basename "$outfile")" >"$outfile"
    ;;
  pubkey)
    path="$1"
    [ -f "$path" ] && [ -s "$path" ] || exit 1
    case "$(basename "$path")" in
      protocol-authority-keypair.json) printf '%s\n' 'ProtocolAuthority11111111111111111111111111' ;;
      *) printf '%s\n' 'MockChainPubkey111111111111111111111111111' ;;
    esac
    ;;
  *)
    exit 2
    ;;
esac
MOCK
chmod +x "$MOCK_BIN/aeko-keygen"

new_case() {
  local name="$1"
  CASE_DIR="$WORK_DIR/$name"
  KEYS_DIR="$CASE_DIR/keys"
  STATE_DIR="$CASE_DIR/protocol-state"
  CONTINUITY_DIR="$CASE_DIR/protocol-continuity"
  mkdir -p "$KEYS_DIR" "$STATE_DIR" "$CONTINUITY_DIR"
}

seed_chain_keys() {
  local key
  for key in faucet-keypair.json stake-keypair.json validator-1-keypair.json vote-1-keypair.json; do
    printf '{"existing":"%s"}\n' "$key" >"$KEYS_DIR/$key"
  done
}

run_preflight() {
  local reset_ledger="${1:-0}"
  PATH="$MOCK_BIN:$PATH" \
  AEKO_KEYS_ROOT="$KEYS_DIR" \
  AEKO_PROTOCOL_STATE_ROOT="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_ROOT="$CONTINUITY_DIR" \
  AEKO_KEYS_SOURCE="$KEYS_DIR" \
  AEKO_ALLOW_CHAIN_KEY_GENERATION="${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}" \
  AEKO_RESET_LEDGER="$reset_ledger" \
  sh "$SCRIPT"
}

expect_status() {
  local expected="$1"
  shift
  set +e
  "$@"
  local status=$?
  set -e
  if [ "$status" -ne "$expected" ]; then
    echo "expected exit $expected, got $status" >&2
    exit 1
  fi
}

new_case fresh_protocol_identity
seed_chain_keys
run_preflight
test -s "$KEYS_DIR/protocol-authority-keypair.json"
echo "[ok] a network with no protocol registry gets its mandatory protocol authority automatically"

new_case established_protocol_missing_authority
seed_chain_keys
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=ProtocolAuthority11111111111111111111111111' >"$STATE_DIR/protocol-registry.env"
expect_status 64 env \
  PATH="$MOCK_BIN:$PATH" \
  AEKO_KEYS_ROOT="$KEYS_DIR" \
  AEKO_PROTOCOL_STATE_ROOT="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_ROOT="$CONTINUITY_DIR" \
  AEKO_KEYS_SOURCE="$KEYS_DIR" \
  AEKO_ALLOW_CHAIN_KEY_GENERATION=0 \
  sh "$SCRIPT"
echo "[ok] established protocol identity still fails closed when its authority is missing"

new_case established_protocol_matching_authority
seed_chain_keys
printf '{"existing":"protocol"}\n' >"$KEYS_DIR/protocol-authority-keypair.json"
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=ProtocolAuthority11111111111111111111111111' >"$STATE_DIR/protocol-registry.env"
cp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
run_preflight
echo "[ok] established matching protocol identity validates during normal redeploy"

new_case mismatched_protocol_continuity
seed_chain_keys
printf '{"existing":"protocol"}\n' >"$KEYS_DIR/protocol-authority-keypair.json"
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=ProtocolAuthority11111111111111111111111111' >"$STATE_DIR/protocol-registry.env"
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=DifferentAuthority111111111111111111111111' >"$CONTINUITY_DIR/protocol-registry.anchor"
expect_status 65 env \
  PATH="$MOCK_BIN:$PATH" \
  AEKO_KEYS_ROOT="$KEYS_DIR" \
  AEKO_PROTOCOL_STATE_ROOT="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_ROOT="$CONTINUITY_DIR" \
  AEKO_KEYS_SOURCE="$KEYS_DIR" \
  AEKO_ALLOW_CHAIN_KEY_GENERATION=0 \
  sh "$SCRIPT"
echo "[ok] mismatched protocol registry/continuity still fails closed"

new_case intentional_reset_discards_stale_protocol_identity
seed_chain_keys
printf '{"existing":"protocol"}\n' >"$KEYS_DIR/protocol-authority-keypair.json"
cp "$KEYS_DIR/protocol-authority-keypair.json" "$CASE_DIR/protocol-authority.before"
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=ProtocolAuthority11111111111111111111111111' >"$STATE_DIR/protocol-registry.env"
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=DifferentAuthority111111111111111111111111' >"$CONTINUITY_DIR/protocol-registry.anchor"
run_preflight 1
cmp "$CASE_DIR/protocol-authority.before" "$KEYS_DIR/protocol-authority-keypair.json"
echo "[ok] intentional reset ignores stale protocol state/continuity identity and preserves a valid existing authority"

new_case intentional_reset_missing_protocol_authority
seed_chain_keys
printf '%s\n' 'AEKO_PROTOCOL_AUTHORITY=OldAuthority1111111111111111111111111111' >"$STATE_DIR/protocol-registry.env"
cp "$STATE_DIR/protocol-registry.env" "$CONTINUITY_DIR/protocol-registry.anchor"
run_preflight 1
test -s "$KEYS_DIR/protocol-authority-keypair.json"
echo "[ok] intentional reset can create protocol authority when only discarded protocol identity remains"

new_case missing_chain_identity
seed_chain_keys
rm "$KEYS_DIR/vote-1-keypair.json"
expect_status 64 env \
  PATH="$MOCK_BIN:$PATH" \
  AEKO_KEYS_ROOT="$KEYS_DIR" \
  AEKO_PROTOCOL_STATE_ROOT="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_ROOT="$CONTINUITY_DIR" \
  AEKO_KEYS_SOURCE="$KEYS_DIR" \
  AEKO_ALLOW_CHAIN_KEY_GENERATION=0 \
  sh "$SCRIPT"
echo "[ok] established chain identity remains fail-closed"

new_case reset_still_requires_chain_identity
seed_chain_keys
rm "$KEYS_DIR/stake-keypair.json"
expect_status 64 env \
  PATH="$MOCK_BIN:$PATH" \
  AEKO_KEYS_ROOT="$KEYS_DIR" \
  AEKO_PROTOCOL_STATE_ROOT="$STATE_DIR" \
  AEKO_PROTOCOL_CONTINUITY_ROOT="$CONTINUITY_DIR" \
  AEKO_KEYS_SOURCE="$KEYS_DIR" \
  AEKO_ALLOW_CHAIN_KEY_GENERATION=0 \
  AEKO_RESET_LEDGER=1 \
  sh "$SCRIPT"
echo "[ok] destructive reset never authorizes silent chain-key replacement"

echo "[PASS] AEKO key preflight lifecycle contract"
