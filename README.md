# Allo Protocol Indexer

The Allo Protocol Indexer is an indexer for indexing blockchain events from Allo contracts and serving the data over HTTP in JSON format. The data is organized in a specific structure that enables easy access to different parts of the protocol. The indexer is built using [Chainsauce](https://github.com/boudra/chainsauce) and is designed to work with any EVM-compatible chain.

# Indexed Data

## HTTP Access

Access indexed data through the following URL: https://indexer-grants-stack.gitcoin.co

## Disk Access

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

npm start # run the HTTP server and all the indexers for all chains
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

**Please make sure you set the environment variables before running, find a `.env` template in `.env.example`**

Each indexer has a `dev:` prefix which will watch for code changes and re-run the indexer with an empty data directory.

```
npm run dev:index:mainnet
```

Then check the new files generated under `data/1`.

### HTTP Server

The `npm run serve` command runs a static HTTP server to serve the JSON files inside `/.data`.

### Indexer arguments

The indexer updates to the current last block and exits, use the follwing options to change it's behaviour:

```bash
npm run index:mainnet -- --to-block=16833357 # run only to the specified block, useful to maximize cache usage
npm run index:mainnet -- --follow # follow the blockchain, this run as a long running process
npm run index:mainnet -- --clear # run from empty data, it will index from the beginning
npm run index:mainnet -- --no-cache # run without a cache
```

## Deployment

The indexer is currently automatically deployed on [Fly.io](Fly.io) from the `main` branch. We reindex everything from scratch on each deploy, we only persist the cache, which includes events and IPFS data.

The following commands might be useful for monitoring production:

```bash
fly status # show general status of the app, all VMs and their status
fly logs # check logs of running VM, it also shows logs of deployments in progress
fly ssh console # open a console to the runnning VM
```


