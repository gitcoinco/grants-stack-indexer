import {
  buildIndexer,
  createJsonDatabase,
  createSqliteCache,
  createSqliteSubscriptionStore,
} from "chainsauce";
import { Logger, pino } from "pino";
import path from "node:path";
import * as Sentry from "@sentry/node";
import fs from "node:fs/promises";
import fetch from "make-fetch-happen";
import { throttle } from "throttle-debounce";

import { createPassportProvider, PassportProvider } from "./passport/index.js";
import { DeprecatedDiskCache } from "./diskCache.js";
import { Chain, getConfig, Config } from "./config.js";
import { createPriceUpdater } from "./prices/updater.js";
import { createPriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { FileSystemDataProvider } from "./calculator/index.js";
import { ethers } from "ethers";
import abis from "./indexer/abis/index.js";
import type { EventHandlerContext } from "./indexer/indexer.js";
import { handleEvent } from "./indexer/handleEvent.js";

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
      chainDataDir: config.chainDataDir,
      priceProvider: createPriceProvider({
        chainDataDir: config.chainDataDir,
        logger: baseLogger.child({ subsystem: "PriceProvider" }),
      }),
      passportProvider: passportProvider,
      dataProvider: new FileSystemDataProvider(config.chainDataDir),
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
      logger,
      scorerId: config.passportScorerId,
      dbPath: path.join(config.storageDir, "passport_scores.leveldb"),
      deprecatedJSONPassportDumpPath: path.join(
        config.chainDataDir,
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
      config.chainDataDir,
      config.chain.id.toString()
    );

    const pricesCache: DeprecatedDiskCache | null = config.cacheDir
      ? new DeprecatedDiskCache(path.join(config.cacheDir, "prices"))
      : null;

    // Force a full re-indexing on every startup.
    // XXX For the longer term, verify whether ChainSauce supports
    // any sort of stop-and-resume.
    await fs.rm(CHAIN_DIR_PATH, { force: true, recursive: true });

    const storage = createJsonDatabase({
      dir: CHAIN_DIR_PATH,
      writeDelay: 500,
    });

    const priceProvider = createPriceProvider({
      ...config,
      chainDataDir: config.chainDataDir,
      logger: chainLogger.child({ subsystem: "PriceProvider" }),
    });

    const rpcProvider = new ethers.providers.JsonRpcProvider(config.chain.rpc);

    const cachedIpfsGet = async <T>(cid: string): Promise<T | undefined> => {
      const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;
      if (!cidRegex.test(cid)) {
        chainLogger.warn(`Invalid IPFS CID: ${cid}`);
        return undefined;
      }

      const url = `${config.ipfsGateway}/ipfs/${cid}`;

      // chainLogger.trace(`Fetching ${url}`);

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
      chainDataDir: config.chainDataDir,
      rpcProvider,
      chain: config.chain,
      logger: chainLogger.child({ subsystem: "PriceUpdater" }),
      blockCachePath: config.cacheDir
        ? path.join(config.cacheDir, "blockCache.db")
        : undefined,
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

    const indexerLogger = chainLogger.child({ subsystem: "DataUpdater" });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const throttledLogProgress = throttle(
      5000,
      (currentBlock: number, lastBlock: number, pendingEventsCount: number) => {
        const progressPercentage = ((currentBlock / lastBlock) * 100).toFixed(
          1
        );

        indexerLogger.info(
          `${currentBlock}/${lastBlock} indexed (${progressPercentage}%) (pending events: ${pendingEventsCount})`
        );
      }
    );

    const eventHandlerContext: EventHandlerContext = {
      chainId: config.chain.id,
      db: storage,
      ipfsGet: cachedIpfsGet,
      priceProvider,
      logger: indexerLogger,
    };

    // the chainsauce cache is used to cache events and contract reads
    const chainsauceCache = config.cacheDir
      ? createSqliteCache(path.join(config.cacheDir, "chainsauceCache.db"))
      : null;

    // the subscription store is used to keep track of indexed events for resuming
    // indexing after a restart, it goes with the chain data
    const subscriptionStore = createSqliteSubscriptionStore(
      path.join(CHAIN_DIR_PATH, "subscriptions.db")
    );

    const indexer = buildIndexer()
      .chain({
        id: config.chain.id,
        name: config.chain.name,
        rpc: {
          url: config.chain.rpc,
        },
      })
      .context(eventHandlerContext)
      .subscriptionStore(subscriptionStore)
      .contracts(abis)
      .eventPollIntervalMs(20 * 1000)
      .cache(chainsauceCache)
      .onEvent(async (args) => {
        try {
          return await handleEvent(args);
        } catch (err) {
          indexerLogger.warn({
            msg: "skipping event due to error while processing",
            err,
            event: args.event,
          });
        }
      })
      .logLevel("trace")
      .logger((level, data: unknown, message?: string) => {
        if (level === "error") {
          indexerLogger.error(data, message);
        } else if (level === "warn") {
          indexerLogger.warn(data, message);
        } else if (level === "info") {
          indexerLogger.info(data, message);
        } else if (level === "debug") {
          indexerLogger.debug(data, message);
        } else if (level === "trace") {
          indexerLogger.trace(data, message);
        }
      })
      .events({
        ProjectRegistryV1: [
          "ProjectCreated",
          "OwnerRemoved",
          "OwnerAdded",
          "OwnerRemoved",
        ],
        ProjectRegistryV2: [
          "ProjectCreated",
          "OwnerRemoved",
          "OwnerAdded",
          "OwnerRemoved",
        ],
        RoundFactoryV2: ["RoundCreated"],
        RoundImplementationV2: [
          "MatchAmountUpdated",
          "RoundMetaPtrUpdated",
          "ApplicationMetaPtrUpdated",
          "NewProjectApplication",
          "ProjectsMetaPtrUpdated",
          "ApplicationStatusesUpdated",
        ],
        QuadraticFundingVotingStrategyFactoryV2: ["VotingContractCreated"],
        QuadraticFundingVotingStrategyImplementationV2: ["Voted"],
      })
      .build();

    for (const subscription of config.chain.subscriptions) {
      const contractName = subscription.contractName;
      const fromBlock =
        subscription.fromBlock === undefined
          ? undefined
          : BigInt(subscription.fromBlock);

      indexer.subscribeToContract({
        contract: contractName,
        address: subscription.address,
        fromBlock: fromBlock,
      });
    }

    indexer.on(
      "progress",
      ({ currentBlock, targetBlock, pendingEventsCount }) => {
        throttledLogProgress(
          Number(currentBlock),
          Number(targetBlock),
          pendingEventsCount
        );
      }
    );

    await indexer.indexToBlock(config.toBlock);

    indexerLogger.info({
      msg: "caught up with blockchain events",
      toBlock: config.toBlock,
    });

    if (config.runOnce) {
      priceUpdater.stop();
    } else {
      chainLogger.info("listening to new blockchain events");

      indexer.on("error", (err) => {
        chainLogger.error({
          msg: `error while watching chain ${config.chain.id}`,
          err,
        });
        Sentry.captureException(err);
      });

      indexer.watch();
    }
  } catch (err) {
    chainLogger.error({
      msg: `error during initial catch up with chain ${config.chain.id}`,
      err,
    });
    throw err;
  }
}
