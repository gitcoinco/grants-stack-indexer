import { ethers } from "ethers";
import { Log, createIndexer, JsonStorage, ToBlock } from "chainsauce";
import path from "node:path";

import handleEvent from "./handleEvent.js";
import config from "./config.js";

// Get to block parameter

let toBlock: ToBlock = "latest";

if (process.argv[3] && process.argv[3] !== "latest") {
  toBlock = Number(process.argv[3]);
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

const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
await provider.getNetwork();

const storageDir = path.join(config.storageDir, `${provider.network.chainId}`);
const storage = new JsonStorage(storageDir);

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock,
  logLevel: Log.Debug,
});

for (const subscription of chain.subscriptions) {
  indexer.subscribe(subscription.address, subscription.abi);
}
