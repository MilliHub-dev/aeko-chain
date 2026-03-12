#!/usr/bin/env bash

set -e
cd "$(dirname "$0")"
AEKO_ROOT="$(cd ../..; pwd)"

logDir="$PWD"/logs
rm -rf "$logDir"
mkdir "$logDir"

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

bootstrapInstall "edge"
aeko-install-init --version
aeko-install-init edge
aeko-gossip --version
aeko-dos --version

killall aeko-gossip || true
aeko-gossip spy --gossip-port 8001 > "$logDir"/gossip.log 2>&1 &
aekoGossipPid=$!
echo "aeko-gossip pid: $aekoGossipPid"
sleep 5
aeko-dos --mode gossip --data-type random --data-size 1232 &
dosPid=$!
echo "aeko-dos pid: $dosPid"

pass=true

SECONDS=
while ((SECONDS < 600)); do
  if ! kill -0 $aekoGossipPid; then
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

kill $aekoGossipPid || true
kill $dosPid || true
wait || true

$pass && echo Pass
