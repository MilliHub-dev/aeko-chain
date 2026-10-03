#!/usr/bin/env bash
set -euo pipefail

CURL_BIN="${CURL_BIN:-curl}"

: "${COOLIFY_RESOURCE:?COOLIFY_RESOURCE is required}"
: "${DEPLOY_ENDPOINT:?resource webhook secret is required}"
: "${WEBHOOK_API_KEY:?WEBHOOK_API_KEY secret is required}"

endpoint="$(printf '%s' "$DEPLOY_ENDPOINT" | tr -d '\r\n')"
token="$(printf '%s' "$WEBHOOK_API_KEY" | tr -d '\r\n')"

if [ -z "$endpoint" ] || [ -z "$token" ]; then
  echo "error: ${COOLIFY_RESOURCE} Coolify deploy credentials became empty after normalization" >&2
  exit 64
fi

case "$endpoint" in
  http://*|https://*) ;;
  *)
    echo "error: ${COOLIFY_RESOURCE} deploy endpoint must be an http(s) URL" >&2
    exit 64
    ;;
esac

echo "Coolify deploy: trigger ${COOLIFY_RESOURCE}"
"$CURL_BIN" --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${token}" \
  "$endpoint"
