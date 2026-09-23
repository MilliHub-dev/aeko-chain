#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

DOCKERIZED="${DOCKERIZED:-false}"
CI_PIPELINE="${CI_PIPELINE:-false}"
publish=false

# A main run publishes immutable Docker images whenever product packaging owns
# images or the CI orchestrator itself changed. CI-only main runs deliberately
# republish the verified current image set so promotion/deployment exercises the
# exact post-merge release path rather than stopping after local builds.
if [ "$GITHUB_REF" = "refs/heads/main" ] \
  && [ "$GITHUB_EVENT_NAME" != "pull_request" ] \
  && { [ "$DOCKERIZED" = "true" ] || [ "$CI_PIPELINE" = "true" ]; }; then
  publish=true
fi

echo "publish=$publish" >> "$GITHUB_OUTPUT"
echo "sha_tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
printf 'Release mode: publish=%s dockerized=%s ci-pipeline=%s sha=%s\n' \
  "$publish" "$DOCKERIZED" "$CI_PIPELINE" "${GITHUB_SHA::12}"
