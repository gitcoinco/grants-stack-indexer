#!/bin/bash

set -e

# Exit script on interrupts
trap "exit 130" INT

echo "======> Catching up"

# Catch up indexers to latest block before starting
npx concurrently \
  --kill-others-on-fail \
  --names "mainnet,optimism,goerli,fantom,passport" \
  'npm:index -- --chain=mainnet --log-level=error --clear' \
  'npm:index -- --chain=optimism --log-level=error --clear' \
  'npm:index -- --chain=goerli --log-level=error --clear' \
  'npm:index -- --chain=fantom --log-level=error --clear' \
  'npm:passport'

echo "======> Catch up successful, running indexer on follow mode!"

# Once caught up, start indexers in follow mode and run HTTP server
exec npx concurrently \
  --restart-tries=10 \
  --names "mainnet,optimism,goerli,fantom,passport,http" \
  'npm:index -- --chain=mainnet --follow' \
  'npm:index -- --chain=optimism --follow' \
  'npm:index -- --chain=goerli --follow' \
  'npm:index -- --chain=fantom --follow' \
  'npm:passport -- --restart--retries=10 --follow' \
  'npm:serve'
