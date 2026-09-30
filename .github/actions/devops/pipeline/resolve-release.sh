#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

DOCKERIZED="${DOCKERIZED:-false}"
CI_PIPELINE="${CI_PIPELINE:-false}"
INTERNAL_PR="${INTERNAL_PR:-false}"
publish=false
push_runtime_images=false

# A main run publishes immutable Docker images whenever product packaging owns
# images or the CI orchestrator itself changed. CI-only main runs deliberately
# republish the verified current image set so promotion/deployment exercises the
# exact post-merge release path rather than stopping after local builds.
if [ "$GITHUB_REF" = "refs/heads/main" ] \
  && [ "$GITHUB_EVENT_NAME" != "pull_request" ] \
  && { [ "$DOCKERIZED" = "true" ] || [ "$CI_PIPELINE" = "true" ]; }; then
  publish=true
  push_runtime_images=true
elif [ "$GITHUB_EVENT_NAME" = "pull_request" ] \
  && [ "$INTERNAL_PR" = "true" ] \
  && { [ "$DOCKERIZED" = "true" ] || [ "$CI_PIPELINE" = "true" ]; }; then
  # Same-repository PRs may publish immutable SHA-tagged runtime images so the
  # production-compose integration gate can consume the exact build outputs.
  # They are never promoted to latest and never deployed.
  push_runtime_images=true
fi

echo "publish=$publish" >> "$GITHUB_OUTPUT"
echo "push_runtime_images=$push_runtime_images" >> "$GITHUB_OUTPUT"
echo "sha_tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
printf 'Release mode: publish=%s push-runtime-images=%s internal-pr=%s dockerized=%s ci-pipeline=%s sha=%s\n' \
  "$publish" "$push_runtime_images" "$INTERNAL_PR" "$DOCKERIZED" "$CI_PIPELINE" "${GITHUB_SHA::12}"
