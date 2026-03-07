#!/usr/bin/env bash
set -ex

cd "$(dirname "$0")"

# shellcheck source=net/scripts/aeko-user-authorized_keys.sh
source aeko-user-authorized_keys.sh

# aeko-user-authorized_keys.sh defines the public keys for users that should
# automatically be granted access to ALL datacenter nodes.
for i in "${!AEKO_USERS[@]}"; do
  echo "environment=\"AEKO_USER=${AEKO_USERS[i]}\" ${AEKO_PUBKEYS[i]}"
done

