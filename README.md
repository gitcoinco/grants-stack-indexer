# Allo Protocol Indexer

This is an Allo Protocol Indexer for Grants Stack.

Please make sure you set the environment variables before running.

## How to run?

```bash
npm install

npm start # will run the HTTP server and all the indexers for all chains
npm run index # will run the indexers for all chains
```

## Development

```bash
npm run dev # Run the Typescript compiler on watch mode
npm run build # Compile the code
npm run lint # Lint the code
```

### Available indexers

```bash
npm run index:mainnet
npm run index:fantom
npm run index:optimism
npm run index:goerli
```

### Arguments

The indexer is a long running process by default, use the follwing options to change it's behaviour:

```bash
npm run index:mainnet -- --to-block=16833357 # this will run the mainnext indexer only to the specified block, the program will exit after it's done
npm run index:mainnet -- --run-once # this will run the mainnext indexer to the latest block, the program will exit after it's done
```

### Docker

Run the indexer with Docker:

```bash
docker run ghcr.io/gitcoinco/allo-indexer -e INFURA_API_KEY="" -e ALCHEMY_API_KEY="" -e STORAGE_DIR="" -p 8080:8080
```

