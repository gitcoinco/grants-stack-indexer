#!/bin/bash

function supervise() {
  while true; do $@ && break; done
}

# clean up background process when stopped
trap "exit" INT TERM
trap "kill 0" EXIT

# Index everything once

npm run passport &
npm run index:goerli &
npm run index:mainnet &
npm run index:optimism &
npm run index:fantom &

wait

# Run HTTP server and run everything as a long running process

supervise "npm run serve" &
supervise "npm run passport -- --follow" &
supervise "npm run index:goerli -- --follow" &
supervise "npm run index:mainnet -- --follow" &
supervise "npm run index:optimism -- --follow" &
supervise "npm run index:fantom -- --follow" &

wait
