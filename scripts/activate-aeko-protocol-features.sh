#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FEATURE_SET_SOURCE="$REPO_ROOT/sdk/src/feature_set.rs"

feature_id_from_source() {
  local module="$1"

  [ -r "$FEATURE_SET_SOURCE" ] || {
    echo "error: canonical AEKO feature-set source is not readable: $FEATURE_SET_SOURCE" >&2
    exit 64
  }

  sed -n "/^pub mod ${module} {$/,/^}$/ s/.*declare_id!(\"\([^\"]*\)\").*/\1/p" "$FEATURE_SET_SOURCE" | head -n 1
}

TOKEN_FEATURE_ID="$(feature_id_from_source aeko_token_programs_v1)"
PERMISSION_FEATURE_ID="$(feature_id_from_source aeko_permission_layer_v1)"

[ -n "$TOKEN_FEATURE_ID" ] || {
  echo "error: could not resolve aeko_token_programs_v1 from $FEATURE_SET_SOURCE" >&2
  exit 64
}
[ -n "$PERMISSION_FEATURE_ID" ] || {
  echo "error: could not resolve aeko_permission_layer_v1 from $FEATURE_SET_SOURCE" >&2
  exit 64
}

: "${AEKO_RPC_URL:?Set AEKO_RPC_URL to the validator JSON-RPC URL}"
: "${AEKO_FEATURE_FEE_PAYER:?Set AEKO_FEATURE_FEE_PAYER to a funded keypair path}"
: "${AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR:?Set AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR to the offline token feature keypair}"
: "${AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR:?Set AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR to the offline permission feature keypair}"

AEKO_FEATURE_CLUSTER="${AEKO_FEATURE_CLUSTER:-development}"
AEKO_FEATURE_BUNDLE="${AEKO_FEATURE_BUNDLE:-both}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: required command not found: $1" >&2
    exit 64
  }
}

verify_feature_keypair() {
  local file="$1"
  local expected="$2"
  local label="$3"

  [ -f "$file" ] && [ -s "$file" ] || {
    echo "error: $label keypair is missing or empty: $file" >&2
    exit 65
  }

  local actual
  actual="$(aeko-keygen pubkey "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "error: $label keypair pubkey mismatch" >&2
    echo "       expected: $expected" >&2
    echo "       actual:   $actual" >&2
    exit 66
  fi
  echo "[ok] $label feature authority verified: $actual"
}

feature_exists() {
  local feature_id="$1"
  local response
  response="$(curl -fsS --max-time 15     -H 'Content-Type: application/json'     -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$feature_id\",{\"encoding\":\"base64\",\"commitment\":\"confirmed\"}]}"     "$AEKO_RPC_URL")"
  ! printf '%s' "$response" | grep -Eq '"value"[[:space:]]*:[[:space:]]*null'
}

activate_one() {
  local keypair="$1"
  local feature_id="$2"
  local label="$3"

  if feature_exists "$feature_id"; then
    echo "[skip] $label feature account already exists; inspect status instead of resubmitting activation"
    aeko --url "$AEKO_RPC_URL" feature status "$feature_id" --display-all
    return 0
  fi

  echo "==> Activating $label feature $feature_id"
  aeko     --url "$AEKO_RPC_URL"     --keypair "$AEKO_FEATURE_FEE_PAYER"     feature activate     "$keypair"     "$AEKO_FEATURE_CLUSTER"     --fee-payer "$AEKO_FEATURE_FEE_PAYER"

  echo "==> Activation submitted. The feature is pending until the runtime activates it at an epoch boundary."
  aeko --url "$AEKO_RPC_URL" feature status "$feature_id" --display-all
}

require_cmd aeko
require_cmd aeko-keygen
require_cmd curl

verify_feature_keypair "$AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR" "$TOKEN_FEATURE_ID" "token-programs"
verify_feature_keypair "$AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR" "$PERMISSION_FEATURE_ID" "permission-layer"

case "$AEKO_FEATURE_BUNDLE" in
  token)
    activate_one "$AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR" "$TOKEN_FEATURE_ID" "token-programs"
    ;;
  permission)
    activate_one "$AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR" "$PERMISSION_FEATURE_ID" "permission-layer"
    ;;
  both)
    activate_one "$AEKO_TOKEN_PROGRAMS_FEATURE_KEYPAIR" "$TOKEN_FEATURE_ID" "token-programs"
    activate_one "$AEKO_PERMISSION_LAYER_FEATURE_KEYPAIR" "$PERMISSION_FEATURE_ID" "permission-layer"
    ;;
  *)
    echo "error: AEKO_FEATURE_BUNDLE must be one of: token, permission, both" >&2
    exit 67
    ;;
esac
