#!/usr/bin/env bash
set -euo pipefail

HOST_BUILD="${HOST_BUILD:-true}"
REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "${REPO_ROOT}/apps/admin"

npm ci
npm run lint --if-present
npx tsc --noEmit
npm test --if-present

if [ "${HOST_BUILD}" = "true" ]; then
  npm run build
fi
