#!/usr/bin/env bash
#
# Convenience script to easily deploy a software update to a testnet
#
set -e
aeko_ROOT="$(cd "$(dirname "$0")"/..; pwd)"

maybeKeypair=
while [[ ${1:0:2} = -- ]]; do
  if [[ $1 = --keypair && -n $2 ]]; then
    maybeKeypair="$1 $2"
    shift 2
  else
    echo "Error: Unknown option: $1"
    exit 1
  fi
done

URL=$1
TAG=$2
OS=${3:-linux}

if [[ -z $URL || -z $TAG ]]; then
  echo "Usage: $0 [testnet|localhost|RPC URL] [edge|beta|release tag] [linux|osx|windows]"
  exit 0
fi

if [[ ! -f update_manifest_keypair.json ]]; then
  "$aeko_ROOT"/scripts/aeko-install-update-manifest-keypair.sh "$OS"
fi

case "$OS" in
osx)
  TARGET=x86_64-apple-darwin
  ;;
linux)
  TARGET=x86_64-unknown-linux-gnu
  ;;
windows)
  TARGET=x86_64-pc-windows-msvc
  ;;
*)
  TARGET=unknown-unknown-unknown
  ;;
esac

case $URL in
testnet)
  URL=https://rpc.aeko.online
  ;;
localhost)
  URL=http://localhost:8899
  ;;
*)
  ;;
esac

case $TAG in
edge|beta)
  DOWNLOAD_URL=https://release.aeko.com/"$TAG"/aeko-release-$TARGET.tar.bz2
  ;;
*)
  DOWNLOAD_URL=https://github.com/MilliHub-dev/aeko-chain/releases/download/"$TAG"/aeko-release-$TARGET.tar.bz2
  ;;
esac

# Prefer possible `cargo build` binaries over PATH binaries
PATH="$aeko_ROOT"/target/debug:$PATH

set -x
# shellcheck disable=SC2086 # Don't want to double quote $maybeKeypair
balance=$(aeko $maybeKeypair --url "$URL" balance --lamports)
if [[ $balance = "0 lamports" ]]; then
  if [[ $URL = http://localhost:8899 || $URL = http://127.0.0.1:8899 ]]; then
    # Local/custom validators may expose the low-level requestAirdrop flow.
    # shellcheck disable=SC2086 # Don't want to double quote $maybeKeypair
    aeko $maybeKeypair --url "$URL" airdrop 0.000000042
  else
    echo "Payer account is empty. Fund it through the network's approved funding flow before deploying the update manifest." >&2
    echo "AEKO public testnet funding: https://scan.aeko.online/api/explorer/testnet/funding/request" >&2
    exit 1
  fi
fi

# shellcheck disable=SC2086 # Don't want to double quote $maybeKeypair
aeko-install deploy $maybeKeypair --url "$URL" "$DOWNLOAD_URL" update_manifest_keypair.json
