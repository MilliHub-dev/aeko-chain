#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

ADMIN="${ADMIN:-false}"
CLI="${CLI:-false}"
CORE="${CORE:-false}"
PACKAGING="${PACKAGING:-false}"
EXPLORER_BACKEND="${EXPLORER_BACKEND:-false}"
EXPLORER_WEB="${EXPLORER_WEB:-false}"
EDITOR="${EDITOR:-false}"
COOLIFY_EDITOR="${COOLIFY_EDITOR:-false}"
COOLIFY_BOOTSTRAP="${COOLIFY_BOOTSTRAP:-false}"
COOLIFY_FAUCET_TOOLS="${COOLIFY_FAUCET_TOOLS:-false}"
COOLIFY_VALIDATOR="${COOLIFY_VALIDATOR:-false}"
COOLIFY_EXPLORER_API="${COOLIFY_EXPLORER_API:-false}"
COOLIFY_EXPLORER_UI="${COOLIFY_EXPLORER_UI:-false}"
COOLIFY_OPERATIONS_WEB="${COOLIFY_OPERATIONS_WEB:-false}"
SDK_JS="${SDK_JS:-false}"
SDK_NODE="${SDK_NODE:-false}"
SDK_PYTHON="${SDK_PYTHON:-false}"
SDK_RUST="${SDK_RUST:-false}"
CI_PIPELINE="${CI_PIPELINE:-false}"

# Pull requests to main and pushes to main always exercise the complete DevOps
# graph. Change detection still owns what may be published or deployed, but it
# never suppresses validation or image production.
run_admin=true
run_cli=true
run_explorer_backend=true
run_explorer_web=true
run_editor=true
run_network=true
run_sdk_non_rust=true
run_sdk_rust=true

build_admin=true
build_tools=true
build_explorer_backend=true
build_explorer_web=true
build_editor=true
build_network=true

run_ci_contract=true
run_runtime_contract=true
runtime_contract_mode=exact

# Deployment selection is intentionally not duplicated here. The release
# classifier decides which validated images are promoted, and post-promotion
# Coolify jobs deploy exactly those promoted resource families.

{
  echo "run_admin=$run_admin"
  echo "run_cli=$run_cli"
  echo "run_explorer_backend=$run_explorer_backend"
  echo "run_explorer_web=$run_explorer_web"
  echo "run_editor=$run_editor"
  echo "run_network=$run_network"
  echo "run_sdk_non_rust=$run_sdk_non_rust"
  echo "run_sdk_rust=$run_sdk_rust"
  echo "build_admin=$build_admin"
  echo "build_tools=$build_tools"
  echo "build_explorer_backend=$build_explorer_backend"
  echo "build_explorer_web=$build_explorer_web"
  echo "build_editor=$build_editor"
  echo "build_network=$build_network"
  echo "run_ci_contract=$run_ci_contract"
  echo "run_runtime_contract=$run_runtime_contract"
  echo "runtime_contract_mode=$runtime_contract_mode"
} >> "$GITHUB_OUTPUT"

printf 'DAG selection: validate(admin=%s cli=%s backend=%s web=%s editor=%s network=%s sdk-non-rust=%s sdk-rust=%s) build(admin=%s tools=%s backend=%s web=%s editor=%s network=%s) runtime=%s/%s\n' \
  "$run_admin" "$run_cli" "$run_explorer_backend" "$run_explorer_web" "$run_editor" "$run_network" "$run_sdk_non_rust" "$run_sdk_rust" \
  "$build_admin" "$build_tools" "$build_explorer_backend" "$build_explorer_web" "$build_editor" "$build_network" \
  "$run_runtime_contract" "$runtime_contract_mode"
