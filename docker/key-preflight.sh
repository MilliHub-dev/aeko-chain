#!/bin/sh
set -eu

keys_source=${AEKO_KEYS_SOURCE:-<unknown host source>}
echo "AEKO key preflight: host source '${keys_source}' is mounted at /keys"

for key in \
  faucet-keypair.json \
  stake-keypair.json \
  validator-1-keypair.json \
  vote-1-keypair.json
do
  path="/keys/${key}"
  if [ ! -f "${path}" ] || [ ! -s "${path}" ]; then
    echo "error: required AEKO keypair is missing, empty, or not a regular file: ${path}" >&2
    echo "hint: populate the deployment-host directory '${keys_source}' with all four existing AEKO keypair JSON files before redeploying" >&2
    echo "mounted /keys currently contains:" >&2
    ls -la /keys >&2 || true
    exit 64
  fi

  if ! aeko-keygen pubkey "${path}" >/dev/null 2>&1; then
    echo "error: invalid AEKO keypair: ${path}" >&2
    exit 65
  fi

  echo "validated ${key}"
done

echo "AEKO key preflight complete"
