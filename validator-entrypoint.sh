#!/bin/bash
set -e

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
