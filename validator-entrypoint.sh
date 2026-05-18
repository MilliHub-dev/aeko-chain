#!/bin/bash
set -e

# One-time ledger wipe trigger. Set AEKO_RESET_LEDGER=1 in Coolify's Environment
# Variables tab, redeploy once, then unset it. Required when the on-disk ledger
# was created by a binary whose builtin set differs from the current binary
# (otherwise the validator panics at bank.rs:3914 "Can't change frozen bank by
# adding not-existing new builtin program"). Persistent volumes survive force-
# deploys, so without this escape hatch the only fix would be terminal access.
if [ "${AEKO_RESET_LEDGER}" = "1" ]; then
  echo "==> AEKO_RESET_LEDGER=1: wiping /ledger contents (one-time chain reset)"
  # Clear contents but keep the mountpoint so the volume binding stays intact.
  find /ledger -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  echo "==> /ledger wiped."
fi

# Bootstrap validator-1: create genesis on first run if ledger is empty
if [ "${AEKO_BOOTSTRAP}" = "1" ]; then
  if [ ! -f /ledger/genesis.bin ]; then
    echo "==> Creating genesis block..."
    aeko-genesis \
      --ledger /ledger \
      --bootstrap-validator /keys/identity.json /keys/vote.json /keys/stake.json \
      --faucet-pubkey /keys/faucet.json \
      --faucet-lamports 500000000000000000 \
      --hashes-per-tick sleep \
      --cluster-type development
    echo "==> Genesis block created successfully."
  else
    echo "==> Ledger exists, skipping genesis creation."
  fi
fi

exec aeko-validator "$@"
