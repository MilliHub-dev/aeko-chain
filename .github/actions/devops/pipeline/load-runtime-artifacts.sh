#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_BUILD_SHA="${EXPECTED_BUILD_SHA:-}"
provenance_files=(
  artifacts/runtime-tools/ci-source-sha.txt
  artifacts/runtime-network/ci-source-sha.txt
  artifacts/runtime-explorer-api/ci-source-sha.txt
  artifacts/runtime-tools/cli-release/ci-source-sha.txt
)

resolved=""
for provenance in "${provenance_files[@]}"; do
  test -s "$provenance"
  actual="$(tr -d '\r\n' < "$provenance")"
  if [ -z "$resolved" ]; then
    resolved="$actual"
  elif [ "$actual" != "$resolved" ]; then
    echo "Runtime artifact provenance mismatch: $provenance=$actual expected=$resolved" >&2
    exit 1
  fi
done

if [ -n "$EXPECTED_BUILD_SHA" ] && [ "$resolved" != "$EXPECTED_BUILD_SHA" ]; then
  echo "Runtime artifacts were built from $resolved, expected $EXPECTED_BUILD_SHA" >&2
  exit 1
fi

sha_tag="${resolved:0:12}"
gzip -dc artifacts/runtime-tools/aeko-tools-image.tar.gz | docker load
gzip -dc artifacts/runtime-network/aeko-network-images.tar.gz | docker load
gzip -dc artifacts/runtime-explorer-api/aeko-explorer-api-image.tar.gz | docker load

for image in aeko-tools aeko-validator aeko-faucet aeko-social-bootstrap aeko-protocol-bootstrap aeko-explorer-api; do
  docker image inspect "aeko-ci/${image}:${sha_tag}" >/dev/null
done

{
  echo "build_sha=$resolved"
  echo "sha_tag=$sha_tag"
} >> "$GITHUB_OUTPUT"
echo "Loaded immutable runtime artifacts for $resolved."
