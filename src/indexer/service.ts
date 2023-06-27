import fs from "node:fs/promises";
import { createIndexer, Indexer, JsonStorage, Log, Event } from "chainsauce";
import { ethers } from "ethers";
import { Chain } from "../config.js";
import { updatePricesAndWrite } from "../prices/index.js";

interface IndexingService {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface IndexingServiceConfig {
  provider: ethers.providers.StaticJsonRpcProvider;
  storageDir: string;
  cacheDir: string | null;
  chain: Chain;
  fromBlock?: number;
  oneShot?: boolean;
  toBlock?: number | "latest";
  logLevel?: Log;
  clear?: boolean;
}

export const createService = (
  config: IndexingServiceConfig
): IndexingService => {
  const { provider, storageDir, cacheDir, chain, clear } = config;

  const toBlock = config.toBlock ?? "latest";
  const fromBlock = config.fromBlock ?? 0;
  const logLevel = config.logLevel ?? Log.Info;
  let updateLoopId: NodeJS.Timeout | null = null;

  const storage = new JsonStorage(storageDir);

  const start = async () => {
    if (clear) {
      console.info("Clearing storage directory.");
      try {
        await fs.rm(storageDir, { recursive: true });
      } catch {
        console.info("No storage to clear.");
      }
    }

    await provider.getNetwork();

    const indexer = await createIndexer(provider, storage, handleEvent, {
      toBlock,
      logLevel,
      eventCacheDirectory: cacheDir,
      runOnce: config.oneShot,
    });

    if (config.oneShot) {
      await updatePricesAndWrite(chain);
      // one-shot writing of chain events is taken care by `runOnce` in `createIndexer()` call
    } else {
      updatePricesAndWriteLoop();
      updateChainEventsAndWriteLoop(indexer);
    }
  };

  const stop = async () => {
    if (updateLoopId !== null) {
      clearTimeout(updateLoopId);
    }
  };

  const handleEvent = async (
    _indexer: Indexer<JsonStorage>,
    event: Event
  ): Promise<void> => {
    console.log(event);
  };

  const updatePricesAndWriteLoop = async () => {
    await updatePricesAndWrite(chain);
    updateLoopId = setTimeout(() => updatePricesAndWriteLoop(), minutes(1));
  };

  const updateChainEventsAndWriteLoop = async (
    indexer: Indexer<JsonStorage>
  ) => {
    for (const subscription of chain.subscriptions) {
      indexer.subscribe(
        subscription.address,
        (await import(subscription.abi, { assert: { type: "json" } })).default,
        Math.max(subscription.fromBlock || 0, fromBlock)
      );
    }
  };

  return {
    start,
    stop,
  };
};

const minutes = (n: number) => n * 60 * 1000;
