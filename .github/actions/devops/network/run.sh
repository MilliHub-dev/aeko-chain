#!/usr/bin/env bash
set -euo pipefail

VALIDATE_SOURCE="${VALIDATE_SOURCE:-true}"
BUILD_IMAGE="${BUILD_IMAGE:-true}"
PUBLISH="${PUBLISH:-false}"
REGISTRY_USER="${REGISTRY_USER:-}"
: "${SHA_TAG:?SHA_TAG is required}"

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}"

if [ "${PUBLISH}" = "true" ]; then
  if [ "${GITHUB_REF}" != "refs/heads/main" ] || [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
    echo "Network publication is permitted only from the main branch." >&2
    exit 1
  fi
fi

if [ "${VALIDATE_SOURCE}" = "true" ]; then
  cargo clippy --locked --all-targets --no-deps \
    -p aeko-social-staking-program \
    -p aeko-social-monetization-program \
    -- -D warnings

  cargo test --locked \
    -p aeko-validator \
    -p aeko-genesis \
    -p aeko-faucet \
    -p aeko-social-bootstrap \
    -p aeko-protocol-bootstrap \
    -p aeko-social-staking-program \
    -p aeko-social-monetization-program

  # Consensus-upgrade regressions must execute, not merely compile through the
  # validator dependency graph. Keep the filter narrow to the two AEKO protocol
  # builtin tests rather than running the full runtime suite on every PR.
  cargo test --locked -p aeko-runtime --lib aeko_protocol_builtins
fi

if [ "${BUILD_IMAGE}" = "true" ]; then
  output=(--load)
  prefix="aeko-ci"

  if [ "${PUBLISH}" = "true" ]; then
    : "${REGISTRY_USER:?REGISTRY_USER is required when publishing}"
    prefix="${REGISTRY_USER}"
    output=(--push)
  fi

  build_target() {
    local target="$1"
    shift
    local tags=()
    local image
    for image in "$@"; do
      tags+=(--tag "${prefix}/${image}:${SHA_TAG}")
    done
    local cache_scope="aeko-network-${target}"
    docker buildx build \
      --file docker/Dockerfile \
      --target "${target}" \
      --cache-from "type=gha,scope=${cache_scope}" \
      --cache-to "type=gha,scope=${cache_scope},mode=max,ignore-error=true" \
      "${tags[@]}" \
      "${output[@]}" \
      .
  }

  # network-rust-builder compiles validator, genesis, faucet, social-bootstrap and protocol-bootstrap
  # once. BuildKit reuses that stage for these targets.
  build_target validator aeko-validator aeko-node
  build_target faucet aeko-faucet
  build_target social-bootstrap aeko-social-bootstrap
  build_target protocol-bootstrap aeko-protocol-bootstrap

  if [ "${PUBLISH}" = "true" ]; then
    echo "Published immutable network images for ${SHA_TAG}."
  else
    for image in aeko-validator aeko-node aeko-faucet aeko-social-bootstrap aeko-protocol-bootstrap; do
      docker image inspect "aeko-ci/${image}:${SHA_TAG}" >/dev/null
    done
    echo "Built and verified the network image set locally; nothing was pushed."
  fi

fi
