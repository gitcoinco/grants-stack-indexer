import {
  RetryProvider,
  Log,
  createIndexer,
  JsonStorage,
  ToBlock,
  Cache,
} from "chainsauce";
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";

import "../sentry.js";
import handleEvent from "../indexer/handleEvent.js";
import config from "../config.js";
import { createPricesService } from "../prices/service.js";
import { readPrices, writePrices } from "../prices/storage.js";

const { values: args } = parseArgs({
  options: {
    chain: {
      type: "string",
      short: "s",
    },
    "log-level": {
      type: "string",
    },
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

let logLevel = Log.Info;

if (args["log-level"]) {
  switch (args["log-level"]) {
    case "debug":
      logLevel = Log.Debug;
      break;
    case "info":
      logLevel = Log.Info;
      break;
    case "warning":
      logLevel = Log.Warning;
      break;
    case "error":
      logLevel = Log.Error;
      break;
    default:
      console.error("Invalid log level.");
      process.exit(1);
  }
}

// Get chain parameter

const chainName = args.chain;

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
const cacheDisabled = args["no-cache"];

const pricesService = createPricesService({
  mode: args.follow ? "realtime" : "historical",
  chain,
  provider,
  cache: cacheDisabled ? undefined : new Cache(config.cacheDir),
  fromTimestamp: config.pricesStartTimestamp,
  storage: {
    write: async (prices) => {
      return await writePrices(storageDir, prices);
    },
    read: async () => {
      return await readPrices(storageDir);
    },
  },
});

await pricesService.start();

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock,
  logLevel,
  eventCacheDirectory: cacheDisabled ? null : config.cacheDir,
  runOnce: !args.follow,
});

for (const subscription of chain.subscriptions) {
  indexer.subscribe(
    subscription.address,
    (await import(subscription.abi, { assert: { type: "json" } })).default,
    Math.max(subscription.fromBlock || 0, fromBlock)
  );
}
