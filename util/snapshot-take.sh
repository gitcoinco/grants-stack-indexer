#!/bin/bash

set -ue

# This must be within the blocks covered by seed/<chainId>/prices.json
SNAPSHOT_UNTIL_BLOCK=17570615

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
npm run index -- --chain mainnet --to-block "$SNAPSHOT_UNTIL_BLOCK"
