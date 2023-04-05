#!/bin/bash

export NODE_NO_WARNINGS=1

function supervise() {
  while true; do $@ && break; done
}

cleanup() {
  echo "Cleaning up background jobs..."
  pkill -P $$ # kill all child processes
}

# clean up background process when stopped
trap "cleanup" EXIT

set -e

# Index everything once

# The indexers depend on the prices being available
npm run prices

npm run index:mainnet & pids+=($!)
npm run index:optimism & pids+=($!)
npm run index:fantom & pids+=($!)
npm run index:goerli & pids+=($!)
npm run passport & pids+=($!)

for pid in ${pids[*]}; do
  wait $pid
done

# Run HTTP server and run everything as a long running process
if [ "$1" == "server" ]; then

  echo "=> Index successful, running server!"

  supervise "npm run prices -- --follow" &
  supervise "npm run passport -- --follow" &
  supervise "npm run index:goerli -- --follow" &
  supervise "npm run index:mainnet -- --follow" &
  supervise "npm run index:optimism -- --follow" &
  supervise "npm run index:fantom -- --follow" &

  supervise "npm run serve" &

  wait

fi
