#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

DOCKERIZED="${DOCKERIZED:-false}"
publish=false

# Publishing is reserved for a real Docker-owning product/packaging change on
# main. CI-only changes still rebuild every image, but must not publish,
# promote, or deploy unchanged product outputs.
if [ "$GITHUB_REF" = "refs/heads/main" ] \
  && [ "$GITHUB_EVENT_NAME" != "pull_request" ] \
  && [ "$DOCKERIZED" = "true" ]; then
  publish=true
fi

echo "publish=$publish" >> "$GITHUB_OUTPUT"
echo "sha_tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
printf 'Release mode: publish=%s dockerized=%s sha=%s\n' "$publish" "$DOCKERIZED" "${GITHUB_SHA::12}"
