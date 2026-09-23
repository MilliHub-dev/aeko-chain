#!/usr/bin/env bash
set -euo pipefail

validator=${1:-}
if [ -z "$validator" ]; then
  validator=$(docker ps --format '{{.Names}}' | grep -E '(^|[-_])validator([-_]|$)' | head -1 || true)
fi
if [ -z "$validator" ]; then
  echo "error: no running validator container found; pass its container name as the first argument" >&2
  exit 64
fi

echo "==> validator: $validator"
docker inspect "$validator" --format 'status={{.State.Status}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'

echo
echo "==> /ledger mount"
docker inspect "$validator" \
  --format '{{range .Mounts}}{{if eq .Destination "/ledger"}}{{println "type=" .Type "name=" .Name "source=" .Source "destination=" .Destination}}{{end}}{{end}}'

echo
echo "==> ledger continuity"
docker exec "$validator" sh -lc '
set -eu
if [ ! -s /ledger/genesis.bin ]; then
  echo "ERROR: /ledger/genesis.bin is missing or empty" >&2
  exit 66
fi
echo "genesis.bin: PRESENT"
df -h /ledger
du -sh /ledger 2>/dev/null || true
'

echo
echo "==> Docker storage root"
docker_root=$(docker info --format '{{.DockerRootDir}}')
echo "Docker root: $docker_root"
df -h "$docker_root"

echo
echo "==> validator-ledger volume candidates"
docker volume ls --format '{{.Name}}' | grep 'validator-ledger' || true

if [ -d /data/aeko/keys ]; then
  echo
  echo "==> persisted chain key fingerprints"
  missing=0
  for key in validator-1-keypair.json vote-1-keypair.json stake-keypair.json faucet-keypair.json; do
    path="/data/aeko/keys/$key"
    if [ ! -s "$path" ]; then
      echo "MISSING: $path" >&2
      missing=1
      continue
    fi
    sha256sum "$path"
  done
  if [ "$missing" -ne 0 ]; then
    exit 67
  fi
fi

echo
echo "Storage audit passed: the running validator has an existing genesis and the current storage identity is shown above."
