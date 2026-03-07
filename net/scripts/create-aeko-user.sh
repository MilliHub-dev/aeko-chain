#!/usr/bin/env bash
set -ex

[[ $(uname) = Linux ]] || exit 1
[[ $USER = root ]] || exit 1

if grep -q aeko /etc/passwd ; then
  echo "User aeko already exists"
else
  adduser aeko --gecos "" --disabled-password --quiet
  adduser aeko sudo
  adduser aeko adm
  echo "aeko ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
  id aeko

  [[ -r /aeko-scratch/id_ecdsa ]] || exit 1
  [[ -r /aeko-scratch/id_ecdsa.pub ]] || exit 1

  sudo -u aeko bash -c "
    echo 'PATH=\"/home/aeko/.cargo/bin:$PATH\"' > /home/aeko/.profile
    mkdir -p /home/aeko/.ssh/
    cd /home/aeko/.ssh/
    cp /aeko-scratch/id_ecdsa.pub authorized_keys
    umask 377
    cp /aeko-scratch/id_ecdsa id_ecdsa
    echo \"
      Host *
      BatchMode yes
      IdentityFile ~/.ssh/id_ecdsa
      StrictHostKeyChecking no
    \" > config
  "
fi
