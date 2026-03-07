#!/usr/bin/env bash
set -ex

[[ $(uname) = Linux ]] || exit 1
[[ $USER = root ]] || exit 1

[[ -d /home/aeko/.ssh ]] || exit 1

if [[ ${#AEKO_PUBKEYS[@]} -eq 0 ]]; then
  echo "Warning: source aeko-user-authorized_keys.sh first"
fi

# aeko-user-authorized_keys.sh defines the public keys for users that should
# automatically be granted access to ALL testnets
for key in "${AEKO_PUBKEYS[@]}"; do
  echo "$key" >> /aeko-scratch/authorized_keys
done

sudo -u aeko bash -c "
  cat /aeko-scratch/authorized_keys >> /home/aeko/.ssh/authorized_keys
"
