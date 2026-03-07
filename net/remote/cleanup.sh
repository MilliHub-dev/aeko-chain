#!/usr/bin/env bash

set -x
! tmux list-sessions || tmux kill-session
declare sudo=
if sudo true; then
  sudo="sudo -n"
fi

echo "pwd: $(pwd)"
for pid in aeko/*.pid; do
  pgid=$(ps opgid= "$(cat "$pid")" | tr -d '[:space:]')
  if [[ -n $pgid ]]; then
    $sudo kill -- -"$pgid"
  fi
done
if [[ -f aeko/netem.cfg ]]; then
  aeko/scripts/netem.sh delete < aeko/netem.cfg
  rm -f aeko/netem.cfg
fi
aeko/scripts/net-shaper.sh cleanup
for pattern in validator.sh boostrap-leader.sh aeko- remote- iftop validator client node; do
  echo "killing $pattern"
  pkill -f $pattern
done
