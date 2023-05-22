#!/bin/bash

export NODE_NO_WARNINGS=1

function supervise() {
  while true; do $@ && break; done
}

trap "pkill -P $$" SIGINT SIGTERM EXIT

# Index everything once

npm run index -- --chain=mainnet & pids+=($!)
npm run index -- --chain=optimism & pids+=($!)
npm run index -- --chain=fantom & pids+=($!)
npm run index -- --chain=goerli & pids+=($!)
npm run passport & pids+=($!)

for pid in ${pids[*]}; do
  echo "=> Waiting for $pid"

  if wait $pid; then
    echo "=> Process $pid success"
  else
    echo "=> Process $pid failure"
    exit 1
  fi
done

# Run HTTP server and run everything as a long running process
if [ "$1" == "server" ]; then

  echo "=> Index successful, running server!"

  supervise "npm run passport -- --follow" &
  supervise "npm run index -- --chain=goerli --follow" &
  supervise "npm run index -- --chain=mainnet --follow" &
  supervise "npm run index -- --chain=optimism --follow" &
  supervise "npm run index -- --chain=fantom --follow" &

  supervise "npm run serve" &

  wait

fi
