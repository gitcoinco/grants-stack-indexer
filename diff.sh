#!/bin/bash

if [ $# -ne 2 ]; then
  echo "Usage: $0 <old_url> <new_url>"
  exit 1
fi

A=`mktemp`
B=`mktemp`
DIFF=`mktemp`

trap "rm $A $B $DIFF" EXIT

curl -s $1 | jq . > $A
curl -s $2 | jq . > $B

# piping to less truncates the output, so we write to a file
# use the -f flag to show full diff
npx json-diff --color $A $B > $DIFF
less -r --RAW-CONTROL-CHARS $DIFF
