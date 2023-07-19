#!/bin/bash

set -ue

TO_BLOCK=${TO_BLOCK:-17199975}
CHAINS=${CHAINS:-mainnet}

function is_stage_empty() {
  git diff-index --quiet --cached HEAD --
}

function is_worktree_clean() {
  git diff-files --quiet
}

function message() {
  msg=$1
  echo "$(basename $0): $msg"
}

if is_stage_empty && is_worktree_clean; then
  SNAPSHOT_DIR=test/snapshot.$(git rev-parse HEAD)
else
  SNAPSHOT_DIR=test/snapshot.CURRENT
fi
export STORAGE_DIR="$SNAPSHOT_DIR/data"
export CACHE_DIR="$SNAPSHOT_DIR/cache"

if [ -e "$SNAPSHOT_DIR" ]; then
  message "$SNAPSHOT_DIR exists already, please remove and re-run."
  exit 1
fi

mkdir -p "$STORAGE_DIR" "$CACHE_DIR"
message "Snapping to $SNAPSHOT_DIR..."

npm run build
npm run start -- --chains "$CHAINS" --to-block "$TO_BLOCK" --run-once

