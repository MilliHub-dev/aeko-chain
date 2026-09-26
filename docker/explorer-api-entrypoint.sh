#!/bin/sh
set -eu

# Split deployments can resolve the canonical bootstrap registries over HTTPS.
# Local/legacy deployments may continue to mount the files directly and leave
# AEKO_TESTNET_REGISTRY_URL unset.
REGISTRY_BASE_URL="${AEKO_TESTNET_REGISTRY_URL:-}"
REGISTRY_DIR="${AEKO_REGISTRY_CACHE_DIR:-/tmp/aeko-registry}"
REFRESH_SECONDS="${AEKO_REGISTRY_REFRESH_SECONDS:-30}"
FETCH_TIMEOUT_SECONDS="${AEKO_REGISTRY_FETCH_TIMEOUT_SECONDS:-10}"

if [ -z "$REGISTRY_BASE_URL" ]; then
  exec aeko-explorer-backend "$@"
fi

positive_integer() {
  case "$2" in
    *[!0-9]*|"") echo "error: $1 must be a positive integer" >&2; exit 64 ;;
    0) echo "error: $1 must be greater than zero" >&2; exit 64 ;;
  esac
}

case "$REFRESH_SECONDS" in
  *[!0-9]*|"") echo "error: AEKO_REGISTRY_REFRESH_SECONDS must be a non-negative integer" >&2; exit 64 ;;
esac
positive_integer AEKO_REGISTRY_FETCH_TIMEOUT_SECONDS "$FETCH_TIMEOUT_SECONDS"

REGISTRY_BASE_URL="${REGISTRY_BASE_URL%/}"
SOCIAL_FILE="$REGISTRY_DIR/social-registry.env"
PROTOCOL_FILE="$REGISTRY_DIR/protocol-registry.env"
mkdir -p "$REGISTRY_DIR"

fetch_registry() {
  target="$1"
  url="$2"
  tmp="${target}.tmp"

  rm -f "$tmp"
  if ! curl --fail --silent --show-error --location     --max-time "$FETCH_TIMEOUT_SECONDS"     --header 'Accept: text/plain'     --output "$tmp"     "$url"; then
    rm -f "$tmp"
    return 1
  fi

  grep -Eq '^AEKO_REGISTRY_SCHEMA_VERSION=[0-9]+$' "$tmp" || {
    echo "error: registry response from $url is missing AEKO_REGISTRY_SCHEMA_VERSION" >&2
    rm -f "$tmp"
    return 1
  }
  grep -Eq '^AEKO_CHAIN_GENESIS_HASH=.+$' "$tmp" || {
    echo "error: registry response from $url is missing AEKO_CHAIN_GENESIS_HASH" >&2
    rm -f "$tmp"
    return 1
  }
}

publish_registry_pair() {
  social_tmp="${SOCIAL_FILE}.tmp"
  protocol_tmp="${PROTOCOL_FILE}.tmp"

  fetch_registry "$SOCIAL_FILE" "$REGISTRY_BASE_URL/social-registry.env" || return 1
  fetch_registry "$PROTOCOL_FILE" "$REGISTRY_BASE_URL/protocol-registry.env" || {
    rm -f "$social_tmp"
    return 1
  }

  social_genesis="$(sed -n 's/^AEKO_CHAIN_GENESIS_HASH=//p' "$social_tmp" | head -n 1)"
  protocol_genesis="$(sed -n 's/^AEKO_CHAIN_GENESIS_HASH=//p' "$protocol_tmp" | head -n 1)"
  if [ -z "$social_genesis" ] || [ "$social_genesis" != "$protocol_genesis" ]; then
    echo "error: Social and Protocol registry genesis hashes do not match" >&2
    rm -f "$social_tmp" "$protocol_tmp"
    return 1
  fi

  # Both candidates are complete and belong to the same genesis. Each rename
  # is atomic, so readers never observe a partially written registry file.
  mv "$social_tmp" "$SOCIAL_FILE"
  mv "$protocol_tmp" "$PROTOCOL_FILE"
}

echo "==> Fetching testnet bootstrap registries from $REGISTRY_BASE_URL"
publish_registry_pair || {
  echo "error: unable to fetch a complete matching registry pair before Explorer startup" >&2
  exit 69
}

export AEKO_SOCIAL_REGISTRY_FILE="$SOCIAL_FILE"
export AEKO_PROTOCOL_REGISTRY_FILE="$PROTOCOL_FILE"

if [ "$REFRESH_SECONDS" -gt 0 ]; then
  (
    while sleep "$REFRESH_SECONDS"; do
      if publish_registry_pair; then
        echo "==> Refreshed testnet bootstrap registries"
      else
        echo "warning: registry refresh failed; preserving the last verified pair" >&2
        rm -f "${SOCIAL_FILE}.tmp" "${PROTOCOL_FILE}.tmp"
      fi
    done
  ) &
fi

exec aeko-explorer-backend "$@"
