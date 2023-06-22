#!/bin/bash

A=`mktemp`
B=`mktemp`
DIFF=`mktemp`

curl -s $1 | jq . > $A
curl -s $2 | jq . > $B

# piping to less truncates the output, so we write to a file
# use the -f flag to show full diff
npx json-diff --color $A $B > $DIFF
less -r --RAW-CONTROL-CHARS $DIFF

rm $A $B $DIFF
