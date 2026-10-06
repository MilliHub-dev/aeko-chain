#!/usr/bin/env bash
set -euo pipefail

app_dir="apps/explorer/editor"
image="aeko-ci/aeko-editor-web:${SHA_TAG}"


http_request() {
  local label="$1"
  shift
  local result rc status body
  if result="$(curl --silent --show-error --write-out $'\n%{http_code}' "$@" 2>&1)"; then
    rc=0
  else
    rc=$?
  fi
  status="${result##*$'\n'}"
  body="${result%$'\n'*}"
  if [ "$rc" -eq 0 ] && [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
    printf '%s' "$body"
    return 0
  fi
  echo "Contract Studio HTTP assertion failed: ${label} (HTTP ${status:-unknown}, curl exit ${rc})." >&2
  printf '%s\n' "$body" >&2
  if [ "$rc" -ne 0 ]; then return "$rc"; fi
  return 22
}

container_http_request() {
  local label="$1"
  shift
  local result rc status body
  if result="$(docker exec "$cid" curl --silent --show-error --write-out $'\n%{http_code}' "$@" 2>&1)"; then
    rc=0
  else
    rc=$?
  fi
  status="${result##*$'\n'}"
  body="${result%$'\n'*}"
  if [ "$rc" -eq 0 ] && [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
    printf '%s' "$body"
    return 0
  fi
  echo "Contract Studio container HTTP assertion failed: ${label} (HTTP ${status:-unknown}, curl exit ${rc})." >&2
  printf '%s\n' "$body" >&2
  echo "Contract Studio container logs:" >&2
  docker logs "$cid" >&2 || true
  if [ "$rc" -ne 0 ]; then return "$rc"; fi
  return 22
}

assert_json() {
  local label="$1"
  local expression="$2"
  local payload="$3"
  if printf '%s' "$payload" | jq -e "$expression" >/dev/null; then
    return 0
  fi
  echo "Contract Studio JSON assertion failed: ${label}." >&2
  printf '%s\n' "$payload" >&2
  return 1
}

if [ "${VALIDATE_SOURCE}" = "true" ]; then
  pushd "$app_dir" >/dev/null
  npm install --no-audit --no-fund
  npm run lint
  npm test
  npm run build

  dev_log="$(mktemp)"
  npm run dev >"$dev_log" 2>&1 &
  dev_pid=$!
  cleanup_dev() {
    kill "$dev_pid" >/dev/null 2>&1 || true
    wait "$dev_pid" >/dev/null 2>&1 || true
  }
  trap cleanup_dev EXIT HUP INT TERM

  studio_ready=false
  for _ in $(seq 1 45); do
    if curl --fail --silent http://127.0.0.1:4100/healthz | grep -Fxq "ok"; then
      studio_ready=true
      break
    fi
    if ! kill -0 "$dev_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [ "$studio_ready" != "true" ]; then
    echo "Contract Studio development smoke failed." >&2
    cat "$dev_log" >&2
    exit 1
  fi

  http_request "GET /" http://127.0.0.1:4100/ >/dev/null
  http_request "GET /src/main.tsx" http://127.0.0.1:4100/src/main.tsx >/dev/null
  http_request "GET /src/ide/vscode.ts" http://127.0.0.1:4100/src/ide/vscode.ts >/dev/null
  dev_config_json="$(http_request "GET /api/config" http://127.0.0.1:4100/api/config)"
  assert_json "development configuration must disable shared-token auth" '.data.authRequired == false' "$dev_config_json"

  optimizer_failed=false
  for _ in $(seq 1 15); do
    if grep -Fq "Error during dependency optimization:" "$dev_log"; then
      optimizer_failed=true
      break
    fi
    if ! kill -0 "$dev_pid" 2>/dev/null; then
      optimizer_failed=true
      break
    fi
    sleep 1
  done
  if [ "$optimizer_failed" = "true" ]; then
    echo "Contract Studio Vite dependency optimization failed." >&2
    cat "$dev_log" >&2
    exit 1
  fi

  cleanup_dev
  trap - EXIT HUP INT TERM
  rm -f "$dev_log"

  popd >/dev/null
  AEKO_EDITOR_ACCESS_TOKEN=ci-contract-studio-token \
    docker compose -f "$app_dir/compose.coolify.yml" config >/dev/null
fi

if [ "${BUILD_IMAGE}" = "true" ]; then
  docker build --target editor-web -t "$image" -f docker/Dockerfile .

  ci_token="ci-contract-studio-token-0123456789abcdef"
  cid="$(
    docker run -d \
      --read-only \
      --tmpfs /workspaces:rw,nosuid,nodev,size=128m,mode=0711 \
      --tmpfs /tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777 \
      --cap-drop ALL \
      --cap-add CHOWN \
      --cap-add DAC_OVERRIDE \
      --cap-add SETUID \
      --cap-add SETGID \
      --security-opt no-new-privileges:true \
      -e AEKO_EDITOR_PUBLIC_ORIGIN=http://127.0.0.1:4100 \
      -e AEKO_EDITOR_ACCESS_TOKEN="$ci_token" \
      -e AEKO_NETWORK=testnet \
      -e AEKO_RPC_URL=https://rpc.aeko.online \
      -e AEKO_EXPLORER_URL=https://scan.aeko.online \
      "$image"
  )"

  cleanup() {
    docker rm -f "$cid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT HUP INT TERM

  studio_ready=false
  for _ in $(seq 1 30); do
    if docker exec "$cid" curl --fail --silent http://127.0.0.1:4100/healthz | grep -Fxq "ok"; then
      studio_ready=true
      break
    fi
    if ! docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null | grep -Fxq "true"; then
      break
    fi
    sleep 1
  done

  if [ "$studio_ready" != "true" ]; then
    echo "Contract Studio image failed to become healthy." >&2
    docker logs "$cid" >&2 || true
    exit 1
  fi

  login_json="$(container_http_request \
    "POST /api/session" \
    -c /tmp/studio-ci-cookie \
    -H "Origin: http://127.0.0.1:4100" \
    -H "Content-Type: application/json" \
    -d "{\"accessToken\":\"$ci_token\"}" \
    http://127.0.0.1:4100/api/session)"
  assert_json "POST /api/session" '.data.authenticated == true' "$login_json"

  workspace_json="$(container_http_request \
    "POST /api/workspaces" \
    -b /tmp/studio-ci-cookie \
    -H "Origin: http://127.0.0.1:4100" \
    -H "Content-Type: application/json" \
    -d '{"name":"ci-smoke","template":"python-client"}' \
    http://127.0.0.1:4100/api/workspaces)"
  workspace_id="$(printf '%s' "$workspace_json" | jq -er '.data.id')"

  tree_json="$(container_http_request \
    "GET /api/workspaces/:workspaceId/tree" \
    -b /tmp/studio-ci-cookie \
    "http://127.0.0.1:4100/api/workspaces/$workspace_id/tree")"
  assert_json "workspace tree contains the Python entrypoint" \
    '.data.files | any(.path == "src/main.py" and .type == "file")' \
    "$tree_json"

  delete_json="$(container_http_request \
    "DELETE /api/workspaces/:workspaceId" \
    -X DELETE \
    -b /tmp/studio-ci-cookie \
    -H "Origin: http://127.0.0.1:4100" \
    "http://127.0.0.1:4100/api/workspaces/$workspace_id")"
  assert_json "workspace deletion" '.data.deleted == true' "$delete_json"

  cleanup
  trap - EXIT HUP INT TERM
fi
