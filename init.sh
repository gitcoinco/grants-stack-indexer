#!/bin/bash
function supervise() {
  while true; do $@ && break; done
}

export NODE_NO_WARNINGS=1

#clean up background process when stopped
#
trap "exit" INT TERM
trap "kill 0" EXIT

# Index everything once


# npm run passport &

# The indexers depend on the prices being available
npm run prices

npm run index:goerli &
npm run index:mainnet &
npm run index:optimism &
npm run index:fantom &

wait

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
