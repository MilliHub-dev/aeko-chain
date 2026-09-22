#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <path> [<path> ...]" >&2
  exit 64
fi

head_sha="${GITHUB_SHA:-HEAD}"
base_sha=""

if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] && [ -n "${GITHUB_EVENT_PATH:-}" ]; then
  base_sha="$(jq -r '.pull_request.base.sha // empty' "$GITHUB_EVENT_PATH")"
  pr_head="$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")"
  if [ -n "$pr_head" ]; then
    head_sha="$pr_head"
  fi
elif [ -n "${GITHUB_EVENT_PATH:-}" ]; then
  base_sha="$(jq -r '.before // empty' "$GITHUB_EVENT_PATH")"
fi

changed=()
if [ -n "$base_sha" ] && ! [[ "$base_sha" =~ ^0+$ ]] \
  && git cat-file -e "${base_sha}^{commit}" 2>/dev/null \
  && git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
  while IFS= read -r file; do
    [ -n "$file" ] && changed+=("$file")
  done < <(git diff --name-only "$base_sha" "$head_sha" -- "$@")
else
  while IFS= read -r file; do
    [ -n "$file" ] && changed+=("$file")
  done < <(git diff-tree --root --no-commit-id --name-only -r "$head_sha" -- "$@")
fi

rust_files=()
for file in "${changed[@]}"; do
  case "$file" in
    *.rs)
      if [ -f "$file" ]; then
        rust_files+=("$file")
      fi
      ;;
  esac
done

if [ "${#rust_files[@]}" -eq 0 ]; then
  echo "No changed Rust files require rustfmt validation."
  exit 0
fi

printf 'Checking rustfmt on changed files:\n'
printf '  %s\n' "${rust_files[@]}"

# Running rustfmt directly on a crate root such as src/lib.rs follows child
# modules and can fail on unchanged legacy files. Format in an isolated
# worktree, then inspect only the files selected by the change detector.
format_ref="$head_sha"
if ! git cat-file -e "${format_ref}^{commit}" 2>/dev/null; then
  format_ref=HEAD
fi

format_worktree=$(mktemp -d)
rmdir "$format_worktree"
cleanup_worktree() {
  git worktree remove --force "$format_worktree" >/dev/null 2>&1 || true
  rm -rf "$format_worktree"
}
trap cleanup_worktree EXIT

git worktree add --detach "$format_worktree" "$format_ref" >/dev/null
(
  cd "$format_worktree"
  cargo fmt --all
)

format_failures=()
for file in "${rust_files[@]}"; do
  if [ -f "${format_worktree}/${file}" ] && ! git -C "$format_worktree" diff --quiet -- "$file"; then
    format_failures+=("$file")
  fi
done

if [ "${#format_failures[@]}" -gt 0 ]; then
  echo "rustfmt changed Rust files touched by this change set:" >&2
  printf '  %s\n' "${format_failures[@]}" >&2
  git -C "$format_worktree" diff -- "${format_failures[@]}" >&2
  exit 1
fi

echo "Changed Rust files are rustfmt-clean; unchanged module formatting debt was ignored."
