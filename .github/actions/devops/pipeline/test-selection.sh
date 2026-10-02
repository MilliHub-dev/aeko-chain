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
  local web_workflow="$PIPELINE_DIR/../../../workflows/devops-web-ui.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local sdk_workflow="$PIPELINE_DIR/../../../workflows/devops-sdk-validation.yml"
  local setup_action="$PIPELINE_DIR/setup/action.yml"

  for deprecated in "actions/checkout@v4" "actions/setup-node@v4" "actions/setup-python@v5" "docker/login-action@v3" "docker/setup-buildx-action@v3"; do
    if grep -Fq "$deprecated" "$workflow" "$web_workflow" "$runtime_workflow" "$sdk_workflow" "$setup_action"; then
      echo "Deprecated action major remains in the active DevOps pipeline: $deprecated" >&2
      exit 1
    fi
  done

  grep -Fq "actions/checkout@v5" "$workflow"
  grep -Fq "actions/setup-node@v5" "$setup_action"
  grep -Fq "actions/setup-python@v6" "$setup_action"
  grep -Fq "docker/setup-buildx-action@v4" "$setup_action"
  grep -Fq "docker/login-action@v4" "$workflow"

  if grep -Fq "docker/login-action" "$web_workflow" "$runtime_workflow"; then
    echo "Producer workflows must not authenticate to Docker Hub before aggregate gates pass." >&2
    exit 1
  fi
  [ "$(grep -Fc "docker/login-action@v4" "$workflow")" -eq 1 ]

  echo "[ok] active DevOps actions use current majors and Docker Hub auth is centralized"
}

assert_targeted_docker_publication_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local web_workflow="$PIPELINE_DIR/../../../workflows/devops-web-ui.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local release_mode="$PIPELINE_DIR/resolve-release.sh"
  local publisher="$PIPELINE_DIR/publish-runtime-images.sh"

  for output in publish_admin publish_cli publish_explorer_backend publish_explorer_web publish_network; do
    grep -Fq "$output:" "$workflow"
    grep -Fq "echo \"$output=" "$release_mode"
  done

  if grep -Fq "docker/login-action" "$web_workflow" "$runtime_workflow"; then
    echo "Producer workflows must never log in to Docker Hub." >&2
    exit 1
  fi
  [ "$(grep -Fc "docker/login-action@v4" "$workflow")" -eq 1 ]
  grep -Fq 'Publish validated immutable Docker images' "$workflow"
  grep -Fq 'publish-runtime-images.sh' "$workflow"
  grep -Fq 'PUBLISH_NETWORK' "$publisher"
  grep -Fq 'push_image aeko-validator aeko-validator aeko-node' "$publisher"
  grep -Fq 'push_image aeko-explorer-api aeko-explorer-api aeko-explorer-backend' "$publisher"

  echo "[ok] Docker publication is post-gate, selective, and owns one registry login"
}

assert_bounded_runner_setup_contract() {
  local setup_action="$PIPELINE_DIR/setup/action.yml"
  grep -Fq "timeout --kill-after=10s 90s" "$setup_action"
  grep -Fq "Acquire::Retries=2" "$setup_action"
  grep -Fq "apt-get failed after 3 bounded attempts" "$setup_action"
  grep -Fq "Verify shared Rust cache or fall back to direct rustc" "$setup_action"
  grep -Fq 'timeout 20s sccache --start-server' "$setup_action"
  grep -Fq 'RUSTC_WRAPPER=' "$setup_action"
  grep -Fq 'SCCACHE_GHA_ENABLED=false' "$setup_action"
  echo "[ok] package setup is bounded and cache outages fail open to direct rustc"
}

assert_resilient_sccache_contract() {
  local setup_action="$PIPELINE_DIR/setup/action.yml"
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local sdk_workflow="$PIPELINE_DIR/../../../workflows/devops-sdk-validation.yml"
  local cli_release="$PIPELINE_DIR/../../../workflows/cli-release.yml"

  grep -Fq 'name: Configure resilient Rust compiler cache' "$setup_action"
  grep -Fq 'continue-on-error: true' "$setup_action"
  grep -Fq 'SCCACHE_GHA_ENABLED: "false"' "$setup_action"
  grep -Fq 'SCCACHE_DIR=$cache_dir' "$setup_action"
  grep -Fq 'SCCACHE_CACHE_SIZE=4G' "$setup_action"
  grep -Fq 'continuing with direct rustc instead of failing the job' "$setup_action"

  for file in "$workflow" "$runtime_workflow" "$sdk_workflow" "$cli_release"; do
    if grep -Fq 'SCCACHE_GHA_ENABLED: "true"' "$file"; then
      echo "Required AEKO DevOps jobs must not depend on the quota-limited GitHub sccache backend: $file" >&2
      exit 1
    fi
  done

  echo "[ok] required Rust jobs treat compiler caching as optional and local"
}

assert_full_validation_workflow_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local web_workflow="$PIPELINE_DIR/../../../workflows/devops-web-ui.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local sdk_workflow="$PIPELINE_DIR/../../../workflows/devops-sdk-validation.yml"

  for selector in validate_admin: build_admin: validate_explorer_web: build_explorer_web:; do
    grep -Fq "$selector" "$web_workflow"
  done
  for selector in validate_explorer_backend: build_explorer_backend: validate_network: build_network:; do
    grep -Fq "$selector" "$runtime_workflow"
  done

  grep -Fq 'name: Explorer API / Quality' "$runtime_workflow"
  grep -Fq 'name: Explorer API / Image' "$runtime_workflow"
  grep -Fq 'name: Blockchain network / Quality' "$runtime_workflow"
  grep -Fq 'name: Blockchain network / Images' "$runtime_workflow"
  grep -Fq 'validate-source: "true"' "$runtime_workflow"
  grep -Fq 'validate-source: "false"' "$runtime_workflow"
  grep -Fq 'build-image: "true"' "$runtime_workflow"
  grep -Fq 'build-image: "false"' "$runtime_workflow"

  grep -Fq 'name: Runtime / Tools producer' "$workflow"
  grep -Fq 'build_tools:' "$workflow"
  grep -Fq 'build_explorer_backend:' "$workflow"
  grep -Fq 'build_network:' "$workflow"
  grep -Fq 'run_runtime_contract:' "$workflow"
  grep -Fq 'runtime_contract_mode:' "$workflow"

  for selector in \
    'js: ${{ inputs.run_sdk_non_rust }}' \
    'node: ${{ inputs.run_sdk_non_rust }}' \
    'python: ${{ inputs.run_sdk_non_rust }}' \
    'rust: "true"'; do
    grep -Fq "$selector" "$sdk_workflow"
  done

  echo "[ok] source validation, image production, and runtime gating are independently selectable"
}

assert_smart_contract_pipeline_separation() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local contract_workflow="$PIPELINE_DIR/../../../workflows/smart-contracts.yml"
  local classifier="$PIPELINE_DIR/../detect-changes/action.yml"
  local network_run="$PIPELINE_DIR/../network/run.sh"
  local network_integration="$PIPELINE_DIR/../../../../scripts/ci-protocol-stack-integration.sh"
  local contract_run="$PIPELINE_DIR/../smart-contracts/run.sh"
  local smoke="$PIPELINE_DIR/../../../../scripts/smoke-hello-program.py"

  grep -Fq 'smart_contracts:' "$classifier"
  grep -Fq 'contracts/*|scripts/smoke-hello-program.py)' "$classifier"
  grep -Fq 'smart_contracts=true' "$classifier"
  if grep -Fq 'Smart contracts (SBF → AEKO SVM)' "$workflow"; then
    echo "AEKO DevOps must not own the non-blocking smart-contract job." >&2
    exit 1
  fi
  grep -Fq 'AEKO Smart Contracts (non-blocking)' "$contract_workflow"
  grep -Fq 'continue-on-error: true' "$contract_workflow"
  grep -Fq 'live-testnet:' "$contract_workflow"
  grep -Fq -- '- "contracts/**"' "$workflow"
  grep -Fq -- '- "scripts/smoke-hello-program.py"' "$workflow"
  grep -Fq -- '- ".github/actions/devops/smart-contracts/**"' "$workflow"
  grep -Fq -- '- ".github/workflows/smart-contracts.yml"' "$workflow"

  if grep -Fq 'contracts/hello-aeko-program' "$network_run"; then
    echo "Blockchain network action still owns deployable smart-contract build logic." >&2
    exit 1
  fi
  if grep -Fq 'smoke-hello-program.py' "$network_run"; then
    echo "Blockchain network action still owns smart-contract deploy/invoke logic." >&2
    exit 1
  fi
  if grep -Eq 'contracts/hello-aeko-program|cargo-build-sbf|smoke-hello-program.py' "$network_integration"; then
    echo "Blockchain protocol integration still contains deployable smart-contract responsibilities." >&2
    exit 1
  fi

  grep -Fq 'cargo-build-sbf' "$contract_run"
  if grep -Fq 'aeko-test-validator' "$contract_run"; then
    echo "Smart-contract runner must not build a local Validator/network runtime." >&2
    exit 1
  fi
  grep -Fq 'https://rpc.aeko.online' "$contract_run"
  grep -Fq 'https://api.aeko.online' "$contract_run"
  grep -Fq '/funding/airdrop' "$contract_run"
  grep -Fq 'aeko-keygen new' "$contract_run"
  grep -Fq 'smoke-hello-program.py' "$contract_run"
  grep -Fq '"program",' "$smoke"
  grep -Fq '"deploy",' "$smoke"

  echo "[ok] deployable SBF contracts run in a standalone non-blocking live Testnet workflow"
}

assert_vercel_git_deployments_disabled() {
  local config="$PIPELINE_DIR/../../../../vercel.json"

  jq -e '.git.deploymentEnabled == false' "$config" >/dev/null
  echo "[ok] Vercel Git auto-deployments are disabled"
}


assert_cli_release_after_main_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/cli-release.yml"
  local devops_workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local classifier="$PIPELINE_DIR/../detect-changes/action.yml"
  local root_readme="$PIPELINE_DIR/../../../../README.md"

  grep -Fq 'workflow_dispatch:' "$workflow"
  grep -Fq 'tags:' "$workflow"
  grep -Fq -- '- "v*"' "$workflow"
  if grep -Fq 'pull_request:' "$workflow" || grep -Fq 'workflow_run:' "$workflow"; then
    echo "Standalone CLI release workflow must not rebuild automatic PR/main binaries." >&2
    exit 1
  fi

  grep -Fq 'cli_windows_release:' "$devops_workflow"
  grep -Fq 'name: Release / Windows CLI (non-blocking)' "$devops_workflow"
  grep -Fq 'continue-on-error: true' "$devops_workflow"
  grep -Fq 'needs: cli' "$devops_workflow"
  grep -Fq 'Build CLI and keygen for Windows' "$devops_workflow"
  grep -Fq "irm 'http://127.0.0.1:18766/mock/aeko-cli-install.ps1' | iex" "$devops_workflow"
  grep -Fq 'powershell.exe -NoLogo -NoProfile -NonInteractive' "$devops_workflow"

  grep -Fq 'Exercise Linux CLI update check and installer from tools image' "$devops_workflow"
  grep -Fq 'aeko-runtime-tools/cli-release' "$devops_workflow"
  grep -Fq 'AEKO_CLI_ASSET_BASE_URL=http://127.0.0.1:18765' "$devops_workflow"

  grep -Fq 'cli_release_publish:' "$devops_workflow"
  grep -Fq 'name: Publish / CLI binaries (best effort)' "$devops_workflow"
  grep -Fq "github.event_name == 'push'" "$devops_workflow"
  grep -Fq "github.ref == 'refs/heads/main'" "$devops_workflow"
  grep -Fq "needs.devops.result == 'success'" "$devops_workflow"
  grep -Fq "needs.cli_windows_release.outputs.ready == 'true'" "$devops_workflow"
  grep -Fq 'name: aeko-runtime-tools' "$devops_workflow"
  grep -Fq 'name: cli-x86_64-pc-windows-msvc' "$devops_workflow"
  grep -Fq 'TAG="cli-main-${short_sha}"' "$devops_workflow"
  grep -Fq -- '--target "$SOURCE_SHA"' "$devops_workflow"
  grep -Fq 'git ls-remote --exit-code --tags origin "refs/tags/$TAG"' "$devops_workflow"
  grep -Fq -- '--latest' "$devops_workflow"

  grep -Fq 'commit="$(git rev-parse HEAD)"' "$workflow"
  grep -Fq 'ci-source-sha.txt' "$workflow"
  grep -Fq 'install/aeko-cli-install.sh|install/aeko-cli-install.ps1)' "$classifier"
  grep -Fq 'install/aeko-cli-install.sh | sh' "$root_readme"
  grep -Fq 'install/aeko-cli-install.ps1 | iex' "$root_readme"

  echo "[ok] DevOps reuses Linux tools binaries, preserves non-blocking Windows validation, and publishes traceable main CLI releases"
}

run_plan_case() {
  local label="$1" expected_lines="$2"
  shift 2
  local output
  output="$(mktemp)"
  env GITHUB_OUTPUT="$output" "$@" bash "$PIPELINE_DIR/plan.sh"
  while IFS= read -r expected; do
    [ -n "$expected" ] || continue
    assert_output "$output" "$expected"
  done <<<"$expected_lines"
  rm -f "$output"
  echo "[ok] $label"
}

run_release_case() {
  local label="$1" expected_lines="$2"
  shift 2
  local output
  output="$(mktemp)"
  env GITHUB_OUTPUT="$output" GITHUB_SHA="1234567890abcdef1234567890abcdef12345678" "$@" bash "$PIPELINE_DIR/resolve-release.sh"
  while IFS= read -r expected; do
    [ -n "$expected" ] || continue
    assert_output "$output" "$expected"
  done <<<"$expected_lines"
  assert_output "$output" "sha_tag=1234567890ab"
  rm -f "$output"
  echo "[ok] $label"
}

run_deploy_plan_case() {
  local label="$1"
  local admin="$2"
  local core="$3"
  local explorer_backend="$4"
  local explorer_web="$5"
  local coolify_bootstrap="$6"
  local coolify_faucet_tools="$7"
  local coolify_validator="$8"
  local coolify_explorer_api="$9"
  local coolify_explorer_ui="${10}"
  local coolify_operations_web="${11}"
  local expected_api="${12}"
  local expected_ui="${13}"
  local expected_ops="${14}"
  local expected_stateful="${15}"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" GITHUB_EVENT_NAME=push \
  ADMIN="$admin" CLI=false CORE="$core" PACKAGING=false \
  EXPLORER_BACKEND="$explorer_backend" EXPLORER_WEB="$explorer_web" \
  COOLIFY_BOOTSTRAP="$coolify_bootstrap" \
  COOLIFY_FAUCET_TOOLS="$coolify_faucet_tools" \
  COOLIFY_VALIDATOR="$coolify_validator" \
  COOLIFY_EXPLORER_API="$coolify_explorer_api" \
  COOLIFY_EXPLORER_UI="$coolify_explorer_ui" \
  COOLIFY_OPERATIONS_WEB="$coolify_operations_web" \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false \
  CI_PIPELINE=false bash "$PIPELINE_DIR/plan.sh"

  assert_output "$output" "deploy_explorer_api=$expected_api"
  assert_output "$output" "deploy_explorer_ui=$expected_ui"
  assert_output "$output" "deploy_operations_web=$expected_ops"
  assert_output "$output" "stateful_coolify_release=$expected_stateful"

  rm -f "$output"
  echo "[ok] $label"
}

test_split_deploy_trigger() {
  local fake_dir log fake_curl
  fake_dir="$(mktemp -d)"
  log="$fake_dir/curl.log"
  fake_curl="$fake_dir/curl"

  cat > "$fake_curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COOLIFY_TEST_CURL_LOG"
EOF
  chmod +x "$fake_curl"

  COOLIFY_TEST_CURL_LOG="$log" CURL_BIN="$fake_curl" \
  DEPLOY_EXPLORER_API=true \
  DEPLOY_EXPLORER_UI=false \
  DEPLOY_OPERATIONS_WEB=true \
  STATEFUL_COOLIFY_RELEASE=true \
  COOLIFY_EXPLORER_API_WEBHOOK_URL=https://api.coolify.invalid/deploy/api \
  COOLIFY_EXPLORER_API_WEBHOOK_API_KEY=api-token \
  COOLIFY_EXPLORER_UI_WEBHOOK_URL=https://ui.coolify.invalid/deploy/ui \
  COOLIFY_EXPLORER_UI_WEBHOOK_API_KEY=ui-token \
  COOLIFY_OPERATIONS_WEB_WEBHOOK_URL=https://ops.coolify.invalid/deploy/ops \
  COOLIFY_OPERATIONS_WEB_WEBHOOK_API_KEY=ops-token \
    bash "$PIPELINE_DIR/deploy-coolify-split.sh"

  grep -Fq "https://api.coolify.invalid/deploy/api" "$log"
  grep -Fq "Authorization: Bearer api-token" "$log"
  grep -Fq "https://ops.coolify.invalid/deploy/ops" "$log"
  grep -Fq "Authorization: Bearer ops-token" "$log"
  if grep -Fq "https://ui.coolify.invalid/deploy/ui" "$log"; then
    echo "Disabled Explorer UI deployment unexpectedly called curl." >&2
    exit 1
  fi

  if COOLIFY_TEST_CURL_LOG="$log" CURL_BIN="$fake_curl" \
    DEPLOY_EXPLORER_API=true \
    COOLIFY_EXPLORER_API_WEBHOOK_URL= \
    COOLIFY_EXPLORER_API_WEBHOOK_API_KEY= \
      bash "$PIPELINE_DIR/deploy-coolify-split.sh"; then
    echo "Split deployment unexpectedly accepted missing selected-resource credentials." >&2
    exit 1
  fi

  rm -rf "$fake_dir"
  echo "[ok] split Coolify deployment triggers only selected resources and fails closed on missing credentials"
}

assert_split_coolify_workflow_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local classifier="$PIPELINE_DIR/../detect-changes/action.yml"

  for path in \
    "docker/coolify/bootstrap/*" \
    "docker/coolify/faucet-tools/*" \
    "docker/coolify/validator/*" \
    "apps/explorer/backend/compose.coolify.yml|apps/explorer/backend/.env.coolify.example)" \
    "apps/explorer/web/compose.coolify.yml|apps/explorer/web/.env.coolify.example)" \
    "apps/admin/compose.coolify.yml|apps/admin/.env.coolify.example)"; do
    grep -Fq "$path" "$classifier"
  done

  grep -Fq "COOLIFY_DEPLOYMENT_MODE" "$workflow"
  grep -Fq "deploy-coolify-split.sh" "$workflow"
  grep -Fq "COOLIFY_EXPLORER_API_WEBHOOK_URL" "$workflow"
  grep -Fq "COOLIFY_EXPLORER_UI_WEBHOOK_URL" "$workflow"
  grep -Fq "COOLIFY_OPERATIONS_WEB_WEBHOOK_URL" "$workflow"

  if grep -Eq 'COOLIFY_(VALIDATOR|BOOTSTRAP|FAUCET_TOOLS)_WEBHOOK_URL' "$workflow"; then
    echo "Stateful Coolify resource gained an automatic deploy webhook." >&2
    exit 1
  fi

  echo "[ok] split Coolify workflow keeps stateful resources manual and app hooks independent"
}

assert_runtime_artifact_handoff_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local integration="$PIPELINE_DIR/../../../workflows/full-stack-integration.yml"
  local artifact_loader="$PIPELINE_DIR/load-runtime-artifacts.sh"
  local runtime_script="$PIPELINE_DIR/../../../../scripts/ci-docker-full-stack-integration.sh"

  if [ "$(grep -Ec '^  runtime_contract:$' "$workflow")" -ne 1 ]; then
    echo "DevOps must define exactly one runtime_contract job." >&2
    exit 1
  fi
  if grep -Eq '^  runtime_integration:$' "$workflow"; then
    echo "Legacy duplicate runtime_integration job must not coexist with runtime_contract." >&2
    exit 1
  fi
  if grep -Fq 'gh workflow run full-stack-integration.yml' "$workflow"; then
    echo "Runtime contract must gate release synchronously, never dispatch fire-and-forget integration." >&2
    exit 1
  fi

  local runtime_block
  runtime_block="$(sed -n '/^  runtime_contract:/,/^  cli_release_publish:/p' "$workflow")"
  grep -Fq 'uses: ./.github/workflows/full-stack-integration.yml' <<<"$runtime_block"
  grep -Eq '^[[:space:]]*-[[:space:]]+classify$' <<<"$runtime_block"
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_tools$' <<<"$runtime_block"
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_services$' <<<"$runtime_block"
  grep -Fq 'selection_mode: ${{ needs.classify.outputs.runtime_contract_mode }}' <<<"$runtime_block"
  grep -Fq 'use_current_tools: ${{ needs.classify.outputs.build_tools == '\''true'\'' }}' <<<"$runtime_block"
  grep -Fq 'use_current_network: ${{ needs.classify.outputs.build_network == '\''true'\'' }}' <<<"$runtime_block"
  grep -Fq 'use_current_explorer_api: ${{ needs.classify.outputs.build_explorer_backend == '\''true'\'' }}' <<<"$runtime_block"

  grep -Fq 'workflow_call:' "$integration"
  grep -Fq -- '- overlay' "$integration"
  grep -Fq 'tools_run_id:' "$integration"
  grep -Fq 'network_run_id:' "$integration"
  grep -Fq 'explorer_run_id:' "$integration"
  grep -Fq 'EXPECTED_TOOLS_SHA' "$integration"
  grep -Fq 'EXPECTED_NETWORK_SHA' "$integration"
  grep -Fq 'EXPECTED_EXPLORER_SHA' "$integration"

  grep -Fq 'RUNTIME_TAG_SHA' "$artifact_loader"
  grep -Fq 'docker tag "$source" "$target"' "$artifact_loader"
  bash -n "$artifact_loader"

  if grep -Fq "docker/login-action" "$integration"; then
    echo "Runtime integration must not depend on Docker Hub credentials." >&2
    exit 1
  fi
  if grep -Fq "docker pull" "$runtime_script"; then
    echo "Runtime integration must consume preloaded artifacts, not Docker Hub." >&2
    exit 1
  fi

  echo "[ok] exactly one synchronous runtime gate owns exact, overlay, and known-good integration"
}

assert_grouped_devops_workflow_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"

  grep -Fq 'name: Explorer / UI' "$workflow"
  grep -Fq 'name: Runtime / Tools producer' "$workflow"
  grep -Fq 'name: Runtime / Producers' "$workflow"
  grep -Fq 'name: Integration / Runtime contract' "$workflow"
  grep -Fq 'name: Explorer API / Quality' "$runtime_workflow"
  grep -Fq 'name: Explorer API / Image' "$runtime_workflow"
  grep -Fq 'name: Blockchain network / Quality' "$runtime_workflow"
  grep -Fq 'name: Blockchain network / Images' "$runtime_workflow"

  local gate_block
  gate_block="$(sed -n '/^  devops:/,/^  runtime_contract:/p' "$workflow")"
  for required in ci_contract web_ui cli runtime_tools cli_linux_release runtime_services sdk_validation; do
    grep -Eq "^[[:space:]]*-[[:space:]]+$required$" <<<"$gate_block"
  done

  local runtime_block
  runtime_block="$(sed -n '/^  runtime_contract:/,/^  cli_release_publish:/p' "$workflow")"
  grep -Fq 'uses: ./.github/workflows/full-stack-integration.yml' <<<"$runtime_block"

  local cli_publish_block
  cli_publish_block="$(sed -n '/^  cli_release_publish:/,/^  sdk_publish:/p' "$workflow")"
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_contract$' <<<"$cli_publish_block"
  grep -Fq 'needs.runtime_contract.result' <<<"$cli_publish_block"

  local sdk_publish_block
  sdk_publish_block="$(sed -n '/^  sdk_publish:/,/^  release:/p' "$workflow")"
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_contract$' <<<"$sdk_publish_block"
  grep -Fq 'needs.runtime_contract.result' <<<"$sdk_publish_block"

  local release_block
  release_block="$(sed -n '/^  release:/,$p' "$workflow")"
  grep -Fq 'publish-runtime-images.sh' <<<"$release_block"
  grep -Fq 'needs.runtime_contract.result' <<<"$release_block"
  [ "$(grep -Fc 'docker/login-action@v4' <<<"$release_block")" -eq 1 ]

  echo "[ok] validation, runtime integration, and publication form one dependency chain"
}
assert_grouped_devops_workflow_contract
assert_node24_action_majors
assert_targeted_docker_publication_contract
assert_bounded_runner_setup_contract
assert_resilient_sccache_contract
assert_runtime_artifact_handoff_contract
assert_split_coolify_workflow_contract
assert_full_validation_workflow_contract
assert_smart_contract_pipeline_separation
assert_vercel_git_deployments_disabled
assert_cli_release_after_main_contract

run_plan_case "Explorer Web-only change stays scoped and skips runtime integration" \
  $'run_explorer_web=true\nbuild_explorer_web=true\nrun_cli=false\nrun_explorer_backend=false\nrun_network=false\nrun_runtime_contract=false\nruntime_contract_mode=last-success' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=true \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "SDK JS-only change stays scoped and skips runtime integration" \
  $'run_sdk_non_rust=true\nrun_sdk_rust=false\nrun_cli=false\nrun_explorer_backend=false\nrun_network=false\nrun_runtime_contract=false' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=true SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "Explorer backend change builds only Explorer API and overlays known-good runtime" \
  $'run_cli=false\nrun_explorer_backend=true\nrun_network=false\nbuild_tools=false\nbuild_explorer_backend=true\nbuild_network=false\nrun_runtime_contract=true\nruntime_contract_mode=overlay' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=true EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "CLI change builds only tools and overlays known-good runtime" \
  $'run_cli=true\nrun_explorer_backend=false\nrun_network=false\nbuild_tools=true\nbuild_explorer_backend=false\nbuild_network=false\nrun_runtime_contract=true\nruntime_contract_mode=overlay' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=true CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "Core change rebuilds the complete coupled runtime exactly" \
  $'run_cli=true\nrun_explorer_backend=true\nrun_network=true\nbuild_tools=true\nbuild_explorer_backend=true\nbuild_network=true\nrun_runtime_contract=true\nruntime_contract_mode=exact' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=true PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "Packaging change rebuilds images without inventing source-validation ownership" \
  $'run_admin=false\nrun_cli=false\nrun_explorer_backend=false\nrun_explorer_web=false\nrun_network=false\nbuild_admin=true\nbuild_tools=true\nbuild_explorer_backend=true\nbuild_explorer_web=true\nbuild_network=true\nrun_runtime_contract=true\nruntime_contract_mode=exact' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=false PACKAGING=true EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=false

run_plan_case "CI-only pull request validates orchestration with known-good artifacts only" \
  $'run_admin=false\nrun_cli=false\nrun_explorer_backend=false\nrun_explorer_web=false\nrun_network=false\nrun_sdk_non_rust=false\nrun_sdk_rust=false\nbuild_tools=false\nbuild_explorer_backend=false\nbuild_network=false\nrun_runtime_contract=true\nruntime_contract_mode=last-success' \
  GITHUB_EVENT_NAME=pull_request ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=true

run_plan_case "CI-only main push validates orchestration with known-good artifacts only" \
  $'run_admin=false\nrun_cli=false\nrun_explorer_backend=false\nrun_explorer_web=false\nrun_network=false\nrun_sdk_non_rust=false\nrun_sdk_rust=false\nbuild_tools=false\nbuild_explorer_backend=false\nbuild_network=false\nrun_runtime_contract=true\nruntime_contract_mode=last-success' \
  GITHUB_EVENT_NAME=push ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false CI_PIPELINE=true

run_deploy_plan_case "Explorer backend source deploys only Explorer API" \
  false false true false false false false false false false \
  true false false false
run_deploy_plan_case "Explorer UI source deploys only Explorer UI" \
  false false false true false false false false false false \
  false true false false
run_deploy_plan_case "Admin source deploys only Operations Web" \
  true false false false false false false false false false \
  false false true false
run_deploy_plan_case "Split Explorer API Compose change deploys only Explorer API" \
  false false false false false false false true false false \
  true false false false
run_deploy_plan_case "Stateful Coolify config remains manual" \
  false false false false true true true false false false \
  false false false true

test_split_deploy_trigger

run_release_case "CI-only main push publishes no Docker images" \
  $'publish=false\npublish_admin=false\npublish_cli=false\npublish_explorer_backend=false\npublish_explorer_web=false\npublish_network=false' \
  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main DOCKERIZED=false CI_PIPELINE=true \
  ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false

run_release_case "Explorer backend main push publishes only Explorer API aliases" \
  $'publish=true\npublish_admin=false\npublish_cli=false\npublish_explorer_backend=true\npublish_explorer_web=false\npublish_network=false' \
  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main DOCKERIZED=true \
  ADMIN=false CLI=false CORE=false PACKAGING=false EXPLORER_BACKEND=true EXPLORER_WEB=false

run_release_case "Core main push publishes core-backed runtime images" \
  $'publish=true\npublish_admin=false\npublish_cli=true\npublish_explorer_backend=true\npublish_explorer_web=false\npublish_network=true' \
  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main DOCKERIZED=true \
  ADMIN=false CLI=false CORE=true PACKAGING=false EXPLORER_BACKEND=false EXPLORER_WEB=false

run_release_case "Packaging main push publishes every image target" \
  $'publish=true\npublish_admin=true\npublish_cli=true\npublish_explorer_backend=true\npublish_explorer_web=true\npublish_network=true' \
  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main DOCKERIZED=true \
  ADMIN=false CLI=false CORE=false PACKAGING=true EXPLORER_BACKEND=false EXPLORER_WEB=false

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
