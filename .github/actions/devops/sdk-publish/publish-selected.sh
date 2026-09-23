#!/usr/bin/env bash
set -uo pipefail

PUBLISH_JS="${PUBLISH_JS:-false}"
PUBLISH_NODE="${PUBLISH_NODE:-false}"
PUBLISH_PYTHON="${PUBLISH_PYTHON:-false}"
PUBLISH_RUST="${PUBLISH_RUST:-false}"
BEST_EFFORT="${BEST_EFFORT:-false}"
NPM_TOKEN="${NPM_TOKEN:-}"
PYPI_API_TOKEN="${PYPI_API_TOKEN:-}"
CRATES_IO_TOKEN="${CRATES_IO_TOKEN:-}"

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$REPO_ROOT"

js_outcome=skipped
node_outcome=skipped
python_outcome=skipped
rust_outcome=skipped
failures=()

status_to_outcome() {
  case "$1" in
    0) printf 'success' ;;
    130|143) printf 'cancelled' ;;
    *) printf 'failure' ;;
  esac
}

publish_js() (
  set -euo pipefail
  if [ -z "$NPM_TOKEN" ]; then
    echo "Cannot publish @aeko-chain/web3.js: NPM_TOKEN is not configured." >&2
    exit 2
  fi
  cd apps/sdk/js
  NODE_AUTH_TOKEN="$NPM_TOKEN" npm publish --access public --registry=https://registry.npmjs.org/
)

publish_node() (
  set -euo pipefail
  if [ -z "$NPM_TOKEN" ]; then
    echo "Cannot publish @aeko-chain/sdk: NPM_TOKEN is not configured." >&2
    exit 2
  fi
  cd apps/sdk/node
  NODE_AUTH_TOKEN="$NPM_TOKEN" npm publish --access public --registry=https://registry.npmjs.org/
)

publish_python() (
  set -euo pipefail
  if [ -z "$PYPI_API_TOKEN" ]; then
    echo "Cannot publish aeko-sdk: PYPI_API_TOKEN is not configured." >&2
    exit 2
  fi
  cd apps/sdk/python
  release_dir=$(mktemp -d)
  trap 'rm -rf "$release_dir"' EXIT
  python3 -m pip install --disable-pip-version-check build twine
  python3 -m build --outdir "$release_dir" .
  TWINE_USERNAME=__token__ TWINE_PASSWORD="$PYPI_API_TOKEN" \
    python3 -m twine upload "$release_dir"/*
)

publish_rust() (
  set -euo pipefail
  if [ -z "$CRATES_IO_TOKEN" ]; then
    echo "Cannot publish aeko-rust-sdk: CRATES_IO_TOKEN is not configured." >&2
    exit 2
  fi
  cargo publish --locked -p aeko-rust-sdk --token "$CRATES_IO_TOKEN"
)

run_publish() {
  local selected="$1" label="$2" outcome_var="$3" fn="$4"
  local status outcome

  if [ "$selected" != "true" ]; then return 0; fi

  echo "Attempting SDK publication: $label"
  "$fn"
  status=$?
  outcome=$(status_to_outcome "$status")
  printf -v "$outcome_var" '%s' "$outcome"
  if [ "$status" -ne 0 ]; then failures+=("${label}:${outcome}"); fi
  return 0
}

run_publish "$PUBLISH_JS" "@aeko-chain/web3.js -> npm" js_outcome publish_js
run_publish "$PUBLISH_NODE" "@aeko-chain/sdk -> npm" node_outcome publish_node
run_publish "$PUBLISH_PYTHON" "aeko-sdk -> PyPI" python_outcome publish_python
run_publish "$PUBLISH_RUST" "aeko-rust-sdk -> crates.io" rust_outcome publish_rust

printf 'SDK publication outcomes: js=%s node=%s python=%s rust=%s\n' \
  "$js_outcome" "$node_outcome" "$python_outcome" "$rust_outcome"

if [ "${#failures[@]}" -gt 0 ]; then
  printf 'SDK publication could not complete for:\n' >&2
  printf '  %s\n' "${failures[@]}" >&2
  if [ "$BEST_EFFORT" = "true" ]; then
    echo "SDK publication is best-effort in the main DevOps release; Docker promotion/deployment will continue." >&2
    exit 0
  fi
  exit 1
fi
