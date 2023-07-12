import {
  RetryProvider,
  createIndexer,
  JsonStorage,
  Cache,
  Indexer,
  Event as ChainsauceEvent,
} from "chainsauce";
import fs from "node:fs/promises";
import path from "node:path";

import "../sentry.js";
import handleEvent from "../indexer/handleEvent.js";
import { getIndexerConfig, IndexerConfig } from "../config.js";
import { createPriceProvider, createPriceUpdater } from "../prices/index.js";
import { importAbi } from "../indexer/utils.js";
import { fetchJsonCached } from "../utils/ipfs.js";

async function main(config: IndexerConfig) {
  if (config.clear) {
    console.info("Clearing storage directory.");
    try {
      await fs.rm(config.storageDir, { recursive: true });
    } catch {
      console.info("No storage to clear.");
    }
  }

  // Dependencies

  const priceProvider = createPriceProvider(config);

  const rpcProvider = new RetryProvider({
    url: config.chain.rpc,
    timeout: 5 * 60 * 1000,
  });

  await rpcProvider.getNetwork();

  // Update prices to present and optionally keep watching for updates

  const priceUpdater = createPriceUpdater({
    ...config,
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

  // Update blockchain-dependent state to present and optionally keep watching for updates

  const indexer = await createIndexer(
    rpcProvider,
    new JsonStorage(path.join(config.storageDir, config.chain.id.toString())),
    (indexer: Indexer<JsonStorage>, event: ChainsauceEvent) => {
      return handleEvent(event, {
        db: indexer.storage,
        indexer,
        ipfs: (cid: string) =>
          fetchJsonCached(cid, indexer.cache, {
            ipfsGateway: config.ipfsGateway,
          }),
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
}

await main(getIndexerConfig());
