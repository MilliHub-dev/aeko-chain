#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

DOCKERIZED="${DOCKERIZED:-false}"
CI_PIPELINE="${CI_PIPELINE:-false}"
INTERNAL_PR="${INTERNAL_PR:-false}"
publish=false
push_runtime_images=false

# Registry publication only exists for main runs that actually exercise Docker
# release surfaces. SDK-only and other non-Docker changes must not authenticate
# or publish runtime images just because they landed on main.
if [ "$GITHUB_REF" = "refs/heads/main" ] && [ "$GITHUB_EVENT_NAME" != "pull_request" ]; then
  if [ "$DOCKERIZED" = "true" ] || [ "$CI_PIPELINE" = "true" ]; then
    publish=true
    push_runtime_images=true
  fi
fi

echo "publish=$publish" >> "$GITHUB_OUTPUT"
echo "push_runtime_images=$push_runtime_images" >> "$GITHUB_OUTPUT"
echo "sha_tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
printf 'Release mode: publish=%s push-runtime-images=%s internal-pr=%s dockerized=%s ci-pipeline=%s sha=%s\n'   "$publish" "$push_runtime_images" "$INTERNAL_PR" "$DOCKERIZED" "$CI_PIPELINE" "${GITHUB_SHA::12}"
