#!/usr/bin/env bash
set -euo pipefail

VALIDATE_SOURCE="${VALIDATE_SOURCE:-true}"
PUBLISH="${PUBLISH:-false}"

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}"

if [ "${PUBLISH}" = "true" ]; then
  if [ "${GITHUB_REF}" != "refs/heads/main" ] || [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
    echo "Network publication is permitted only from the main branch." >&2
    exit 1
  fi
fi

AEKO_PUBLIC_IP=203.0.113.10 \
AEKO_KEYS_DIR=/tmp/aeko-keys \
EXPLORER_DATABASE_URL=postgres://aeko:aeko@postgres:5432/aeko_explorer \
AEKO_IMAGE_TAG=ci \
bash -c '
  set -euo pipefail
  bash -n docker/validator-entrypoint.sh
  bash -n scripts/deploy-testnet.sh
  python3 scripts/validate-deployment-contract.py
  docker compose -f docker/compose.local.yml config >/dev/null
  docker compose -f docker/compose.dokploy.yml config >/dev/null
  docker compose -f docker/compose.coolify.yml config >/dev/null
'

if [ "${VALIDATE_SOURCE}" != "true" ]; then
  exit 0
fi

if [ "${GITHUB_EVENT_NAME}" = "workflow_dispatch" ]; then
  cargo fmt --all -- --check
  exit 0
fi

if [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
  BASE_SHA=$(jq -r '.pull_request.base.sha // empty' "${GITHUB_EVENT_PATH}")
  HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "${GITHUB_EVENT_PATH}")
else
  BASE_SHA=$(jq -r '.before // empty' "${GITHUB_EVENT_PATH}")
  HEAD_SHA="${GITHUB_SHA}"
fi

if [ -z "${BASE_SHA}" ] || [ -z "${HEAD_SHA}" ] || [[ "${BASE_SHA}" =~ ^0+$ ]] || ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  cargo fmt --all -- --check
  exit 0
fi

mapfile -t changed_rust < <(
  git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" | grep -E '\.rs$' || true
)

if [ "${#changed_rust[@]}" -eq 0 ]; then
  echo "No changed Rust files to format-check."
  exit 0
fi

cargo fmt --all

format_failures=()
for file in "${changed_rust[@]}"; do
  if [ -f "${file}" ] && ! git diff --quiet -- "${file}"; then
    format_failures+=("${file}")
  fi
done

if [ "${#format_failures[@]}" -gt 0 ]; then
  echo "rustfmt changed Rust files touched by this change set:" >&2
  printf '  %s\n' "${format_failures[@]}" >&2
  git diff -- "${format_failures[@]}" >&2
  git restore --worktree -- .
  exit 1
fi

git restore --worktree -- .
echo "Changed Rust files are rustfmt-clean; unrelated legacy formatting debt was ignored."
