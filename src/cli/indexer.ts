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

import "../sentry.js";
import handleEvent from "../indexer/handleEvent.js";
import config from "../config.js";
import {
  updatePricesAndWriteLoop,
  updatePricesAndWrite,
} from "../prices/index.js";

const { values: args, positionals: positionalArgs } = parseArgs({
  allowPositionals: true,
  options: {
    follow: {
      type: "boolean",
      short: "f",
    },
    "to-block": {
      type: "string",
    },
    "from-block": {
      type: "string",
    },
    clear: {
      type: "boolean",
    },
    "no-cache": {
      type: "boolean",
    },
  },
});

// Get to block parameter

let toBlock: ToBlock = "latest";
let fromBlock = 0;

if (args["to-block"]) {
  toBlock = Number(args["to-block"]);
}

if (args["from-block"]) {
  fromBlock = Number(args["from-block"]);
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
  console.info("Clearing storage directory.");
  try {
    await fs.rm(storageDir, { recursive: true });
  } catch {
    console.info("No storage to clear.");
  }
}

const storage = new JsonStorage(storageDir);

await updatePricesAndWrite(chain);

if (args.follow) {
  await updatePricesAndWriteLoop(chain);
}

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock,
  logLevel: Log.Info,
  eventCacheDirectory: args["no-cache"] ? null : "./.cache",
  runOnce: !args.follow,
});

for (const subscription of chain.subscriptions) {
  indexer.subscribe(
    subscription.address,
    (await import(subscription.abi, { assert: { type: "json" } })).default,
    Math.max(subscription.fromBlock || 0, fromBlock)
  );
}
