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
  popd >/dev/null
fi

if [ "${BUILD_IMAGE}" = "true" ]; then
  docker build --target editor-web -t "$image" -f docker/Dockerfile .

  cid="$(
    docker run -d       --read-only       --tmpfs /workspaces:rw,nosuid,nodev,size=128m,uid=10001,gid=10001,mode=0770       --tmpfs /tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777       --cap-drop ALL       --cap-add SETUID       --cap-add SETGID       --security-opt no-new-privileges:true       -e AEKO_EDITOR_PUBLIC_ORIGIN=http://127.0.0.1:4100       -e AEKO_EDITOR_ACCESS_TOKEN=ci-contract-studio-token       -e AEKO_NETWORK=testnet       -e AEKO_RPC_URL=https://rpc.aeko.online       -e AEKO_EXPLORER_URL=https://scan.aeko.online       "$image"
  )"

  cleanup() {
    docker rm -f "$cid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT HUP INT TERM

  for _ in $(seq 1 30); do
    if docker exec "$cid" curl --fail --silent http://127.0.0.1:4100/healthz >/dev/null; then
      break
    fi
    sleep 1
  done
  docker exec "$cid" curl --fail --silent http://127.0.0.1:4100/healthz | grep -Fxq "ok"
  cleanup
  trap - EXIT HUP INT TERM
fi
