#!/usr/bin/env bash
set -euo pipefail

VALIDATE_SOURCE="${VALIDATE_SOURCE:-true}"
BUILD_IMAGE="${BUILD_IMAGE:-false}"
PUBLISH="${PUBLISH:-false}"
REGISTRY_USER="${REGISTRY_USER:-}"
: "${SHA_TAG:?SHA_TAG is required}"

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}"

if [ "${PUBLISH}" = "true" ]; then
  if [ "${GITHUB_REF}" != "refs/heads/main" ] || [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
    echo "Explorer UI publication is permitted only from main." >&2
    exit 1
  fi
fi

if [ "${VALIDATE_SOURCE}" = "true" ]; then
  (
    cd apps/explorer/web
    npm ci
  )

  (
    cd apps/explorer/web
    set -euo pipefail

    if [ "${GITHUB_EVENT_NAME}" = "workflow_dispatch" ]; then
      npm run lint
      exit 0
    fi

    if [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
      BASE_SHA=$(jq -r '.pull_request.base.sha // empty' "${GITHUB_EVENT_PATH}")
      HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "${GITHUB_EVENT_PATH}")
    else
      BASE_SHA=$(jq -r '.before // empty' "${GITHUB_EVENT_PATH}")
      HEAD_SHA="${GITHUB_SHA}"
    fi

    if [ -z "${BASE_SHA}" ] || [ -z "${HEAD_SHA}" ] || [[ "${BASE_SHA}" =~ ^0+$ ]] || ! git -C "${REPO_ROOT}" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
      npm run lint
      exit 0
    fi

    mapfile -t changed < <(
      git -C "${REPO_ROOT}" diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- apps/explorer/web
    )

    for file in "${changed[@]}"; do
      case "${file}" in
        apps/explorer/web/eslint.config.js|apps/explorer/web/package.json|apps/explorer/web/package-lock.json)
          npm run lint
          exit 0
          ;;
      esac
    done

    lint_files=()
    for file in "${changed[@]}"; do
      case "${file}" in
        apps/explorer/web/src/*.js|apps/explorer/web/src/*.jsx|apps/explorer/web/src/**/*.js|apps/explorer/web/src/**/*.jsx)
          relative="${file#apps/explorer/web/}"
          if [ -f "${relative}" ]; then
            lint_files+=("${relative}")
          fi
          ;;
      esac
    done

    if [ "${#lint_files[@]}" -eq 0 ]; then
      echo "No changed Explorer JavaScript/JSX files to lint."
      exit 0
    fi

    printf 'Linting changed Explorer files:\n'
    printf '  %s\n' "${lint_files[@]}"
    ./node_modules/.bin/eslint "${lint_files[@]}"
  )

  (
    cd apps/explorer/web
    set -euo pipefail

    mapfile -d '' sources < <(
      find src -type f \( -name '*.js' -o -name '*.jsx' \) ! -name '*.test.js' -print0
    )
    test "${#sources[@]}" -gt 0

    diagnostics=$(mktemp)
    trap 'rm -f "${diagnostics}"' EXIT
    set +e
    npx --yes --package=typescript@5.9.3 tsc \
      --noEmit \
      --allowJs \
      --checkJs \
      --jsx react-jsx \
      --target ES2022 \
      --module ESNext \
      --moduleResolution Bundler \
      --lib ES2022,DOM,DOM.Iterable \
      --types vite/client \
      --skipLibCheck \
      "${sources[@]}" >"${diagnostics}" 2>&1
    typecheck_status=$?
    set -e

    if [ "${typecheck_status}" -eq 0 ]; then
      echo "Explorer production JavaScript type-check passed with no diagnostics."
      exit 0
    fi

    if [ "${GITHUB_EVENT_NAME}" = "workflow_dispatch" ]; then
      cat "${diagnostics}"
      exit "${typecheck_status}"
    fi

    if [ "${GITHUB_EVENT_NAME}" = "pull_request" ]; then
      BASE_SHA=$(jq -r '.pull_request.base.sha // empty' "${GITHUB_EVENT_PATH}")
      HEAD_SHA=$(jq -r '.pull_request.head.sha // empty' "${GITHUB_EVENT_PATH}")
    else
      BASE_SHA=$(jq -r '.before // empty' "${GITHUB_EVENT_PATH}")
      HEAD_SHA="${GITHUB_SHA}"
    fi

    if [ -z "${BASE_SHA}" ] || [ -z "${HEAD_SHA}" ] || [[ "${BASE_SHA}" =~ ^0+$ ]] || ! git -C "${REPO_ROOT}" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
      cat "${diagnostics}"
      exit "${typecheck_status}"
    fi

    mapfile -t changed < <(
      git -C "${REPO_ROOT}" diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- apps/explorer/web/src
    )

    changed_type_errors=0
    for file in "${changed[@]}"; do
      case "${file}" in
        apps/explorer/web/src/*.js|apps/explorer/web/src/*.jsx|apps/explorer/web/src/**/*.js|apps/explorer/web/src/**/*.jsx)
          case "${file}" in
            *.test.js) continue ;;
          esac
          relative="${file#apps/explorer/web/}"
          if grep -F "${relative}(" "${diagnostics}" >/dev/null; then
            grep -F "${relative}(" "${diagnostics}" >&2 || true
            changed_type_errors=1
          fi
          ;;
      esac
    done

    if [ "${changed_type_errors}" -ne 0 ]; then
      echo "TypeScript found diagnostics in Explorer production files changed by this change set." >&2
      exit 1
    fi

    echo "TypeScript diagnostics are confined to unchanged legacy files; no changed production file introduced a diagnostic."
  )

  (
    cd apps/explorer/web
    npm test
  )

  if [ "${BUILD_IMAGE}" != "true" ]; then
    (
      cd apps/explorer/web
      npm run build
    )
  fi
fi

if [ "${BUILD_IMAGE}" = "true" ]; then
  tags=()
  output=(--load)

  if [ "${PUBLISH}" = "true" ]; then
    : "${REGISTRY_USER:?REGISTRY_USER is required when publishing}"
    tags+=(--tag "${REGISTRY_USER}/aeko-explorer-ui:${SHA_TAG}")
    output=(--push)
  else
    tags+=(--tag "aeko-ci/aeko-explorer-ui:${SHA_TAG}")
  fi

  docker buildx build \
    --file docker/Dockerfile \
    --target explorer-ui \
    "${tags[@]}" \
    "${output[@]}" \
    .
fi

if [ "${BUILD_IMAGE}" = "true" ] && [ "${PUBLISH}" != "true" ]; then
  docker image inspect "aeko-ci/aeko-explorer-ui:${SHA_TAG}" >/dev/null
fi
