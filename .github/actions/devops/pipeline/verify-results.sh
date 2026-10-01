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
require_result "${EXPECT_WEB_UI:-false}" "explorer-ui" "${WEB_UI_RESULT:-}"
require_result "${EXPECT_CLI:-false}" "cli" "${CLI_RESULT:-}"
require_result "${EXPECT_RUNTIME_SERVICES:-false}" "runtime-producers" "${RUNTIME_SERVICES_RESULT:-}"
require_result "${EXPECT_SDK_VALIDATION:-false}" "sdk" "${SDK_VALIDATION_RESULT:-}"

if [ "${#failures[@]}" -gt 0 ]; then
  printf 'One or more selected AEKO DevOps job groups did not finish successfully:\n' >&2
  printf '  %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "All selected AEKO DevOps job groups passed."
