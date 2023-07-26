#!/bin/bash

set -ue

if [ $# -lt 2 ]; then
  echo "Usage: $(basename $0) <SNAPSHOT_DIR.SHA> <SNAPSHOT_DIR.CURRENT>"
  exit 1
fi

diff -r --brief "$1" "$2"
if [ $? -eq 0 ]; then
  echo "Snapshots match!"
fi
