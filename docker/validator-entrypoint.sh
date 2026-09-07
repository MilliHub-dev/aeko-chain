#!/usr/bin/env bash
set -euo pipefail

LEDGER_PATH=${AEKO_LEDGER_PATH:-/ledger}
IDENTITY_FILE=${AEKO_IDENTITY_FILE:-/keys/identity.json}
VOTE_FILE=${AEKO_VOTE_FILE:-/keys/vote.json}
STAKE_FILE=${AEKO_STAKE_FILE:-/keys/stake.json}
FAUCET_FILE=${AEKO_FAUCET_FILE:-/keys/faucet.json}
NODE_ROLE=${AEKO_NODE_ROLE:-validator}

require_file() {
  local path=$1
  local label=$2
  if [ ! -s "$path" ]; then
    echo "error: required ${label} keypair is missing or empty: ${path}" >&2
    exit 64
  fi
}

mkdir -p "$LEDGER_PATH"

if [ "${AEKO_RESET_LEDGER:-0}" = "1" ]; then
  echo "==> AEKO_RESET_LEDGER=1: clearing ${LEDGER_PATH}"
  find "$LEDGER_PATH" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

# Only the bootstrap validator creates genesis. RPC replicas and joining
# validators consume the existing cluster state instead.
if [ "${AEKO_BOOTSTRAP:-0}" = "1" ]; then
  require_file "$IDENTITY_FILE" "validator identity"
  require_file "$VOTE_FILE" "vote account"
  require_file "$STAKE_FILE" "stake account"
  require_file "$FAUCET_FILE" "faucet"

  if [ ! -f "$LEDGER_PATH/genesis.bin" ]; then
    echo "==> Creating AEKO genesis in ${LEDGER_PATH}"
    aeko-genesis \
      --ledger "$LEDGER_PATH" \
      --bootstrap-validator "$IDENTITY_FILE" "$VOTE_FILE" "$STAKE_FILE" \
      --faucet-pubkey "$FAUCET_FILE" \
      --faucet-lamports "${AEKO_GENESIS_FAUCET_LAMPORTS:-500000000000000000}" \
      --hashes-per-tick sleep \
      --cluster-type "${AEKO_CLUSTER_TYPE:-development}"
  else
    echo "==> Existing genesis found; preserving ledger"
  fi
fi

# Explicit command-line arguments always win. This keeps the image compatible
# with advanced validator invocations while making the normal roles safe by
# default when no command is supplied.
if [ "$#" -eq 0 ]; then
  case "$NODE_ROLE" in
    validator)
      require_file "$IDENTITY_FILE" "validator identity"
      require_file "$VOTE_FILE" "vote account"
      set -- \
        --identity "$IDENTITY_FILE" \
        --vote-account "$VOTE_FILE" \
        --ledger "$LEDGER_PATH" \
        --rpc-port "${AEKO_RPC_PORT:-8899}" \
        --rpc-bind-address "${AEKO_RPC_BIND_ADDRESS:-0.0.0.0}" \
        --gossip-port "${AEKO_GOSSIP_PORT:-8001}" \
        --rpc-faucet-address "${AEKO_FAUCET_ADDRESS:-faucet:9900}" \
        --full-rpc-api \
        --enable-rpc-transaction-history \
        --enable-extended-tx-metadata-storage \
        --rpc-pubsub-enable-block-subscription \
        --rpc-pubsub-enable-vote-subscription \
        --limit-ledger-size "${AEKO_LEDGER_LIMIT:-200000000}" \
        --no-wait-for-vote-to-start-leader \
        --allow-private-addr \
        --log - \
        --no-os-network-limits-test
      ;;
    rpc)
      require_file "$IDENTITY_FILE" "RPC node identity"
      : "${AEKO_ENTRYPOINT:?AEKO_ENTRYPOINT is required when AEKO_NODE_ROLE=rpc}"
      set -- \
        --identity "$IDENTITY_FILE" \
        --no-voting \
        --ledger "$LEDGER_PATH" \
        --rpc-port "${AEKO_RPC_PORT:-8899}" \
        --rpc-bind-address "${AEKO_RPC_BIND_ADDRESS:-0.0.0.0}" \
        --gossip-port "${AEKO_GOSSIP_PORT:-8001}" \
        --entrypoint "$AEKO_ENTRYPOINT" \
        --rpc-faucet-address "${AEKO_FAUCET_ADDRESS:-faucet:9900}" \
        --full-rpc-api \
        --enable-rpc-transaction-history \
        --enable-extended-tx-metadata-storage \
        --rpc-pubsub-enable-block-subscription \
        --rpc-pubsub-enable-vote-subscription \
        --limit-ledger-size "${AEKO_LEDGER_LIMIT:-200000000}" \
        --allow-private-addr \
        --log - \
        --no-os-network-limits-test
      ;;
    *)
      echo "error: unsupported AEKO_NODE_ROLE=${NODE_ROLE}; expected validator or rpc" >&2
      exit 64
      ;;
  esac

  # Docker bridge deployments must explicitly advertise the host address and
  # publish the same validator transport range. These flags are opt-in so the
  # portable/local compose retains its existing behavior.
  if [ -n "${AEKO_GOSSIP_HOST:-}" ]; then
    set -- "$@" --gossip-host "$AEKO_GOSSIP_HOST"
  fi
  if [ -n "${AEKO_DYNAMIC_PORT_RANGE:-}" ]; then
    set -- "$@" --dynamic-port-range "$AEKO_DYNAMIC_PORT_RANGE"
  fi
  if [ -n "${AEKO_PUBLIC_RPC_ADDRESS:-}" ]; then
    set -- "$@" --public-rpc-address "$AEKO_PUBLIC_RPC_ADDRESS"
  fi
fi

exec aeko-validator "$@"
