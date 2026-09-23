#!/usr/bin/env bash
set -euo pipefail

failures=()

require_result() {
  local expected="$1"
  local label="$2"
  local result="$3"

  if [ "$expected" = "true" ]; then
    if [ "$result" != "success" ]; then
      failures+=("${label}:${result:-missing}")
    fi
    return 0
  fi

  if [ "$result" != "skipped" ]; then
    failures+=("${label}:unexpected-${result:-missing}")
  fi
}

if [ "${CLASSIFY_RESULT:-}" != "success" ]; then
  failures+=("classify:${CLASSIFY_RESULT:-missing}")
fi

require_result "${EXPECT_CI_CONTRACT:-false}" "ci-contract" "${CI_CONTRACT_RESULT:-}"
require_result "${EXPECT_ADMIN:-false}" "operations-web" "${ADMIN_RESULT:-}"
require_result "${EXPECT_EXPLORER_WEB:-false}" "explorer-web" "${EXPLORER_WEB_RESULT:-}"
require_result "${EXPECT_CLI:-false}" "cli" "${CLI_RESULT:-}"
require_result "${EXPECT_EXPLORER_BACKEND:-false}" "explorer-backend" "${EXPLORER_BACKEND_RESULT:-}"
require_result "${EXPECT_NETWORK:-false}" "network" "${NETWORK_RESULT:-}"
require_result "${EXPECT_SDK_NON_RUST:-false}" "sdk-non-rust" "${SDK_NON_RUST_RESULT:-}"
require_result "${EXPECT_SDK_RUST:-false}" "sdk-rust" "${SDK_RUST_RESULT:-}"

if [ "${#failures[@]}" -gt 0 ]; then
  printf 'One or more selected AEKO DevOps jobs did not finish successfully:\n' >&2
  printf '  %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "All selected AEKO DevOps jobs passed."
