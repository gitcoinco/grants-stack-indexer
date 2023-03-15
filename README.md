# Allo Protocol Indexer

This is an Allo Protocol Indexer for Grants Stack.

**Please make sure you set the environment variables before running.**

## How to run?

```bash
npm install

npm start # will run the HTTP server and all the indexers for all chains
npm run index # will run the indexers for all chains
```

## Production URLs

- Mainnet: https://grants-stack-indexer.fly.dev/data/1/_index.json
- Goerli: https://grants-stack-indexer.fly.dev/data/5/_index.json
- Fantom: https://grants-stack-indexer.fly.dev/data/250/_index.json
- Optimism: https://grants-stack-indexer.fly.dev/data/10/_index.json

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

### HTTP Server

The `npm run serve` command runs a static HTTP server to serve JSON files, they're partitioned by each chain, check the index file for each one to see what's available:

http://localhost:4000/data/{chainId}/_index.json

This is the current structure:

- http://localhost:4000/data/{chainId}/rounds.json
- http://localhost:4000/data/{chainId}/projects.json
- http://localhost:4000/data/{chainId}/rounds/{roundAddress}/votes.json
- http://localhost:4000/data/{chainId}/rounds/{roundAddress}/projects.json
- http://localhost:4000/data/{chainId}/rounds/{roundAddress}/projects/{projectId}/votes.json

### Indexer arguments

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

