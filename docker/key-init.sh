#!/bin/sh
set -eu

KEYS_DIR=${AEKO_KEYS_DIR:-/keys}
LEDGER_DIR=${AEKO_LEDGER_DIR:-/ledger}

mkdir -p "$KEYS_DIR"

missing=0
for key in faucet-keypair.json stake-keypair.json validator-1-keypair.json vote-1-keypair.json; do
  [ -s "$KEYS_DIR/$key" ] || missing=1
done

# Never silently rotate validator identity underneath an existing chain.
if [ "$missing" -eq 1 ] && { [ -f "$LEDGER_DIR/genesis.bin" ] || [ -f "$LEDGER_DIR/genesis.tar.bz2" ]; }; then
  echo "error: persistent validator ledger exists but one or more persistent keypairs are missing" >&2
  echo "restore the original AEKO keypairs before starting this chain; automatic key rotation is intentionally blocked" >&2
  exit 66
fi

for key in faucet-keypair.json stake-keypair.json validator-1-keypair.json vote-1-keypair.json; do
  path="$KEYS_DIR/$key"
  if [ ! -s "$path" ]; then
    echo "==> Generating fresh persistent AEKO keypair: $key"
    aeko-keygen new --no-passphrase --silent --outfile "$path"
    chmod 600 "$path"
  fi

  if ! aeko-keygen pubkey "$path" >/dev/null 2>&1; then
    echo "error: invalid AEKO keypair: $path" >&2
    exit 65
  fi
done

echo "AEKO persistent key initialization complete"
