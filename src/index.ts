import {
  RetryProvider,
  createIndexer,
  JsonStorage,
  Cache,
  Indexer,
  Event as ChainsauceEvent,
} from "chainsauce";
import { Logger, pino } from "pino";
import path from "node:path";
import * as Sentry from "@sentry/node";
import fs from "node:fs/promises";

import { createPassportUpdater, PassportScore } from "./passport/index.js";

import handleEvent from "./indexer/handleEvent.js";
import { Chain, getConfig, Config } from "./config.js";
import { createPriceUpdater } from "./prices/updater.js";
import { createPriceProvider } from "./prices/provider.js";
import { importAbi } from "./indexer/utils.js";
import { fetchJson } from "./utils/ipfs.js";
import { createHttpApi } from "./http/app.js";
import { FileSystemDataProvider } from "./calculator/index.js";

async function main(): Promise<void> {
  const config = getConfig();

  if (config.sentryDsn !== null) {
    Sentry.init({
      dsn: config.sentryDsn,
      tracesSampleRate: 1.0,
    });
  }

  const baseLogger = pino({ level: "trace" }).child({
    service: "indexer-staging", // XXX TODO grab environment name from env variable
  });

  await Promise.all([
    catchupAndWatchPassport({
      ...config,
      baseLogger,
      runOnce: config.runOnce,
    }),
    ...config.chains.map((chain) =>
      catchupAndWatchChain({
        chain,
        baseLogger,
        ...config,
      })
    ),
  ]);
  baseLogger.info("initial catchup done, starting api");

  const httpApi = createHttpApi({
    storageDir: config.storageDir,
    getPriceProvider: (chainId) =>
      createPriceProvider({
        storageDir: path.join(config.storageDir, chainId.toString()),
        logger: baseLogger.child({ subsystem: "PriceProvider" }),
      }),
    getDataProvider: (chainId) =>
      new FileSystemDataProvider(
        path.join(config.storageDir, chainId.toString())
      ),
  });

  httpApi.listen(config.apiHttpPort, () => {
    baseLogger.info(`http api listening on port ${config.apiHttpPort}`);
  });
}

await main();

// ----------------------------------------------------------------------
// INTERNALS

async function catchupAndWatchPassport(
  config: Config & { baseLogger: Logger; runOnce: boolean }
): Promise<void> {
  await fs.mkdir(config.storageDir, { recursive: true });
  const SCORES_FILE = path.join(config.storageDir, "passport_scores.json");
  const VALID_ADDRESSES_FILE = path.join(
    config.storageDir,
    "passport_valid_addresses.json"
  );

  const passportUpdater = createPassportUpdater({
    apiKey: config.passportApiKey,
    logger: config.baseLogger.child({ subsystem: "PassportUpdater" }),
    scorerId: config.passportScorerId,
    load: async () => {
      try {
        return JSON.parse(
          await fs.readFile(SCORES_FILE, "utf8")
        ) as PassportScore[];
      } catch (err) {
        return null;
      }
    },
    persist: async ({ passports, validAddresses }) => {
      await Promise.all([
        fs.writeFile(SCORES_FILE, JSON.stringify(passports, null, 2), "utf8"),
        fs.writeFile(
          VALID_ADDRESSES_FILE,
          JSON.stringify(validAddresses, null, 2),
          "utf8"
        ),
      ]);
    },
  });

  await passportUpdater.start({ watch: !config.runOnce });
}

async function catchupAndWatchChain(
  config: Omit<Config, "chains"> & { chain: Chain; baseLogger: Logger }
): Promise<void> {
  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  const pricesCache: Cache | null = config.cacheDir
    ? new Cache(path.join(config.cacheDir, "prices"))
    : null;

  const storage = new JsonStorage(
    path.join(config.storageDir, config.chain.id.toString())
  );

  const priceProvider = createPriceProvider({
    ...config,
    logger: chainLogger.child({ subsystem: "PriceProvider" }),
  });

  const rpcProvider = new RetryProvider({
    url: config.chain.rpc,
    timeout: 5 * 60 * 1000,
  });

  const ipfsGet = <T>(cid: string) => fetchJson<T>(cid, config);

  // const ipfsCache: Cache | null = null;
  // const ipfsGet = <T>(cid: string) =>
  //   ipfsCache === null
  //     ? fetchJson<T>(cid, config)
  //     : ipfsCache.lazy<T | undefined>(`ipfs-${cid}`, () =>
  //         fetchJson<T>(cid, config)
  //       );

  await rpcProvider.getNetwork();

  // Update prices to present and optionally keep watching for updates

  const priceUpdater = createPriceUpdater({
    ...config,
    rpcProvider,
    chain: config.chain,
    logger: chainLogger.child({ subsystem: "PriceUpdater" }),
    withCacheFn:
      pricesCache === null
        ? undefined
        : (cacheKey, fn) => pricesCache.lazy(cacheKey, fn),
  });

  await priceUpdater.start({
    watch: !config.runOnce,
    toBlock: config.toBlock,
  });

  // Update blockchain-dependent state to present and optionally keep watching for updates

  chainLogger.info("catching up with blockchain events");
  const indexer = await createIndexer(
    rpcProvider,
    storage,
    (indexer: Indexer<JsonStorage>, event: ChainsauceEvent) => {
      return handleEvent(event, {
        chainId: config.chain.id,
        db: storage,
        subscribe: (...args) => indexer.subscribe(...args),
        ipfsGet: ipfsGet,
        priceProvider,
      });
    },
    {
      toBlock: config.toBlock,
      logger: chainLogger.child({ subsystem: "DataUpdater" }),
      eventCacheDirectory: config.cacheDir
        ? path.join(config.cacheDir, "events")
        : null,
      runOnce: config.runOnce,
    }
  );

  chainLogger.debug("subcribing to contracts");
  for (const subscription of config.chain.subscriptions) {
    indexer.subscribe(
      subscription.address,
      await importAbi(subscription.abi),
      Math.max(subscription.fromBlock || 0, config.fromBlock)
    );
  }
}
