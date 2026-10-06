#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

DOCKERIZED="${DOCKERIZED:-false}"
CI_PIPELINE="${CI_PIPELINE:-false}"
INTERNAL_PR="${INTERNAL_PR:-false}"
ADMIN="${ADMIN:-false}"
CLI="${CLI:-false}"
CORE="${CORE:-false}"
PACKAGING="${PACKAGING:-false}"
EXPLORER_BACKEND="${EXPLORER_BACKEND:-false}"
EXPLORER_WEB="${EXPLORER_WEB:-false}"
EDITOR="${EDITOR:-false}"

publish=false
publish_admin=false
publish_cli=false
publish_explorer_backend=false
publish_explorer_web=false
publish_editor=false
publish_network=false

# Image publication follows the product/image domains that actually changed.
# CI-only and SDK-only main pushes still validate, but they do not authenticate
# to Docker Hub or republish unrelated runtime images.
if [ "$GITHUB_REF" = "refs/heads/main" ] \
  && [ "$GITHUB_EVENT_NAME" != "pull_request" ] \
  && [ "$DOCKERIZED" = "true" ]; then
  publish=true

  publish_admin="$ADMIN"
  publish_cli="$CLI"
  publish_explorer_backend="$EXPLORER_BACKEND"
  publish_explorer_web="$EXPLORER_WEB"
  publish_editor="$EDITOR"
  publish_network="$CORE"

  if [ "$CORE" = "true" ]; then
    publish_cli=true
    publish_explorer_backend=true
    publish_editor=true
    publish_network=true
  fi

  if [ "$CLI" = "true" ]; then
    publish_editor=true
  fi

  if [ "$PACKAGING" = "true" ]; then
    publish_admin=true
    publish_cli=true
    publish_explorer_backend=true
    publish_explorer_web=true
    publish_editor=true
    publish_network=true
  fi
fi

{
  echo "publish=$publish"
  echo "publish_admin=$publish_admin"
  echo "publish_cli=$publish_cli"
  echo "publish_explorer_backend=$publish_explorer_backend"
  echo "publish_explorer_web=$publish_explorer_web"
  echo "publish_editor=$publish_editor"
  echo "publish_network=$publish_network"
  echo "sha_tag=${GITHUB_SHA::12}"
} >> "$GITHUB_OUTPUT"

printf 'Release mode: publish=%s admin=%s cli=%s backend=%s web=%s editor=%s network=%s internal-pr=%s dockerized=%s ci-pipeline=%s sha=%s\n' \
  "$publish" "$publish_admin" "$publish_cli" "$publish_explorer_backend" "$publish_explorer_web" "$publish_editor" "$publish_network" \
  "$INTERNAL_PR" "$DOCKERIZED" "$CI_PIPELINE" "${GITHUB_SHA::12}"
