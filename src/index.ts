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
import fetch from "make-fetch-happen";
import { throttle } from "throttle-debounce";

import { createPassportProvider, PassportProvider } from "./passport/index.js";

import handleEvent from "./indexer/handleEvent.js";
import { Chain, getConfig, Config } from "./config.js";
import { createPriceUpdater } from "./prices/updater.js";
import { createPriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { FileSystemDataProvider } from "./calculator/index.js";
import { AsyncSentinel } from "./utils/asyncSentinel.js";
import { ethers } from "ethers";

// If, during reindexing, a chain has these many blocks left to index, consider
// it caught up and start serving
const MINIMUM_BLOCKS_LEFT_BEFORE_STARTING = 500;

async function main(): Promise<void> {
  const config = getConfig();

  // https://github.com/gitcoinco/allo-indexer/issues/215#issuecomment-1711380810
  ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);

  if (config.sentryDsn !== null) {
    Sentry.init({
      environment: config.deploymentEnvironment,
      dsn: config.sentryDsn,
      tracesSampleRate: 1.0,
    });
  }

  const baseLogger = pino({
    level: config.logLevel,
    formatters: {
      level(level) {
        // represent severity as strings so that DataDog can recognize it
        return { level };
      },
    },
  }).child({
    service: `indexer-${config.deploymentEnvironment}`,
  });

  baseLogger.info({
    msg: "starting",
    buildTag: config.buildTag,
    deploymentEnvironment: config.deploymentEnvironment,
    chains: config.chains.map(
      (c) =>
        c.name +
        " (rpc: " +
        c.rpc.slice(0, 25) +
        "..." +
        c.rpc.slice(-5, -1) +
        ")"
    ),
  });

  if (config.runOnce) {
    await Promise.all(
      config.chains.map(async (chain) =>
        catchupAndWatchChain({ chain, baseLogger, ...config })
      )
    );
    // Workaround for active handles preventing process to terminate
    // (to investigate: console.log(process._getActiveHandles()))
    // Note: the delay is necessary to allow completing writes.
    baseLogger.info("exiting");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  } else {
    // Promises will be resolved once the initial catchup is done. Afterwards, services
    // will still be in listen-and-update mode.

    const [passportProvider] = await Promise.all([
      catchupAndWatchPassport({
        ...config,
        baseLogger,
        runOnce: config.runOnce,
      }),
      ...config.chains.map(async (chain) =>
        catchupAndWatchChain({ chain, baseLogger, ...config })
      ),
    ]);

    const httpApi = createHttpApi({
      storageDir: config.storageDir,
      priceProvider: createPriceProvider({
        storageDir: config.storageDir,
        logger: baseLogger.child({ subsystem: "PriceProvider" }),
      }),
      passportProvider: passportProvider,
      dataProvider: new FileSystemDataProvider(config.storageDir),
      port: config.apiHttpPort,
      logger: baseLogger.child({ subsystem: "HttpApi" }),
      buildTag: config.buildTag,
      chains: config.chains,
    });

    await httpApi.start();
  }
}

await main();

// ----------------------------------------------------------------------
// INTERNALS

async function catchupAndWatchPassport(
  config: Config & { baseLogger: Logger; runOnce: boolean }
): Promise<PassportProvider> {
  const logger = config.baseLogger.child({ subsystem: "PassportProvider" });
  try {
    await fs.mkdir(config.storageDir, { recursive: true });

    const passportProvider = createPassportProvider({
      apiKey: config.passportApiKey,
      logger,
      scorerId: config.passportScorerId,
      dbPath: path.join(config.storageDir, "..", "passport_scores.leveldb"),
      deprecatedJSONPassportDumpPath: path.join(
        config.storageDir,
        "passport_scores.json"
      ),
    });

    await passportProvider.start({ watch: !config.runOnce });

    return passportProvider;
  } catch (err) {
    logger.error({
      msg: "error during initial catch up with passport",
      err,
    });
    throw err;
  }
}

async function catchupAndWatchChain(
  config: Omit<Config, "chains"> & { chain: Chain; baseLogger: Logger }
): Promise<void> {
  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  try {
    const CHAIN_DIR_PATH = path.join(
      config.storageDir,
      config.chain.id.toString()
    );

    const pricesCache: Cache | null = config.cacheDir
      ? new Cache(path.join(config.cacheDir, "prices"))
      : null;

    // Force a full re-indexing on every startup.
    // XXX For the longer term, verify whether ChainSauce supports
    // any sort of stop-and-resume.
    await fs.rm(CHAIN_DIR_PATH, { force: true, recursive: true });

    const storage = new JsonStorage(CHAIN_DIR_PATH);

    const priceProvider = createPriceProvider({
      ...config,
      logger: chainLogger.child({ subsystem: "PriceProvider" }),
    });

    const rpcProvider = new RetryProvider({
      url: config.chain.rpc,
      timeout: 5 * 60 * 1000,
    });

    const cachedIpfsGet = async <T>(cid: string): Promise<T | undefined> => {
      const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;
      if (!cidRegex.test(cid)) {
        chainLogger.warn(`Invalid IPFS CID: ${cid}`);
        return undefined;
      }

      const url = `${config.ipfsGateway}/ipfs/${cid}`;

      chainLogger.trace(`Fetching ${url}`);

      const res = await fetch(url, {
        timeout: 2000,
        onRetry(cause) {
          chainLogger.debug({
            msg: "Retrying IPFS request",
            url: url,
            err: cause,
          });
        },
        retry: { retries: 3, minTimeout: 2000, maxTimeout: 60 * 10000 },
        // IPFS data is immutable, we can rely entirely on the cache when present
        cache: "force-cache",
        cachePath:
          config.cacheDir !== null
            ? path.join(config.cacheDir, "ipfs")
            : undefined,
      });

      return (await res.json()) as T;
    };

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

    chainLogger.info("catching up with blockchain events");
    const catchupSentinel = new AsyncSentinel();

    const indexerLogger = chainLogger.child({ subsystem: "DataUpdater" });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const throttledLogProgress = throttle(
      5000,
      (currentBlock: number, lastBlock: number, pendingEventsCount: number) => {
        indexerLogger.info(
          `pending events: ${pendingEventsCount} (indexing blocks ${currentBlock}-${lastBlock})`
        );
      }
    );

    const indexer = await createIndexer(
      rpcProvider,
      storage,
      async (indexer: Indexer<JsonStorage>, event: ChainsauceEvent) => {
        try {
          return await handleEvent(event, {
            chainId: config.chain.id,
            db: storage,
            subscribe: (...args) => indexer.subscribe(...args),
            ipfsGet: cachedIpfsGet,
            priceProvider,
            logger: indexerLogger,
          });
        } catch (err) {
          indexerLogger.warn({
            msg: "skipping event due to error while processing",
            err,
            event,
          });
        }
      },
      {
        toBlock: config.toBlock,
        logger: indexerLogger,
        eventCacheDirectory: null,
        requireExplicitStart: true,
        onProgress: ({ currentBlock, lastBlock, pendingEventsCount }) => {
          throttledLogProgress(currentBlock, lastBlock, pendingEventsCount);

          if (
            lastBlock - currentBlock < MINIMUM_BLOCKS_LEFT_BEFORE_STARTING &&
            !catchupSentinel.isDone()
          ) {
            indexerLogger.info({
              msg: "caught up with blockchain events",
              lastBlock,
              currentBlock,
            });
            catchupSentinel.declareDone();
          }
        },
      }
    );

    for (const subscription of config.chain.subscriptions) {
      chainLogger.info(`subscribing to ${subscription.address}`);
      indexer.subscribe(
        subscription.address,
        subscription.abi,
        Math.max(subscription.fromBlock || 0, config.fromBlock)
      );
    }

    indexer.start();

    await catchupSentinel.untilDone();

    if (config.runOnce) {
      priceUpdater.stop();
      indexer.stop();
    } else {
      chainLogger.info("listening to new blockchain events");
    }
  } catch (err) {
    chainLogger.error({
      msg: `error during initial catch up with chain ${config.chain.id}`,
      err,
    });
    throw err;
  }
}
