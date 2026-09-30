#!/bin/sh
set -eu

state_dir="${AEKO_BOOTSTRAP_STATE_DIR:-${AEKO_BOOTSTRAP_OUT_DIR:-${AEKO_PROTOCOL_OUT_DIR:-}}}"
if [ -z "$state_dir" ]; then
  echo "error: bootstrap state directory is not configured" >&2
  exit 64
fi

if [ "$#" -eq 0 ]; then
  echo "error: bootstrap command is required" >&2
  exit 64
fi

ready_path="$state_dir/.aeko-bootstrap-runtime-ready"
binding_path="$state_dir/.aeko-chain-binding"
ready_tmp="$ready_path.tmp.$$"

cleanup() {
  rm -f -- "$ready_tmp"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$state_dir"
rm -f -- "$ready_path"

"$@"

if [ ! -s "$binding_path" ]; then
  echo "error: bootstrap completed without a non-empty chain binding at $binding_path" >&2
  exit 70
fi

cp "$binding_path" "$ready_tmp"
mv -f "$ready_tmp" "$ready_path"
trap - EXIT HUP INT TERM
