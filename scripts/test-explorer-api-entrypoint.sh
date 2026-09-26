#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRYPOINT="$ROOT/docker/explorer-api-entrypoint.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BIN="$TMP/bin"
CACHE="$TMP/cache"
mkdir -p "$BIN" "$CACHE"

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --max-time|--header) shift 2 ;;
    --fail|--silent|--show-error|--location) shift ;;
    *) url="$1"; shift ;;
  esac
done
case "$url" in
  */social-registry.env)
    cat > "$output" <<'REG'
AEKO_REGISTRY_SCHEMA_VERSION=2
AEKO_CHAIN_GENESIS_HASH=genesis-test
AEKO_SOCIAL_POSTS_STATE=posts
REG
    ;;
  */protocol-registry.env)
    cat > "$output" <<'REG'
AEKO_REGISTRY_SCHEMA_VERSION=2
AEKO_CHAIN_GENESIS_HASH=genesis-test
AEKO_PROTOCOL_AUTHORITY=authority
REG
    ;;
  *)
    exit 22
    ;;
esac
EOF
chmod +x "$BIN/curl"

cat > "$BIN/aeko-explorer-backend" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${AEKO_SOCIAL_REGISTRY_FILE:?missing Social registry file}"
: "${AEKO_PROTOCOL_REGISTRY_FILE:?missing Protocol registry file}"
test -s "$AEKO_SOCIAL_REGISTRY_FILE"
test -s "$AEKO_PROTOCOL_REGISTRY_FILE"
grep -Fq 'AEKO_CHAIN_GENESIS_HASH=genesis-test' "$AEKO_SOCIAL_REGISTRY_FILE"
grep -Fq 'AEKO_CHAIN_GENESIS_HASH=genesis-test' "$AEKO_PROTOCOL_REGISTRY_FILE"
printf '%s\n' ok > "$AEKO_TEST_BACKEND_MARKER"
EOF
chmod +x "$BIN/aeko-explorer-backend"

PATH="$BIN:$PATH" AEKO_TESTNET_REGISTRY_URL=https://registry.aeko.online AEKO_REGISTRY_CACHE_DIR="$CACHE" AEKO_REGISTRY_REFRESH_SECONDS=3600 AEKO_TEST_BACKEND_MARKER="$TMP/backend.ok"   "$ENTRYPOINT"

test -s "$TMP/backend.ok"
echo "[ok] Explorer entrypoint fetches a matching registry pair before startup"

# No remote registry URL preserves the mounted-file/local deployment contract.
PATH="$BIN:$PATH" AEKO_TEST_BACKEND_MARKER="$TMP/backend-local.ok" AEKO_SOCIAL_REGISTRY_FILE="$CACHE/social-registry.env" AEKO_PROTOCOL_REGISTRY_FILE="$CACHE/protocol-registry.env"   "$ENTRYPOINT"

test -s "$TMP/backend-local.ok"
echo "[ok] Explorer entrypoint preserves local mounted-file deployments"

echo "[PASS] Explorer registry domain contract"
