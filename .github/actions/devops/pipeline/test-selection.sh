#!/usr/bin/env bash
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_PUBLISH_DIR="$(cd "$PIPELINE_DIR/../sdk-publish" && pwd)"

assert_output() {
  local file="$1" expected="$2"
  if ! grep -Fxq "$expected" "$file"; then
    echo "Expected output '$expected' in $file" >&2
    cat "$file" >&2
    exit 1
  fi
}


assert_node24_action_majors() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local setup_action="$PIPELINE_DIR/setup/action.yml"

  for deprecated in \
    "actions/checkout@v4" \
    "actions/setup-node@v4" \
    "actions/setup-python@v5" \
    "docker/login-action@v3" \
    "docker/setup-buildx-action@v3"; do
    if grep -Fq "$deprecated" "$workflow" "$setup_action"; then
      echo "Deprecated Node-20 action major remains in the active DevOps pipeline: $deprecated" >&2
      exit 1
    fi
  done

  grep -Fq "actions/checkout@v5" "$workflow"
  grep -Fq "actions/setup-node@v5" "$setup_action"
  grep -Fq "actions/setup-python@v6" "$setup_action"
  grep -Fq "docker/login-action@v4" "$workflow"
  grep -Fq "docker/setup-buildx-action@v4" "$setup_action"

  echo "[ok] active DevOps third-party actions use Node-24-backed majors"
}

run_plan_case() {
  local label="$1" event_name="$2" ci_pipeline="$3" core="$4" expected_all="$5"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" GITHUB_EVENT_NAME="$event_name" \
  ADMIN=false CLI=false CORE="$core" PACKAGING=false \
  EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false \
  CI_PIPELINE="$ci_pipeline" bash "$PIPELINE_DIR/plan.sh"

  if [ "$expected_all" = "true" ]; then
    assert_output "$output" "run_admin=true"
    assert_output "$output" "run_cli=true"
    assert_output "$output" "run_explorer_backend=true"
    assert_output "$output" "run_explorer_web=true"
    assert_output "$output" "run_network=true"
  fi

  if [ "$ci_pipeline" = "true" ]; then
    assert_output "$output" "run_sdk_non_rust=true"
    assert_output "$output" "run_sdk_rust=true"
  fi

  assert_output "$output" "run_ci_contract=true"

  rm -f "$output"
  echo "[ok] $label"
}

run_release_case() {
  local label="$1" event_name="$2" ref="$3" dockerized="$4" ci_pipeline="$5" expected_publish="$6"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" GITHUB_EVENT_NAME="$event_name" GITHUB_REF="$ref" \
  GITHUB_SHA="1234567890abcdef1234567890abcdef12345678" \
  DOCKERIZED="$dockerized" CI_PIPELINE="$ci_pipeline" \
    bash "$PIPELINE_DIR/resolve-release.sh"

  assert_output "$output" "publish=$expected_publish"
  assert_output "$output" "sha_tag=1234567890ab"
  rm -f "$output"
  echo "[ok] $label"
}

assert_node24_action_majors

run_plan_case "CI-only pull request runs images and all external SDK validation" pull_request true false true
run_plan_case "CI-only main push runs images and all external SDK validation" push true false true
run_plan_case "core main push still rebuilds the full image DAG" push false true true

run_release_case "CI-only main push publishes verified images" push refs/heads/main false true true
run_release_case "product main push publishes immutable images" push refs/heads/main true false true
run_release_case "CI-only pull request never publishes" pull_request refs/pull/58/merge false true false
run_release_case "product pull request never publishes" pull_request refs/pull/58/merge true false false
run_release_case "SDK-only main push does not invent Docker publication" push refs/heads/main false false false

GITHUB_WORKSPACE="$PWD" PUBLISH_JS=true BEST_EFFORT=true NPM_TOKEN="" \
  bash "$SDK_PUBLISH_DIR/publish-selected.sh"
echo "[ok] best-effort SDK publication logs missing credentials and continues"

if GITHUB_WORKSPACE="$PWD" PUBLISH_JS=true BEST_EFFORT=false NPM_TOKEN="" \
  bash "$SDK_PUBLISH_DIR/publish-selected.sh"; then
  echo "Strict SDK publication unexpectedly accepted a missing npm token." >&2
  exit 1
fi
echo "[ok] strict/manual SDK publication still fails on missing credentials"

echo "[PASS] AEKO DevOps selection, release, and SDK continuation contracts"
