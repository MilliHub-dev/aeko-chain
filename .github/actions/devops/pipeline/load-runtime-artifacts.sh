#!/usr/bin/env bash
set -Eeuo pipefail

: "${RUNTIME_TAG_SHA:?RUNTIME_TAG_SHA is required}"

EXPECTED_TOOLS_SHA="${EXPECTED_TOOLS_SHA:-}"
EXPECTED_NETWORK_SHA="${EXPECTED_NETWORK_SHA:-}"
EXPECTED_EXPLORER_SHA="${EXPECTED_EXPLORER_SHA:-}"

read_provenance() {
  local file="$1" expected="$2"
  test -s "$file"
  local actual
  actual="$(tr -d '\r\n' < "$file")"
  if [ -n "$expected" ] && [ "$actual" != "$expected" ]; then
    echo "Runtime artifact provenance mismatch: $file=$actual expected=$expected" >&2
    exit 1
  fi
  printf '%s\n' "$actual"
}

tools_sha="$(read_provenance artifacts/runtime-tools/ci-source-sha.txt "$EXPECTED_TOOLS_SHA")"
tools_cli_sha="$(read_provenance artifacts/runtime-tools/cli-release/ci-source-sha.txt "$EXPECTED_TOOLS_SHA")"
[ "$tools_sha" = "$tools_cli_sha" ] || {
  echo "Tools image and CLI payload provenance disagree: image=$tools_sha cli=$tools_cli_sha" >&2
  exit 1
}
network_sha="$(read_provenance artifacts/runtime-network/ci-source-sha.txt "$EXPECTED_NETWORK_SHA")"
explorer_sha="$(read_provenance artifacts/runtime-explorer-api/ci-source-sha.txt "$EXPECTED_EXPLORER_SHA")"

gzip -dc artifacts/runtime-tools/aeko-tools-image.tar.gz | docker load
gzip -dc artifacts/runtime-network/aeko-network-images.tar.gz | docker load
gzip -dc artifacts/runtime-explorer-api/aeko-explorer-backend-images.tar.gz | docker load

runtime_tag="${RUNTIME_TAG_SHA:0:12}"

retag() {
  local source_sha="$1" image="$2"
  local source="aeko-ci/$image:${source_sha:0:12}"
  local target="aeko-ci/$image:$runtime_tag"
  docker image inspect "$source" >/dev/null
  if [ "$source" != "$target" ]; then
    docker tag "$source" "$target"
  fi
  docker image inspect "$target" >/dev/null
}

retag "$tools_sha" aeko-tools
for image in aeko-validator aeko-faucet aeko-social-bootstrap aeko-protocol-bootstrap; do
  retag "$network_sha" "$image"
done
retag "$explorer_sha" aeko-explorer-api
retag "$explorer_sha" aeko-editor-runner

{
  echo "build_sha=$RUNTIME_TAG_SHA"
  echo "sha_tag=$runtime_tag"
  echo "tools_sha=$tools_sha"
  echo "network_sha=$network_sha"
  echo "explorer_sha=$explorer_sha"
} >> "$GITHUB_OUTPUT"

echo "Loaded runtime overlay as tag $runtime_tag (tools=$tools_sha network=$network_sha explorer=$explorer_sha)."
