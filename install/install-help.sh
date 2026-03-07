#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"/..
cargo="$(readlink -f "./cargo")"

"$cargo" build --package aeko-install
export PATH=$PWD/target/debug:$PATH

echo "\`\`\`manpage"
aeko-install --help
echo "\`\`\`"
echo ""

commands=(init info deploy update run)

for x in "${commands[@]}"; do
    echo "\`\`\`manpage"
    aeko-install "${x}" --help
    echo "\`\`\`"
    echo ""
done
