#!/bin/sh
set -eu
umask 077

keys_root=${AEKO_KEYS_ROOT:-/keys}
protocol_state_root=${AEKO_PROTOCOL_STATE_ROOT:-/protocol-state}
protocol_continuity_root=${AEKO_PROTOCOL_CONTINUITY_ROOT:-/protocol-continuity}
keys_source=${AEKO_KEYS_SOURCE:-<unknown host source>}

parse_bool() {
  name="$1"
  raw="$2"
  value="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    ""|0|false|no|off) printf '0' ;;
    1|true|yes|on) printf '1' ;;
    *)
      echo "error: ${name} must be boolean (0/1, true/false, yes/no, on/off)" >&2
      exit 64
      ;;
  esac
}

allow_chain_key_generation="$(parse_bool AEKO_ALLOW_CHAIN_KEY_GENERATION "${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}")"
reset_ledger="$(parse_bool AEKO_RESET_LEDGER "${AEKO_RESET_LEDGER:-0}")"

echo "AEKO key preflight: host source '${keys_source}' is mounted at ${keys_root}"

mkdir -p "$keys_root"

for key in \
  faucet-keypair.json \
  stake-keypair.json \
  validator-1-keypair.json \
  vote-1-keypair.json
do
  path="$keys_root/$key"
  if [ ! -f "$path" ] || [ ! -s "$path" ]; then
    if [ "$allow_chain_key_generation" != "1" ]; then
      echo "error: required persistent AEKO chain key is missing, empty, or not a regular file: $path" >&2
      echo "error: refusing to generate a replacement chain identity during normal redeploy" >&2
      echo "hint: restore all four established AEKO chain keypair JSON files in '${keys_source}'" >&2
      echo "hint: set AEKO_ALLOW_CHAIN_KEY_GENERATION=1 only for an intentional first boot" >&2
      ls -la "$keys_root" >&2 || true
      exit 64
    fi
    echo "==> Initializing first-boot AEKO chain key: $key"
    aeko-keygen new --no-bip39-passphrase --silent --outfile "$path"
  fi

  if ! aeko-keygen pubkey "$path" >/dev/null 2>&1; then
    echo "error: invalid AEKO keypair: $path" >&2
    exit 65
  fi
  echo "validated $key"
done

protocol_path="$keys_root/protocol-authority-keypair.json"
state_registry="$protocol_state_root/protocol-registry.env"
continuity_registry="$protocol_continuity_root/protocol-registry.anchor"
protocol_registry=""

if [ "$reset_ledger" = "1" ]; then
  echo "AEKO key preflight: intentional chain reset requested; persisted protocol state/continuity identity will be replaced after the validator creates the reset genesis"
else
  if [ -s "$state_registry" ] && [ -s "$continuity_registry" ]; then
    state_registry_contents="$(cat "$state_registry")"
    continuity_registry_contents="$(cat "$continuity_registry")"
    if [ "$state_registry_contents" != "$continuity_registry_contents" ]; then
      echo "error: protocol registry and continuity anchor disagree" >&2
      echo "error: restore the correct protocol-state/protocol-continuity volumes before redeploying" >&2
      exit 65
    fi
    protocol_registry="$state_registry"
  elif [ -s "$state_registry" ]; then
    protocol_registry="$state_registry"
  elif [ -s "$continuity_registry" ]; then
    protocol_registry="$continuity_registry"
  fi
fi

if [ ! -f "$protocol_path" ] || [ ! -s "$protocol_path" ]; then
  if [ -n "$protocol_registry" ]; then
    echo "error: protocol authority key is missing but established protocol identity exists in $protocol_registry" >&2
    echo "error: refusing to replace an established protocol authority" >&2
    exit 64
  fi

  echo "==> Initializing AEKO protocol authority for a network with no established protocol registry"
  aeko-keygen new --no-bip39-passphrase --silent --outfile "$protocol_path"
fi

if [ -f "$protocol_path" ] && [ -s "$protocol_path" ]; then
  if ! actual_protocol_authority="$(aeko-keygen pubkey "$protocol_path" 2>/dev/null)"; then
    echo "error: invalid AEKO protocol authority keypair: $protocol_path" >&2
    exit 65
  fi

  if [ -n "$protocol_registry" ]; then
    expected_protocol_authority="$(sed -n 's/^AEKO_PROTOCOL_AUTHORITY=//p' "$protocol_registry" | head -n 1)"
    if [ -z "$expected_protocol_authority" ]; then
      echo "error: $protocol_registry is missing AEKO_PROTOCOL_AUTHORITY" >&2
      exit 65
    fi
    if [ "$actual_protocol_authority" != "$expected_protocol_authority" ]; then
      echo "error: protocol authority key does not match established protocol identity" >&2
      echo "error: expected $expected_protocol_authority, got $actual_protocol_authority" >&2
      exit 65
    fi
  fi

  echo "validated protocol-authority-keypair.json"
fi

echo "AEKO key preflight complete"
