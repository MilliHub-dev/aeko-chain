#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

ADMIN="${ADMIN:-false}"
CLI="${CLI:-false}"
CORE="${CORE:-false}"
PACKAGING="${PACKAGING:-false}"
EXPLORER_BACKEND="${EXPLORER_BACKEND:-false}"
EXPLORER_WEB="${EXPLORER_WEB:-false}"
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
run_network=true
run_sdk_non_rust=true
run_sdk_rust=true

build_admin=true
build_tools=true
build_explorer_backend=true
build_explorer_web=true
build_network=true

run_ci_contract=true
run_runtime_contract=true
runtime_contract_mode=exact

# Deployment ownership remains change-aware even though build validation is
# exhaustive. Publication/deployment jobs are branch-gated separately.
deploy_explorer_api=false
deploy_explorer_ui=false
deploy_operations_web=false
stateful_coolify_release=false

if [ "$EXPLORER_BACKEND" = true ] || [ "$COOLIFY_EXPLORER_API" = true ]; then deploy_explorer_api=true; fi
if [ "$EXPLORER_WEB" = true ] || [ "$COOLIFY_EXPLORER_UI" = true ]; then deploy_explorer_ui=true; fi
if [ "$ADMIN" = true ] || [ "$COOLIFY_OPERATIONS_WEB" = true ]; then deploy_operations_web=true; fi

if [ "$CORE" = true ] || [ "$COOLIFY_BOOTSTRAP" = true ] || [ "$COOLIFY_FAUCET_TOOLS" = true ] || [ "$COOLIFY_VALIDATOR" = true ]; then
  stateful_coolify_release=true
fi

{
  echo "run_admin=$run_admin"
  echo "run_cli=$run_cli"
  echo "run_explorer_backend=$run_explorer_backend"
  echo "run_explorer_web=$run_explorer_web"
  echo "run_network=$run_network"
  echo "run_sdk_non_rust=$run_sdk_non_rust"
  echo "run_sdk_rust=$run_sdk_rust"
  echo "build_admin=$build_admin"
  echo "build_tools=$build_tools"
  echo "build_explorer_backend=$build_explorer_backend"
  echo "build_explorer_web=$build_explorer_web"
  echo "build_network=$build_network"
  echo "run_ci_contract=$run_ci_contract"
  echo "run_runtime_contract=$run_runtime_contract"
  echo "runtime_contract_mode=$runtime_contract_mode"
  echo "deploy_explorer_api=$deploy_explorer_api"
  echo "deploy_explorer_ui=$deploy_explorer_ui"
  echo "deploy_operations_web=$deploy_operations_web"
  echo "stateful_coolify_release=$stateful_coolify_release"
} >> "$GITHUB_OUTPUT"

printf 'DAG selection: validate(admin=%s cli=%s backend=%s web=%s network=%s sdk-non-rust=%s sdk-rust=%s) build(admin=%s tools=%s backend=%s web=%s network=%s) runtime=%s/%s deploy(api=%s,ui=%s,ops=%s) stateful-manual=%s\n' \
  "$run_admin" "$run_cli" "$run_explorer_backend" "$run_explorer_web" "$run_network" "$run_sdk_non_rust" "$run_sdk_rust" \
  "$build_admin" "$build_tools" "$build_explorer_backend" "$build_explorer_web" "$build_network" \
  "$run_runtime_contract" "$runtime_contract_mode" "$deploy_explorer_api" "$deploy_explorer_ui" "$deploy_operations_web" "$stateful_coolify_release"
