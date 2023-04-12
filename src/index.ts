import {
  RetryProvider,
  Log,
  createIndexer,
  JsonStorage,
  ToBlock,
} from "chainsauce";
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";

import handleEvent from "./handleEvent.js";
import config from "./config.js";
import {
  updatePricesAndWriteLoop,
  updatePricesAndWrite,
} from "./cli/prices.js";

const { values: args, positionals: positionalArgs } = parseArgs({
  allowPositionals: true,
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
    toBlock: {
      type: "string",
    },
    clear: {
      type: "boolean",
    },
  },
});

// Get to block parameter

let toBlock: ToBlock = "latest";

if (args.toBlock) {
  toBlock = Number(args.toBlock);
}

// Get chain parameter

const chainName = positionalArgs[0];

if (!chainName) {
  console.error("Please provide a chain name to index.");
  process.exit(1);
}

const chain = config.chains.find((chain) => chain.name === chainName);

if (!chain) {
  console.error("Chain", chainName, "not configured.");
  process.exit(1);
}

const provider = new RetryProvider({
  url: chain.rpc,
  timeout: 5 * 60 * 1000,
});

await provider.getNetwork();

const storageDir = path.join(config.storageDir, `${provider.network.chainId}`);

if (args.clear) {
  try {
    await fs.rm(storageDir, { recursive: true });
  } catch {}
}

const storage = new JsonStorage(storageDir);

await updatePricesAndWrite(chain);

if (args.follow) {
  await updatePricesAndWriteLoop(chain);
}

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock,
  logLevel: Log.Debug,
  runOnce: !args.follow,
});

for (const subscription of chain.subscriptions) {
  indexer.subscribe(
    subscription.address,
    (await import(subscription.abi, { assert: { type: "json" } })).default,
    subscription.fromBlock || 0
  );
}
