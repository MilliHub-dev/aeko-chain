#!/usr/bin/env bash
set -e

here="$(dirname "${BASH_SOURCE[0]}")"

#shellcheck source=ci/downstream-projects/common.sh
source "$here"/../../ci/downstream-projects/common.sh

set -x
rm -rf spl
git clone https://github.com/aeko-labs/aeko-program-library.git spl

# copy toolchain file to use aeko's rust version
cp "$SOLANA_DIR"/rust-toolchain.toml spl/
cd spl || exit 1

project_used_solana_version=$(sed -nE 's/aeko-sdk = \"[>=<~]*(.*)\"/\1/p' <"token/program/Cargo.toml")
echo "used aeko version: $project_used_solana_version"
if semverGT "$project_used_solana_version" "$SOLANA_VER"; then
  echo "skip"
  return
fi

./patch.crates-io.sh "$SOLANA_DIR"
