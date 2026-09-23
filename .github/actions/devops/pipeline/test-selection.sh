#!/usr/bin/env bash
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

assert_output() {
  local file="$1"
  local expected="$2"
  if ! grep -Fxq "$expected" "$file"; then
    echo "Expected output '$expected' in $file" >&2
    cat "$file" >&2
    exit 1
  fi
}

run_plan_case() {
  local label="$1"
  local event_name="$2"
  local ci_pipeline="$3"
  local core="$4"
  local expected_all="$5"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" \
  GITHUB_EVENT_NAME="$event_name" \
  ADMIN=false CLI=false CORE="$core" PACKAGING=false \
  EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false \
  CI_PIPELINE="$ci_pipeline" \
    bash "$PIPELINE_DIR/plan.sh"

  if [ "$expected_all" = "true" ]; then
    assert_output "$output" "run_admin=true"
    assert_output "$output" "run_cli=true"
    assert_output "$output" "run_explorer_backend=true"
    assert_output "$output" "run_explorer_web=true"
    assert_output "$output" "run_network=true"
  fi

  if [ "$ci_pipeline" = "true" ]; then
    assert_output "$output" "run_ci_contract=true"
  fi

  rm -f "$output"
  echo "[ok] $label"
}

run_release_case() {
  local label="$1"
  local event_name="$2"
  local ref="$3"
  local dockerized="$4"
  local expected_publish="$5"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" \
  GITHUB_EVENT_NAME="$event_name" \
  GITHUB_REF="$ref" \
  GITHUB_SHA="1234567890abcdef1234567890abcdef12345678" \
  DOCKERIZED="$dockerized" \
    bash "$PIPELINE_DIR/resolve-release.sh"

  assert_output "$output" "publish=$expected_publish"
  assert_output "$output" "sha_tag=1234567890ab"
  rm -f "$output"
  echo "[ok] $label"
}

run_plan_case "CI-only pull request builds the full image DAG" pull_request true false true
run_plan_case "CI-only main push builds the full image DAG" push true false true
run_plan_case "core main push still rebuilds the full image DAG" push false true true

run_release_case "CI-only main push does not publish" push refs/heads/main false false
run_release_case "product main push publishes immutable images" push refs/heads/main true true
run_release_case "product pull request never publishes" pull_request refs/pull/57/merge true false

echo "[PASS] AEKO DevOps selection and release-mode contracts"
