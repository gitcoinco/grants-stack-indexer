import { RetryProvider, createIndexer, JsonStorage, Cache } from "chainsauce";
import fs from "node:fs/promises";
import path from "node:path";

import "../sentry.js";
import handleEvent from "../indexer/handleEvent.js";
import { getIndexerConfig } from "../config.js";
import {
  updatePricesAndWriteLoop,
  updatePricesAndWrite,
} from "../prices/index.js";
import { importAbi } from "../indexer/utils.js";

const config = getIndexerConfig();

const provider = new RetryProvider({
  url: config.chain.rpc,
  timeout: 5 * 60 * 1000,
});

await provider.getNetwork();

if (config.clear) {
  console.info("Clearing storage directory.");
  try {
    await fs.rm(config.storageDir, { recursive: true });
  } catch {
    console.info("No storage to clear.");
  }
}

const storage = new JsonStorage(config.storageDir);

const pricesCache = config.cacheDir
  ? new Cache(path.join(config.cacheDir, "prices"))
  : null;

await updatePricesAndWrite(provider, pricesCache, config.chain, config.toBlock);

if (config.follow) {
  await updatePricesAndWriteLoop(provider, pricesCache, config.chain);
}

const indexer = await createIndexer(provider, storage, handleEvent, {
  toBlock: config.toBlock,
  logLevel: config.logLevel,
  eventCacheDirectory: config.cacheDir
    ? path.join(config.cacheDir, "events")
    : null,
  runOnce: !config.follow,
});

for (const subscription of config.chain.subscriptions) {
  indexer.subscribe(
    subscription.address,
    await importAbi(subscription.abi),
    Math.max(subscription.fromBlock || 0, config.fromBlock)
  );
}
