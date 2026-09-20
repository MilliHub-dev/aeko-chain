#!/usr/bin/env bash
set -uo pipefail

SDK_JS="${SDK_JS:-false}"
SDK_NODE="${SDK_NODE:-false}"
SDK_PYTHON="${SDK_PYTHON:-false}"
RELEASE_JS="${RELEASE_JS:-false}"
RELEASE_NODE="${RELEASE_NODE:-false}"
RELEASE_PYTHON="${RELEASE_PYTHON:-false}"
RESULT_FILE="${RESULT_FILE:-}"

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}"

sdk_js_outcome="skipped"
sdk_node_outcome="skipped"
sdk_python_outcome="skipped"

status_to_outcome() {
  case "$1" in
    0) printf 'success' ;;
    130|143) printf 'cancelled' ;;
    *) printf 'failure' ;;
  esac
}

validate_js() (
  set -euo pipefail
  cd apps/sdk/js
  npm ci
  npm run release:check
  npm test --if-present
  npm pack --dry-run

  if [ "${RELEASE_JS}" = "true" ]; then
    package=$(node -p "require('./package.json').name")
    version=$(node -p "require('./package.json').version")
    err=$(mktemp)
    trap 'rm -f "$err"' EXIT
    if npm view "${package}@${version}" version --registry=https://registry.npmjs.org/ >/dev/null 2>"$err"; then
      echo "${package}@${version} already exists on npm. Bump the package version before release." >&2
      exit 1
    fi
    if ! grep -Eq 'E404|404 Not Found|is not in this registry' "$err"; then
      cat "$err" >&2
      echo "Unable to prove npm version availability for ${package}@${version}." >&2
      exit 1
    fi
  fi
)

validate_node() (
  set -euo pipefail
  cd apps/sdk/node
  npm ci
  npm run release:check
  npm pack --dry-run

  if [ "${RELEASE_NODE}" = "true" ]; then
    package=$(node -p "require('./package.json').name")
    version=$(node -p "require('./package.json').version")
    err=$(mktemp)
    trap 'rm -f "$err"' EXIT
    if npm view "${package}@${version}" version --registry=https://registry.npmjs.org/ >/dev/null 2>"$err"; then
      echo "${package}@${version} already exists on npm. Bump the package version before release." >&2
      exit 1
    fi
    if ! grep -Eq 'E404|404 Not Found|is not in this registry' "$err"; then
      cat "$err" >&2
      echo "Unable to prove npm version availability for ${package}@${version}." >&2
      exit 1
    fi
  fi
)

validate_python() (
  set -euo pipefail
  cd apps/sdk/python
  python3 -m compileall -q src

  wheel_dir=$(mktemp -d)
  install_dir=$(mktemp -d)
  trap 'rm -rf "$wheel_dir" "$install_dir"' EXIT
  python3 -m pip wheel --disable-pip-version-check --no-deps . --wheel-dir "$wheel_dir"
  wheel=$(find "$wheel_dir" -maxdepth 1 -name '*.whl' -print -quit)
  test -n "$wheel"
  python3 -m pip install --disable-pip-version-check --no-deps --target "$install_dir" "$wheel"
  PYTHONPATH="$install_dir" python3 -c 'import aeko_sdk; print(aeko_sdk.__name__)'

  if [ "${RELEASE_PYTHON}" = "true" ]; then
    version=$(python3 - <<'PY'
import pathlib, tomllib
print(tomllib.loads(pathlib.Path('pyproject.toml').read_text())['project']['version'])
PY
    )
    status=$(curl -sS -o /dev/null -w '%{http_code}' "https://pypi.org/pypi/aeko-sdk/${version}/json")
    case "$status" in
      404) ;;
      200)
        echo "aeko-sdk==${version} already exists on PyPI. Bump the package version before release." >&2
        exit 1
        ;;
      *)
        echo "Unable to prove PyPI version availability for aeko-sdk==${version}; HTTP ${status}." >&2
        exit 1
        ;;
    esac
  fi
)

run_domain() {
  local selected="$1"
  local domain="$2"
  local fn="$3"
  local status outcome

  if [ "$selected" != "true" ]; then
    return 0
  fi

  echo "Validating ${domain}."
  "$fn"
  status=$?
  outcome=$(status_to_outcome "$status")
  printf -v "${domain}_outcome" '%s' "$outcome"
  return 0
}

run_domain "$SDK_JS" sdk_js validate_js
run_domain "$SDK_NODE" sdk_node validate_node
run_domain "$SDK_PYTHON" sdk_python validate_python

if [ -n "$RESULT_FILE" ]; then
  {
    echo "sdk_js_outcome=$sdk_js_outcome"
    echo "sdk_node_outcome=$sdk_node_outcome"
    echo "sdk_python_outcome=$sdk_python_outcome"
  } > "$RESULT_FILE"
fi

printf 'Non-Rust SDK outcomes: js=%s node=%s python=%s\n' \
  "$sdk_js_outcome" "$sdk_node_outcome" "$sdk_python_outcome"

case "$sdk_js_outcome:$sdk_node_outcome:$sdk_python_outcome" in
  *failure*|*cancelled*) exit 1 ;;
esac
