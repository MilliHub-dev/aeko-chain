#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}"

if [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
  BASE_SHA=$(jq -r '.pull_request.base.sha // empty' "${GITHUB_EVENT_PATH}")
  HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "${GITHUB_EVENT_PATH}")
else
  BASE_SHA=$(jq -r '.before // empty' "${GITHUB_EVENT_PATH}")
  HEAD_SHA="${GITHUB_SHA}"
fi

if [ -z "${BASE_SHA}" ] || [ -z "${HEAD_SHA}" ] || [[ "${BASE_SHA}" =~ ^0+$ ]] || ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  cargo fmt --manifest-path apps/cli/Cargo.toml -- --check
  cargo fmt --manifest-path keygen/Cargo.toml -- --check
  exit 0
fi

mapfile -t changed_rust < <(
  git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- apps/cli keygen \
    | grep -E '\.rs$' || true
)

if [ "${#changed_rust[@]}" -eq 0 ]; then
  echo "No changed CLI/keygen Rust files to format-check."
  exit 0
fi

tmp_root=$(mktemp -d)
worktree="${tmp_root}/worktree"
cleanup() {
  git worktree remove --force "${worktree}" >/dev/null 2>&1 || true
  rm -rf "${tmp_root}"
}
trap cleanup EXIT

git worktree add --detach "${worktree}" "${HEAD_SHA}" >/dev/null
(
  cd "${worktree}"
  cargo fmt --manifest-path apps/cli/Cargo.toml
  cargo fmt --manifest-path keygen/Cargo.toml
)

format_failures=()
for file in "${changed_rust[@]}"; do
  if [ -f "${worktree}/${file}" ] && ! git -C "${worktree}" diff --quiet -- "${file}"; then
    format_failures+=("${file}")
  fi
done

if [ "${#format_failures[@]}" -gt 0 ]; then
  echo "rustfmt changed CLI/keygen Rust files touched by this change set:" >&2
  printf '  %s\n' "${format_failures[@]}" >&2
  git -C "${worktree}" diff -- "${format_failures[@]}" >&2
  exit 1
fi

echo "Changed CLI/keygen Rust files are rustfmt-clean; unrelated legacy formatting debt was ignored."
