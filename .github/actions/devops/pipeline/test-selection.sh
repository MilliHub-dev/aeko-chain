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

  for deprecated in \
    "actions/checkout@v4" \
    "actions/setup-node@v4" \
    "actions/setup-python@v5" \
    "docker/login-action@v3" \
    "docker/setup-buildx-action@v3"; do
    if grep -Fq "$deprecated" "$workflow" "$web_workflow" "$runtime_workflow" "$sdk_workflow" "$setup_action"; then
      echo "Deprecated Node-20 action major remains in the active DevOps pipeline: $deprecated" >&2
      exit 1
    fi
  done

  grep -Fq "actions/checkout@v5" "$workflow"
  grep -Fq "actions/checkout@v5" "$web_workflow"
  grep -Fq "actions/checkout@v5" "$runtime_workflow"
  grep -Fq "actions/checkout@v5" "$sdk_workflow"
  grep -Fq "actions/setup-node@v5" "$setup_action"
  grep -Fq "actions/setup-python@v6" "$setup_action"
  grep -Fq "docker/login-action@v4" "$workflow"
  grep -Fq "docker/login-action@v4" "$web_workflow"
  grep -Fq "docker/login-action@v4" "$runtime_workflow"
  grep -Fq "docker/setup-buildx-action@v4" "$setup_action"

  echo "[ok] active DevOps third-party actions use Node-24-backed majors"
}

assert_full_validation_workflow_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local web_workflow="$PIPELINE_DIR/../../../workflows/devops-web-ui.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local sdk_workflow="$PIPELINE_DIR/../../../workflows/devops-sdk-validation.yml"

  for selector in \
    'node: ${{ inputs.run_admin }}' \
    'validate-source: ${{ inputs.run_admin }}' \
    'node: ${{ inputs.run_explorer_web }}' \
    'validate-source: ${{ inputs.run_explorer_web }}'; do
    grep -Fq "$selector" "$web_workflow"
  done

  for selector in \
    'rust: ${{ inputs.run_explorer_backend }}' \
    'validate-source: ${{ inputs.run_explorer_backend }}' \
    'run-preflight: ${{ inputs.run_network }}' \
    'validate-source: ${{ inputs.run_network }}'; do
    grep -Fq "$selector" "$runtime_workflow"
  done

  grep -Fq 'name: Quality / CLI source' "$workflow"
  grep -Fq 'name: Runtime / Tools producer' "$workflow"
  grep -Fq 'name: Integration / Known-good baseline dispatch' "$workflow"
  grep -Fq -- '-f "selection_mode=last-success"' "$workflow"
  grep -Fq -- '-f "selection_mode=exact"' "$workflow"
  grep -Fq 'validate-source: "true"' "$workflow"
  grep -Fq 'validate-source: "false"' "$workflow"
  grep -Fq 'build-image: "true"' "$workflow"

  for selector in \
    'js: ${{ inputs.run_sdk_non_rust }}' \
    'node: ${{ inputs.run_sdk_non_rust }}' \
    'python: ${{ inputs.run_sdk_non_rust }}' \
    'rust: "true"'; do
    grep -Fq "$selector" "$sdk_workflow"
  done

  echo "[ok] every AEKO DevOps lane performs full validation when selected"
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
  local label="$1" event_name="$2" ci_pipeline="$3" core="$4" expected_all="$5" explorer_web="${6:-false}"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" GITHUB_EVENT_NAME="$event_name" \
  ADMIN=false CLI=false CORE="$core" PACKAGING=false \
  EXPLORER_BACKEND=false EXPLORER_WEB="$explorer_web" \
  SDK_JS=false SDK_NODE=false SDK_PYTHON=false SDK_RUST=false \
  CI_PIPELINE="$ci_pipeline" bash "$PIPELINE_DIR/plan.sh"

  if [ "$expected_all" = "true" ]; then
    assert_output "$output" "run_admin=true"
    assert_output "$output" "run_cli=true"
    assert_output "$output" "run_explorer_backend=true"
    assert_output "$output" "run_explorer_web=true"
    assert_output "$output" "run_network=true"
    assert_output "$output" "run_sdk_non_rust=true"
    assert_output "$output" "run_sdk_rust=true"
  fi

  assert_output "$output" "run_ci_contract=true"

  rm -f "$output"
  echo "[ok] $label"
}

run_release_case() {
  local label="$1" event_name="$2" ref="$3" dockerized="$4" ci_pipeline="$5"
  local internal_pr="$6" expected_publish="$7" expected_runtime_push="$8"
  local output
  output="$(mktemp)"

  GITHUB_OUTPUT="$output" GITHUB_EVENT_NAME="$event_name" GITHUB_REF="$ref" \
  GITHUB_SHA="1234567890abcdef1234567890abcdef12345678" \
  DOCKERIZED="$dockerized" CI_PIPELINE="$ci_pipeline" INTERNAL_PR="$internal_pr" \
    bash "$PIPELINE_DIR/resolve-release.sh"

  assert_output "$output" "publish=$expected_publish"
  assert_output "$output" "push_runtime_images=$expected_runtime_push"
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
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local integration="$PIPELINE_DIR/../../../workflows/full-stack-integration.yml"
  local release_mode="$PIPELINE_DIR/resolve-release.sh"
  local runtime_script="$PIPELINE_DIR/../../../../scripts/ci-docker-full-stack-integration.sh"

  grep -Fq "name: aeko-runtime-tools" "$workflow"
  grep -Fq "name: aeko-runtime-network" "$runtime_workflow"
  grep -Fq "name: aeko-runtime-explorer-api" "$runtime_workflow"
  for artifact in \
    "aeko-runtime-tools" \
    "aeko-runtime-network" \
    "aeko-runtime-explorer-api"; do
    grep -Fq "name: $artifact" "$integration"
  done

  grep -Fq "runtime_integration:" "$workflow"
  grep -Fq "needs.runtime_tools.result == 'success'" "$workflow"
  grep -Fq "needs.runtime_services.result == 'success'" "$workflow"
  local runtime_block
  runtime_block="$(sed -n '/^  runtime_integration:/,/^  cli_release_publish:/p' "$workflow")"
  for forbidden in devops web_ui sdk_validation explorer_backend network cli cli_linux_release; do
    if grep -Eq "^[[:space:]]*-[[:space:]]+${forbidden}$" <<<"$runtime_block"; then
      echo "Runtime integration has an unnecessary dependency edge: $forbidden" >&2
      exit 1
    fi
  done
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_tools$' <<<"$runtime_block"
  grep -Eq '^[[:space:]]*-[[:space:]]+runtime_services$' <<<"$runtime_block"
  grep -Fq "gh workflow run full-stack-integration.yml" "$workflow"
  grep -Fq "producer_run_id" "$workflow"
  grep -Fq "producer_run_id:" "$integration"
  grep -Fq "actions/download-artifact@v4" "$integration"
  grep -Fq "gzip -dc artifacts/runtime-tools/aeko-tools-image.tar.gz | docker load" "$integration"
  grep -Fq "AEKO_CI_IMAGE_REPOSITORY: aeko-ci" "$integration"

  if grep -Fq "docker/login-action" "$integration"; then
    echo "Runtime integration must not depend on Docker Hub credentials." >&2
    exit 1
  fi
  if grep -Fq "docker pull" "$runtime_script"; then
    echo "Runtime integration script must consume preloaded workflow artifacts, not Docker Hub." >&2
    exit 1
  fi
  grep -Fq "compose create --pull never key-bootstrap" "$runtime_script"
  grep -Fq "compose up --pull never -d" "$runtime_script"
  grep -Fq "psql -U aeko -d aeko_explorer -Atqc 'SELECT 1'" "$runtime_script"
  if grep -Fq "pg_isready -U aeko -d aeko_explorer" "$runtime_script"; then echo "Runtime PostgreSQL readiness must query the initialized database, not transient pg_isready state." >&2; exit 1; fi
  grep -Fq 'rpc-functional-results.json' "$runtime_script"
  grep -Fq 'rpc-method-results.json' "$runtime_script"
  grep -Fq 'explorer-route-results.json' "$runtime_script"
  grep -Fq 'application_flow_enabled funding-public' "$runtime_script"
  grep -Fq 'application_flow_enabled funding-admin' "$runtime_script"
  grep -Fq 'application_flow_enabled funding-airdrop' "$runtime_script"
  grep -Fq 'application_flow_enabled social-protocol' "$runtime_script"
  grep -Fq -- '--signature "$RPC_FUNDING_SIGNATURE"' "$runtime_script"

  if grep -Fq 'elif [ "$GITHUB_EVENT_NAME" = "pull_request"' "$release_mode"; then
    echo "Pull requests must not publish runtime images to Docker Hub." >&2
    exit 1
  fi

  echo "[ok] runtime integration consumes exact grouped producer artifacts and PRs do not push registry images"
}

assert_grouped_devops_workflow_contract() {
  local workflow="$PIPELINE_DIR/../../../workflows/build-images.yml"
  local web_workflow="$PIPELINE_DIR/../../../workflows/devops-web-ui.yml"
  local runtime_workflow="$PIPELINE_DIR/../../../workflows/devops-runtime-services.yml"
  local sdk_workflow="$PIPELINE_DIR/../../../workflows/devops-sdk-validation.yml"

  grep -Fq 'name: Explorer / UI' "$workflow"
  grep -Fq 'uses: ./.github/workflows/devops-web-ui.yml' "$workflow"
  grep -Fq 'name: Runtime / Tools producer' "$workflow"
  grep -Fq 'name: Release / Linux CLI validation' "$workflow"
  grep -Fq 'name: Chain Contract / Critical RPC + WebSocket' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'name: RPC Method Contract / Individual JSON-RPC calls' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'name: Backend Contract / ${{ matrix.flow }}' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'name: CLI Contract / Release binary' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'name: Summary / Runtime contract' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'GITHUB_RUN_ATTEMPT" -gt 1' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'AEKO_CI_CONTRACT_SCOPE: chain' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'AEKO_CI_CONTRACT_SCOPE: rpc-methods' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'AEKO_CI_CONTRACT_SCOPE: application' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'AEKO_CI_CONTRACT_SCOPE: protocol' ".github/workflows/full-stack-integration.yml"
  grep -Fq 'AEKO_CI_APPLICATION_FLOW: ${{ matrix.flow }}' ".github/workflows/full-stack-integration.yml"
  for flow in route-surface settings funding-public funding-admin funding-airdrop social-protocol; do grep -Fq -- "- $flow" ".github/workflows/full-stack-integration.yml"; done
  if grep -Eq '^[[:space:]]+if: inputs\.selection_mode == .exact.' ".github/workflows/full-stack-integration.yml"; then echo "Runtime contract shards must run in both exact and last-success modes." >&2; exit 1; fi
  if grep -Fq 'Known-Good Compatibility / Latest successful runtime' ".github/workflows/full-stack-integration.yml"; then echo "Monolithic last-success compatibility job must not replace granular contract shards." >&2; exit 1; fi
  grep -Fq 'chmod 0755 "$CLI_RELEASE_DIR/package/aeko" "$CLI_RELEASE_DIR/package/aeko-keygen"' "$workflow"
  grep -Fq 'name: Runtime / Producers' "$workflow"
  grep -Fq 'uses: ./.github/workflows/devops-runtime-services.yml' "$workflow"
  grep -Fq 'name: SDK' "$workflow"
  grep -Fq 'uses: ./.github/workflows/devops-sdk-validation.yml' "$workflow"
  grep -Fq 'secrets: inherit' "$workflow"

  grep -Fq 'workflow_call:' "$web_workflow"
  grep -Fq 'name: Admin / Operations Web' "$web_workflow"
  grep -Fq 'name: Explorer Web' "$web_workflow"
  grep -Fq 'workflow_call:' "$runtime_workflow"
  grep -Fq 'name: Explorer API' "$runtime_workflow"
  grep -Fq 'name: Blockchain network' "$runtime_workflow"
  grep -Fq 'workflow_call:' "$sdk_workflow"
  grep -Fq 'name: JS · Node · Python' "$sdk_workflow"
  grep -Fq 'name: Rust' "$sdk_workflow"

  if grep -Eq '^  (admin|explorer_web|explorer_backend|network|sdk_non_rust|sdk_rust):' "$workflow"; then
    echo "Grouped DevOps child jobs leaked back into the top-level graph." >&2
    exit 1
  fi

  local gate_block
  gate_block="$(sed -n '/^  devops:/,/^  runtime_integration:/p' "$workflow")"
  for required in ci_contract web_ui cli runtime_tools cli_linux_release runtime_services sdk_validation; do
    grep -Eq "^[[:space:]]*-[[:space:]]+${required}$" <<<"$gate_block"
  done

  local publish_block
  publish_block="$(sed -n '/^  cli_release_publish:/,/^  sdk_publish:/p' "$workflow")"
  grep -Eq '^[[:space:]]*-[[:space:]]+cli_windows_release$' <<<"$publish_block"
  grep -Eq '^[[:space:]]*-[[:space:]]+devops$' <<<"$publish_block"
  if grep -Eq '^[[:space:]]*-[[:space:]]+cli$' <<<"$publish_block" || grep -Fq "needs.cli.result" <<<"$publish_block"; then
    echo "CLI publication must rely on the Windows release chain and aggregate gate, not a redundant direct CLI edge." >&2
    exit 1
  fi

  echo "[ok] DevOps graph separates CLI quality, runtime artifact readiness, release validation, UI, runtime services, and SDKs with only real dependencies"
}

assert_grouped_devops_workflow_contract
assert_node24_action_majors
assert_runtime_artifact_handoff_contract
assert_split_coolify_workflow_contract
assert_full_validation_workflow_contract
assert_smart_contract_pipeline_separation
assert_vercel_git_deployments_disabled
assert_cli_release_after_main_contract

run_plan_case "Explorer Web-only main push runs the full validation DAG" push false false true true
run_plan_case "CI-only pull request runs images and all external SDK validation" pull_request true false true
run_plan_case "CI-only main push runs images and all external SDK validation" push true false true
run_plan_case "core main push still rebuilds the full image DAG" push false true true

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
run_deploy_plan_case "Core release remains stateful-manual despite broad validation" \
  false true false false false false false false false false \
  false false false true

test_split_deploy_trigger

run_release_case "CI-only main push promotes and publishes runtime validation images" push refs/heads/main false true false true true
run_release_case "product main push promotes and publishes runtime validation images" push refs/heads/main true false false true true
run_release_case "same-repository CI pull request keeps runtime images off Docker Hub" pull_request refs/pull/58/merge false true true false false
run_release_case "same-repository product pull request keeps runtime images off Docker Hub" pull_request refs/pull/58/merge true false true false false
run_release_case "fork pull request cannot push runtime images" pull_request refs/pull/58/merge true false false false false
run_release_case "SDK-only main push publishes immutable validation images without promotion" push refs/heads/main false false false false true

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
