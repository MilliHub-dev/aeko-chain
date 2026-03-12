#!/usr/bin/env bash
#
# Basic empirical ABI system test - can validators on all supported versions of
# Aeko talk to each other?
#

set -e
cd "$(dirname "$0")"
AEKO_ROOT="$(cd ../..; pwd)"

logDir="$PWD"/logs
ledgerDir="$PWD"/config
rm -rf "$ledgerDir" "$logDir"
mkdir -p "$logDir"

baselineVersion=1.1.18  # <-- oldest version we remain compatible with
otherVersions=(
  beta
  edge
)

aekoInstallDataDir=$PWD/releases
aekoInstallGlobalOpts=(
  --data-dir "$aekoInstallDataDir"
  --config "$aekoInstallDataDir"/config.yml
  --no-modify-path
)

# Install all the aeko versions
bootstrapInstall() {
  declare v=$1
  if [[ ! -h $aekoInstallDataDir/active_release ]]; then
    sh "$AEKO_ROOT"/install/aeko-install-init.sh "$v" "${aekoInstallGlobalOpts[@]}"
  fi
  export PATH="$aekoInstallDataDir/active_release/bin/:$PATH"
}

bootstrapInstall "$baselineVersion"
for v in "${otherVersions[@]}"; do
  aeko-install-init "${aekoInstallGlobalOpts[@]}" "$v"
  aeko -V
done


ORIGINAL_PATH=$PATH
aekoInstallUse() {
  declare version=$1
  echo "--- Now using aeko $version"
  AEKO_BIN="$aekoInstallDataDir/releases/$version/aeko-release/bin"
  export PATH="$AEKO_BIN:$ORIGINAL_PATH"
}

killSession() {
  tmux kill-session -t abi || true
}

export RUST_BACKTRACE=1

# Start up the bootstrap validator using the baseline version
aekoInstallUse "$baselineVersion"
echo "--- Starting $baselineVersion bootstrap validator"
trap 'killSession' INT TERM ERR EXIT
killSession
(
  set -x
  if [[ ! -x baseline-run.sh ]]; then
    curl https://raw.githubusercontent.com/aeko-labs/aeko/v"$baselineVersion"/run.sh -o baseline-run.sh
    chmod +x baseline-run.sh
  fi
  tmux new -s abi -d " \
    ./baseline-run.sh 2>&1 | tee $logDir/$baselineVersion.log \
  "

  SECONDS=
  while [[ ! -f config/baseline-run/init-completed ]]; do
    sleep 5
    if [[ $SECONDS -gt 60 ]]; then
      echo "Error: validator failed to start"
      exit 1
    fi
  done

  aeko --url http://127.0.0.1:8899 show-validators
)

# Ensure all versions can see the bootstrap validator
for v in "${otherVersions[@]}"; do
  aekoInstallUse "$v"
  echo "--- Looking for bootstrap validator on gossip"
  (
    set -x
    "$AEKO_BIN"/aeko-gossip spy \
      --entrypoint 127.0.0.1:8001 \
      --num-nodes-exactly 1 \
      --timeout 30
  )
  echo Ok
done

# Start a validator for each version and look for it
#
# Once https://github.com/aeko-labs/aeko/issues/7738 is resolved, remove
# `--no-snapshot-fetch` when starting the validators
#
nodeCount=1
for v in "${otherVersions[@]}"; do
  nodeCount=$((nodeCount + 1))
  aekoInstallUse "$v"
  # start another validator
  ledger="$ledgerDir"/ledger-"$v"
  rm -rf "$ledger"
  echo "--- Looking for $nodeCount validators on gossip"
  (
    set -x
    tmux new-window -t abi -n "$v" " \
      $AEKO_BIN/aeko-validator \
      --ledger $ledger \
      --no-snapshot-fetch \
      --entrypoint 127.0.0.1:8001 \
      -o - 2>&1 | tee $logDir/$v.log \
    "
    "$AEKO_BIN"/aeko-gossip spy \
      --entrypoint 127.0.0.1:8001 \
      --num-nodes-exactly $nodeCount \
      --timeout 30

    # Wait for it to make a snapshot root
    SECONDS=
    while [[ ! -d $ledger/snapshot ]]; do
      sleep 5
      if [[ $SECONDS -gt 60 ]]; then
        echo "Error: validator failed to create a snapshot"
        exit 1
      fi
    done
  )
  echo Ok
done

# Terminate all the validators
killSession

echo
echo Pass
exit 0
