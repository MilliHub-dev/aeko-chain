#!/usr/bin/env bash
set -euo pipefail

CURL_BIN="${CURL_BIN:-curl}"

normalize_bool() {
  case "${1:-false}" in
    true|false) printf '%s' "$1" ;;
    *)
      echo "error: expected true/false, got '${1:-}'" >&2
      exit 64
      ;;
  esac
}

trigger_resource() {
  local label="$1"
  local enabled
  enabled="$(normalize_bool "$2")"
  local url="$3"
  local token="$4"

  if [ "$enabled" != "true" ]; then
    echo "Coolify split deploy: skip ${label}"
    return 0
  fi

  if [ -z "$url" ] || [ -z "$token" ]; then
    echo "error: ${label} deployment selected but its Coolify webhook URL/API key is missing" >&2
    exit 64
  fi

  url="$(printf '%s' "$url" | tr -d '\r\n')"
  token="$(printf '%s' "$token" | tr -d '\r\n')"

  if [ -z "$url" ] || [ -z "$token" ]; then
    echo "error: ${label} Coolify webhook URL/API key became empty after normalization" >&2
    exit 64
  fi

  echo "Coolify split deploy: trigger ${label}"
  "$CURL_BIN" --fail-with-body --silent --show-error --request POST --header "Authorization: Bearer ${token}" "$url"
}

trigger_resource "Explorer API" "${DEPLOY_EXPLORER_API:-false}" "${COOLIFY_EXPLORER_API_WEBHOOK_URL:-}" "${COOLIFY_EXPLORER_API_WEBHOOK_API_KEY:-}"
trigger_resource "Explorer UI" "${DEPLOY_EXPLORER_UI:-false}" "${COOLIFY_EXPLORER_UI_WEBHOOK_URL:-}" "${COOLIFY_EXPLORER_UI_WEBHOOK_API_KEY:-}"
trigger_resource "Operations Web" "${DEPLOY_OPERATIONS_WEB:-false}" "${COOLIFY_OPERATIONS_WEB_WEBHOOK_URL:-}" "${COOLIFY_OPERATIONS_WEB_WEBHOOK_API_KEY:-}"

if [ "$(normalize_bool "${STATEFUL_COOLIFY_RELEASE:-false}")" = "true" ]; then
  echo "Coolify split deploy: stateful chain images/config changed; Validator, bootstrap, and faucet-tools remain manual by policy."
fi
