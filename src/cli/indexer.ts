import {
  RetryProvider,
  createIndexer,
  JsonStorage,
  Cache,
  Indexer,
  Event as ChainsauceEvent,
} from "chainsauce";
import { fetchJsonCached as ipfs } from "../utils/ipfs.js";
import fs from "node:fs/promises";
import path from "node:path";

import "../sentry.js";
import handleEvent from "../indexer/handleEvent.js";
import { getIndexerConfig } from "../config.js";
import { createPriceProvider, createPriceUpdater } from "../prices/index.js";
import { importAbi } from "../indexer/utils.js";

const config = getIndexerConfig();

if (config.clear) {
  console.info("Clearing storage directory.");
  try {
    await fs.rm(config.storageDir, { recursive: true });
  } catch {
    console.info("No storage to clear.");
  }
}

const rpcProvider = new RetryProvider({
  url: config.chain.rpc,
  timeout: 5 * 60 * 1000,
});

await rpcProvider.getNetwork();

// Update prices to present and optionally keep watching for updatse

const priceUpdater = createPriceUpdater({
  rpcProvider,
  cache: config.cacheDir
    ? new Cache(path.join(config.cacheDir, "prices"))
    : null,
  chain: config.chain,
});

if (config.follow) {
  await priceUpdater.catchupAndWatch();
} else {
  await priceUpdater.fetchPricesUntilBlock(config.toBlock ?? "latest");
}

// Process blockchain events

const priceProvider = createPriceProvider({});

const indexer = await createIndexer(
  rpcProvider,
  new JsonStorage(path.join(config.storageDir, config.chain.id.toString())),
  (indexer: Indexer<JsonStorage>, event: ChainsauceEvent) => {
    return handleEvent(event, {
      db: indexer.storage,
      indexer,
      ipfs,
      priceProvider,
    });
  },
  {
    toBlock: config.toBlock,
    logLevel: config.logLevel,
    eventCacheDirectory: config.cacheDir
      ? path.join(config.cacheDir, "events")
      : null,
    runOnce: !config.follow,
  }
);

for (const subscription of config.chain.subscriptions) {
  indexer.subscribe(
    subscription.address,
    await importAbi(subscription.abi),
    Math.max(subscription.fromBlock || 0, config.fromBlock)
  );
}
