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

PATH="$BIN:$PATH" AEKO_NETWORK=testnet AEKO_REGISTRY_URL=https://registry.aeko.online AEKO_REGISTRY_CACHE_DIR="$CACHE" AEKO_REGISTRY_REFRESH_SECONDS=0 AEKO_TEST_BACKEND_MARKER="$TMP/backend.ok"   sh "$ENTRYPOINT"

test -s "$TMP/backend.ok"
echo "[ok] Explorer entrypoint fetches a matching registry pair before startup"

# Split Explorer must fail before curl/backend startup when the registry input is
# missing or accidentally contains a Compose/Coolify human-readable prompt.
if env -u AEKO_REGISTRY_URL PATH="$BIN:$PATH" AEKO_NETWORK=testnet AEKO_REQUIRE_REMOTE_REGISTRY=1 AEKO_REGISTRY_CACHE_DIR="$CACHE" AEKO_REGISTRY_REFRESH_SECONDS=0 AEKO_TEST_BACKEND_MARKER="$TMP/backend-missing.ok" sh "$ENTRYPOINT" >"$TMP/missing.out" 2>&1; then
  echo "error: split Explorer unexpectedly started without AEKO_REGISTRY_URL" >&2
  exit 1
fi
grep -Fq "AEKO_REGISTRY_URL is required for this Explorer deployment" "$TMP/missing.out"
test ! -e "$TMP/backend-missing.ok"
echo "[ok] split Explorer fails closed when registry URL is missing"

if PATH="$BIN:$PATH" AEKO_NETWORK=testnet AEKO_REQUIRE_REMOTE_REGISTRY=1 AEKO_REGISTRY_URL="Set private or DNS-only registry URL" AEKO_REGISTRY_CACHE_DIR="$CACHE" AEKO_REGISTRY_REFRESH_SECONDS=0 AEKO_TEST_BACKEND_MARKER="$TMP/backend-invalid.ok" sh "$ENTRYPOINT" >"$TMP/invalid.out" 2>&1; then
  echo "error: Explorer unexpectedly accepted a non-URL registry value" >&2
  exit 1
fi
grep -Fq "AEKO_REGISTRY_URL contains placeholder/guidance text" "$TMP/invalid.out"
test ! -e "$TMP/backend-invalid.ok"
echo "[ok] Explorer rejects literal deployment prompt text as a registry URL"

if PATH="$BIN:$PATH" AEKO_NETWORK=testnet AEKO_REQUIRE_REMOTE_REGISTRY=1 AEKO_REGISTRY_URL="https://<private-registry-origin>" AEKO_REGISTRY_CACHE_DIR="$CACHE" AEKO_REGISTRY_REFRESH_SECONDS=0 AEKO_TEST_BACKEND_MARKER="$TMP/backend-placeholder.ok" sh "$ENTRYPOINT" >"$TMP/placeholder.out" 2>&1; then
  echo "error: Explorer unexpectedly accepted an angle-bracket registry placeholder" >&2
  exit 1
fi
grep -Fq "AEKO_REGISTRY_URL contains placeholder/guidance text" "$TMP/placeholder.out"
test ! -e "$TMP/backend-placeholder.ok"
echo "[ok] Explorer rejects angle-bracket registry placeholders before curl"

# No remote registry URL preserves the mounted-file/local deployment contract.
PATH="$BIN:$PATH" AEKO_NETWORK=localnet AEKO_TEST_BACKEND_MARKER="$TMP/backend-local.ok" AEKO_SOCIAL_REGISTRY_FILE="$CACHE/social-registry.env" AEKO_PROTOCOL_REGISTRY_FILE="$CACHE/protocol-registry.env"   sh "$ENTRYPOINT"

test -s "$TMP/backend-local.ok"
echo "[ok] Explorer entrypoint preserves local mounted-file deployments"

echo "[PASS] Explorer registry domain contract"
