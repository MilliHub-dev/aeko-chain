#!/usr/bin/env bash
set -euo pipefail

app_dir="apps/explorer/editor"
image="aeko-ci/aeko-editor-web:${SHA_TAG}"

if [ "${VALIDATE_SOURCE}" = "true" ]; then
  pushd "$app_dir" >/dev/null
  npm install --no-audit --no-fund
  npm run lint
  npm test
  npm run build

  dev_log="$(mktemp)"
  AEKO_EDITOR_ALLOW_INSECURE_LOCAL=1 npm run dev >"$dev_log" 2>&1 &
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

  curl --fail --silent http://127.0.0.1:4100/ >/dev/null
  curl --fail --silent http://127.0.0.1:4100/api/config \
    | jq -e '.data.authRequired == false' >/dev/null

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

  docker exec "$cid" curl --fail --silent \
    -c /tmp/studio-ci-cookie \
    -H "Origin: http://127.0.0.1:4100" \
    -H "Content-Type: application/json" \
    -d "{\"accessToken\":\"$ci_token\"}" \
    http://127.0.0.1:4100/api/session >/dev/null

  workspace_json="$(
    docker exec "$cid" curl --fail --silent \
      -b /tmp/studio-ci-cookie \
      -H "Origin: http://127.0.0.1:4100" \
      -H "Content-Type: application/json" \
      -d '{"name":"ci-smoke","template":"python-client"}' \
      http://127.0.0.1:4100/api/workspaces
  )"
  workspace_id="$(printf '%s' "$workspace_json" | jq -er '.data.id')"

  docker exec "$cid" curl --fail --silent \
    -b /tmp/studio-ci-cookie \
    "http://127.0.0.1:4100/api/workspaces/$workspace_id/tree" \
    | jq -e '.data.files | any(.path == "src/main.py" and .type == "file")' >/dev/null

  docker exec "$cid" curl --fail --silent \
    -X DELETE \
    -b /tmp/studio-ci-cookie \
    -H "Origin: http://127.0.0.1:4100" \
    "http://127.0.0.1:4100/api/workspaces/$workspace_id" \
    | jq -e '.data.deleted == true' >/dev/null

  cleanup
  trap - EXIT HUP INT TERM
fi
