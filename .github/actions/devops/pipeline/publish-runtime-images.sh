#!/usr/bin/env bash
set -Eeuo pipefail

: "${REGISTRY_USER:?REGISTRY_USER is required}"
: "${SHA_TAG:?SHA_TAG is required}"

PUBLISH_ADMIN="${PUBLISH_ADMIN:-false}"
PUBLISH_CLI="${PUBLISH_CLI:-false}"
PUBLISH_EXPLORER_BACKEND="${PUBLISH_EXPLORER_BACKEND:-false}"
PUBLISH_EXPLORER_WEB="${PUBLISH_EXPLORER_WEB:-false}"
PUBLISH_EDITOR="${PUBLISH_EDITOR:-false}"
PUBLISH_NETWORK="${PUBLISH_NETWORK:-false}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-artifacts/release}"

verify_provenance() {
  local dir="$1"
  local file="$dir/ci-source-sha.txt"
  test -s "$file"
  local actual
  actual="$(tr -d '\r\n' < "$file")"
  if [ "${actual:0:12}" != "$SHA_TAG" ]; then
    echo "Release artifact provenance mismatch: $file=$actual expected tag=$SHA_TAG" >&2
    exit 1
  fi
}

load_image_set() {
  local dir="$1" archive="$2"
  verify_provenance "$dir"
  test -s "$dir/$archive"
  gzip -dc "$dir/$archive" | docker load
}

push_image() {
  local source_name="$1"
  shift
  local source="aeko-ci/$source_name:$SHA_TAG"
  docker image inspect "$source" >/dev/null
  local target_name target
  for target_name in "$@"; do
    target="$REGISTRY_USER/$target_name:$SHA_TAG"
    docker tag "$source" "$target"
    docker push "$target"
  done
}

if [ "$PUBLISH_CLI" = true ]; then
  load_image_set "$ARTIFACT_ROOT/tools" aeko-tools-image.tar.gz
  push_image aeko-tools aeko-tools
fi

if [ "$PUBLISH_NETWORK" = true ]; then
  load_image_set "$ARTIFACT_ROOT/network" aeko-network-images.tar.gz
  push_image aeko-validator aeko-validator aeko-node
  push_image aeko-faucet aeko-faucet
  push_image aeko-social-bootstrap aeko-social-bootstrap
  push_image aeko-protocol-bootstrap aeko-protocol-bootstrap
fi

if [ "$PUBLISH_EXPLORER_BACKEND" = true ]; then
  load_image_set "$ARTIFACT_ROOT/explorer-api" aeko-explorer-backend-images.tar.gz
  push_image aeko-explorer-api aeko-explorer-api aeko-explorer-backend
  push_image aeko-editor-runner aeko-editor-runner
fi

if [ "$PUBLISH_EXPLORER_WEB" = true ]; then
  load_image_set "$ARTIFACT_ROOT/explorer-ui" aeko-explorer-ui-image.tar.gz
  push_image aeko-explorer-ui aeko-explorer-ui
fi

if [ "$PUBLISH_EDITOR" = true ]; then
  load_image_set "$ARTIFACT_ROOT/editor-web" aeko-editor-web-image.tar.gz
  push_image aeko-editor-web aeko-editor-web
fi

if [ "$PUBLISH_ADMIN" = true ]; then
  load_image_set "$ARTIFACT_ROOT/operations-web" aeko-operations-web-image.tar.gz
  push_image aeko-operations-web aeko-operations-web
fi

echo "Published selected immutable Docker images for $SHA_TAG."
