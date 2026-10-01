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

# Run only the domains affected by this change set. Shared packaging changes
# exercise every image target, while CI implementation changes exercise the
# complete orchestration graph. This keeps ordinary app/SDK changes scoped.
run_admin=false
run_cli=false
run_explorer_backend=false
run_explorer_web=false
run_network=false
run_sdk_non_rust=false
run_sdk_rust=false
deploy_explorer_api=false
deploy_explorer_ui=false
deploy_operations_web=false
stateful_coolify_release=false
run_ci_contract=true

if [ "$ADMIN" = "true" ] || [ "$PACKAGING" = "true" ]; then run_admin=true; fi
if [ "$EXPLORER_WEB" = "true" ] || [ "$PACKAGING" = "true" ]; then run_explorer_web=true; fi

# CLI, Explorer API, and network artifacts form one exact runtime-integration
# bundle. If any member changes, rebuild the three producers so the current
# commit can still run the exact full-stack contract instead of silently
# falling back to an older known-good artifact set.
if [ "$CLI" = "true" ] || [ "$EXPLORER_BACKEND" = "true" ] || [ "$CORE" = "true" ] || [ "$PACKAGING" = "true" ]; then
  run_cli=true
  run_explorer_backend=true
  run_network=true
fi

# Shared chain/runtime changes are also client-contract changes, so keep the
# external SDK validation lanes on core changes even when UI image rebuilds are
# scoped out of pull requests.
if [ "$CORE" = "true" ]; then
  run_sdk_non_rust=true
  run_sdk_rust=true
fi

# Main core releases also rebuild deployable UI image surfaces for release
# compatibility. Pull requests keep those UI image rebuilds scoped out.
if [ "$GITHUB_EVENT_NAME" != "pull_request" ] && [ "$CORE" = "true" ]; then
  run_admin=true
  run_explorer_web=true
fi

# CI orchestration changes prove the complete graph because the workflow/action
# implementation itself may affect any lane.
if [ "$CI_PIPELINE" = "true" ]; then
  run_admin=true
  run_cli=true
  run_explorer_backend=true
  run_explorer_web=true
  run_network=true
  run_sdk_non_rust=true
  run_sdk_rust=true
fi

if [ "$SDK_JS" = "true" ] || [ "$SDK_NODE" = "true" ] || [ "$SDK_PYTHON" = "true" ]; then
  run_sdk_non_rust=true
fi
if [ "$SDK_RUST" = "true" ]; then
  run_sdk_rust=true
fi

# Deployment intent is deliberately narrower than validation intent.
# Packaging/core/CI changes may validate or rebuild many images, but they do not
# automatically redeploy unrelated Coolify resources.
if [ "$EXPLORER_BACKEND" = "true" ] || [ "$COOLIFY_EXPLORER_API" = "true" ]; then
  deploy_explorer_api=true
fi
if [ "$EXPLORER_WEB" = "true" ] || [ "$COOLIFY_EXPLORER_UI" = "true" ]; then
  deploy_explorer_ui=true
fi
if [ "$ADMIN" = "true" ] || [ "$COOLIFY_OPERATIONS_WEB" = "true" ]; then
  deploy_operations_web=true
fi

# Stateful chain lifecycle resources are intentionally never auto-deployed by
# the release workflow. This output exists so release logs can call out when
# an intentional operator promotion may be required.
if [ "$CORE" = "true" ] || [ "$COOLIFY_BOOTSTRAP" = "true" ] || [ "$COOLIFY_FAUCET_TOOLS" = "true" ] || [ "$COOLIFY_VALIDATOR" = "true" ]; then
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
  echo "run_ci_contract=$run_ci_contract"
  echo "deploy_explorer_api=$deploy_explorer_api"
  echo "deploy_explorer_ui=$deploy_explorer_ui"
  echo "deploy_operations_web=$deploy_operations_web"
  echo "stateful_coolify_release=$stateful_coolify_release"
} >> "$GITHUB_OUTPUT"

printf 'DAG selection: admin=%s cli=%s backend=%s web=%s network=%s sdk-non-rust=%s sdk-rust=%s ci-contract=%s deploy(api=%s,ui=%s,ops=%s) stateful-manual=%s\n' \
  "$run_admin" "$run_cli" "$run_explorer_backend" "$run_explorer_web" \
  "$run_network" "$run_sdk_non_rust" "$run_sdk_rust" "$run_ci_contract" \
  "$deploy_explorer_api" "$deploy_explorer_ui" "$deploy_operations_web" "$stateful_coolify_release"
