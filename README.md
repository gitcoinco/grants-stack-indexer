# Allo Protocol Indexer

This is an Allo Protocol Indexer for Grants Stack.

**Please make sure you set the environment variables before running.**

# Indexed Data

## HTTP

Access indexed data through the following URL: https://indexer-grants-stack.gitcoin.co

## Disk

All indexed data is written in the `./data` directory, the data follows this structure:

```
/{chainId}/rounds.json
/{chainId}/prices.json
/{chainId}/projects.json
/{chainId}/rounds/{roundId}/projects.json
/{chainId}/rounds/{roundId}/projects/{projectId}/votes.json
/{chainId}/rounds/{roundId}/projects/{projectId}/contributors.json
/{chainId}/rounds/{roundId}/applications.json
/{chainId}/rounds/{roundId}/applications/{applicationIndex}/votes.json
/{chainId}/rounds/{roundId}/votes.json
/{chainId}/rounds/{roundId}/contributors.json
```

## How to run?

```bash
npm install

npm start # will run the HTTP server and all the indexers for all chains
```

You can run specific indexers:

```bash
npm run index:mainnet
npm run index:goerli
npm run index:fantom
npm run index:optimism
```

## Development

Build the source code:

```bash
npm run dev # Run the Typescript compiler on watch mode
npm run build # Compile the code
npm run lint # Lint the code
```

### Developing the indexer

Each indexer has a `dev:` prefix which will watch for code changes and re-run the indexer with an empty data directory.

```
npm run dev:index:mainnet
```

Then check the new files generated under `data/1`.

### HTTP Server

The `npm run serve` command runs a static HTTP server to serve the JSON files inside `/.data`, they're partitioned by each chain, check the index file for each one to see what's available.

### Indexer arguments

The indexer updates to the current last block and exits, use the follwing options to change it's behaviour:

```bash
npm run index:mainnet -- --to-block=16833357 # this will run the mainnext indexer only to the specified block, the program will exit after it's done
npm run index:mainnet -- --follow # this will run the mainnext indexer as a long running process, following the blockchain
npm run index:mainnet -- --clear # this will run the mainnext indexer from empty data, it will index from the beginning
npm run index:mainnet -- --no-cache # this will run the mainnext indexer without a cache
```

## Production

The indexer is currently deployed on [Fly.io](Fly.io), if you have access to the app, the following commands might be useful:

```bash
fly status # show general status of the app, all VMs and their status
fly logs # check logs of running VM, it also shows logs of deployments in progress
fly ssh console # open a console to the runnning VM
```

