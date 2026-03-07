#!/usr/bin/env bash

set -e
cd "$(dirname "$0")"
SOLANA_ROOT="$(cd ../..; pwd)"

logDir="$PWD"/logs
rm -rf "$logDir"
mkdir "$logDir"

solanaInstallDataDir=$PWD/releases
solanaInstallGlobalOpts=(
  --data-dir "$solanaInstallDataDir"
  --config "$solanaInstallDataDir"/config.yml
  --no-modify-path
)

# Install all the aeko versions
bootstrapInstall() {
  declare v=$1
  if [[ ! -h $solanaInstallDataDir/active_release ]]; then
    sh "$SOLANA_ROOT"/install/aeko-install-init.sh "$v" "${solanaInstallGlobalOpts[@]}"
  fi
  export PATH="$solanaInstallDataDir/active_release/bin/:$PATH"
}

bootstrapInstall "edge"
aeko-install-init --version
aeko-install-init edge
aeko-gossip --version
aeko-dos --version

killall aeko-gossip || true
aeko-gossip spy --gossip-port 8001 > "$logDir"/gossip.log 2>&1 &
solanaGossipPid=$!
echo "aeko-gossip pid: $solanaGossipPid"
sleep 5
aeko-dos --mode gossip --data-type random --data-size 1232 &
dosPid=$!
echo "aeko-dos pid: $dosPid"

pass=true

SECONDS=
while ((SECONDS < 600)); do
  if ! kill -0 $solanaGossipPid; then
    echo "aeko-gossip is no longer running after $SECONDS seconds"
    pass=false
    break
  fi
  if ! kill -0 $dosPid; then
    echo "aeko-dos is no longer running after $SECONDS seconds"
    pass=false
    break
  fi
  sleep 1
done

kill $solanaGossipPid || true
kill $dosPid || true
wait || true

$pass && echo Pass
