import { ethers } from "ethers";
import {
  RetryProvider,
  Log,
  createIndexer,
  JsonStorage,
  ToBlock,
} from "chainsauce";
import path from "node:path";
import yargs from "yargs/yargs";

import handleEvent from "./handleEvent.js";
import config from "./config.js";

const args = yargs(process.argv)
  .options({
    runOnce: { type: "boolean", default: false },
    toBlock: { type: "number" },
  })
  .parseSync();

// Get to block parameter

let toBlock: ToBlock = "latest";

if (args.toBlock) {
  toBlock = args.toBlock;
}

// Get chain parameter

const chainName = process.argv[2] as keyof typeof config.chains;

if (!chainName) {
  console.error("Please provide a chain name to index.");
  process.exit(1);
}

const chain = config.chains[chainName];

if (!chain) {
  console.error("Chain", chainName, "not supported yet.");
  process.exit(1);
}

const provider = new RetryProvider({
  url: chain.rpc,
  timeout: 5 * 60 * 1000,
});

await provider.getNetwork();

const storageDir = path.join(config.storageDir, `${provider.network.chainId}`);
const storage = new JsonStorage(storageDir);

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock,
  logLevel: Log.Debug,
  runOnce: args.runOnce,
});

for (const subscription of chain.subscriptions) {
  indexer.subscribe(subscription.address, subscription.abi);
}
