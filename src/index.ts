import {
  createIndexer,
  createSqliteCache,
  createPostgresSubscriptionStore,
  createHttpRpcClient,
  SubscriptionStore,
} from "chainsauce";
import { Logger, pino } from "pino";
import path from "node:path";
import * as Sentry from "@sentry/node";
import fs from "node:fs/promises";
import fetch from "make-fetch-happen";
import { throttle } from "throttle-debounce";
import * as pg from "pg";

const { Pool, types } = pg.default;

import { createPassportProvider, PassportProvider } from "./passport/index.js";

import { createResourceMonitor } from "./resourceMonitor.js";
import diskstats from "diskstats";

import { DeprecatedDiskCache } from "./diskCache.js";
import { Chain, getConfig, Config } from "./config.js";
import { createPriceUpdater } from "./prices/updater.js";
import { createPriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { DatabaseDataProvider } from "./calculator/index.js";
import { ethers } from "ethers";

import abis from "./indexer/abis/index.js";
import type { EventHandlerContext } from "./indexer/indexer.js";
import { handleEvent } from "./indexer/handleEvent.js";
import { Database } from "./database/index.js";
import { decodeJsonWithBigInts } from "./utils/index.js";
import { postgraphile } from "postgraphile";

const RESOURCE_MONITOR_INTERVAL_MS = 1 * 60 * 1000; // every minute

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

  // parse postgres numeric(78,0) as bigint
  types.setTypeParser(1700, function (val) {
    return BigInt(val);
  });

  // parse postgres jsonb with bigint support
  types.setTypeParser(3802, function (val) {
    return decodeJsonWithBigInts(val);
  });

  const databaseConnectionPool = new Pool({
    connectionString: config.databaseUrl,
  });

  const subscriptionStore = createPostgresSubscriptionStore({
    pool: databaseConnectionPool,
    schema: config.databaseSchemaName,
  });

  const db = new Database({
    connectionPool: databaseConnectionPool,
    schemaName: config.databaseSchemaName,
  });

  if (config.dropDb) {
    await db.dropSchemaIfExists();
  }

  await db.createSchemaIfNotExists();

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

  if (config.enableResourceMonitor) {
    monitorAndLogResources({
      logger: baseLogger,
      directories: [config.storageDir].concat(
        config.cacheDir ? [config.cacheDir] : []
      ),
    });
  }

  if (config.runOnce) {
    await Promise.all(
      config.chains.map(async (chain) =>
        catchupAndWatchChain({
          chain,
          db,
          subscriptionStore,
          baseLogger,
          ...config,
        })
      )
    );
    baseLogger.info("exiting");
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
        catchupAndWatchChain({
          chain,
          db,
          subscriptionStore,
          baseLogger,
          ...config,
        })
      ),
    ]);

    // TODO: use read only connection, use separate pool?
    const graphqlHandler = postgraphile(
      databaseConnectionPool,
      config.databaseSchemaName,
      {
        watchPg: false,
        graphqlRoute: "/graphql",
        graphiql: true,
        graphiqlRoute: "/graphiql",
        enhanceGraphiql: true,
        disableDefaultMutations: true,

        // TODO: buy pro version?
        // defaultPaginationCap: 1000,
        // readOnlyConnection: true,
        // graphqlDepthLimit: 2
      }
    );

    const httpApi = createHttpApi({
      chainDataDir: config.chainDataDir,
      priceProvider: createPriceProvider({
        chainDataDir: config.chainDataDir,
        logger: baseLogger.child({ subsystem: "PriceProvider" }),
      }),
      passportProvider: passportProvider,
      dataProvider: new DatabaseDataProvider(db),
      port: config.apiHttpPort,
      logger: baseLogger.child({ subsystem: "HttpApi" }),
      buildTag: config.buildTag,
      chains: config.chains,
      hostname: config.hostname,
      graphqlHandler: graphqlHandler,
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
    await fs.mkdir(config.chainDataDir, { recursive: true });

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
  config: Omit<Config, "chains"> & {
    subscriptionStore: SubscriptionStore;
    db: Database;
    chain: Chain;
    baseLogger: Logger;
  }
) {
  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  const db = config.db;

  try {
    const CHAIN_DIR_PATH = path.join(
      config.chainDataDir,
      config.chain.id.toString()
    );

    // Force a full re-indexing on every startup.
    await fs.rm(CHAIN_DIR_PATH, { recursive: true, force: true });
    await fs.mkdir(CHAIN_DIR_PATH, { recursive: true });

    const pricesCache: DeprecatedDiskCache | null = config.cacheDir
      ? new DeprecatedDiskCache(path.join(config.cacheDir, "prices"))
      : null;

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
      db,
      ipfsGet: cachedIpfsGet,
      priceProvider,
      logger: indexerLogger,
    };

    // the chainsauce cache is used to cache events and contract reads
    const chainsauceCache = config.cacheDir
      ? createSqliteCache(path.join(config.cacheDir, "chainsauceCache.db"))
      : null;

    const indexer = createIndexer({
      contracts: abis,
      chain: {
        id: config.chain.id,
        pollingIntervalMs: 20 * 1000,
        rpcClient: createHttpRpcClient({
          retryDelayMs: 1000,
          maxConcurrentRequests: 10,
          maxRetries: 3,
          url: config.chain.rpc,
        }),
      },
      context: eventHandlerContext,
      subscriptionStore: config.subscriptionStore,
      cache: chainsauceCache,
      logLevel: "trace",
      logger: (level, msg, data) => {
        if (level === "error") {
          indexerLogger.error({ msg, data });
        } else if (level === "warn") {
          indexerLogger.warn({ msg, data });
        } else if (level === "info") {
          indexerLogger.info({ msg, data });
        } else if (level === "debug") {
          indexerLogger.debug({ msg, data });
        } else if (level === "trace") {
          indexerLogger.trace({ msg, data });
        }
      },
    });

    indexer.on("event", async (args) => {
      try {
        const mutations = await handleEvent(args);

        for (const mutation of mutations) {
          await db.mutate(mutation);
        }
      } catch (err) {
        indexerLogger.warn({
          msg: "skipping event due to error while processing",
          err,
          event: args.event,
        });
      }
    });

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

    return db;
  } catch (err) {
    chainLogger.error({
      msg: `error during initial catch up with chain ${config.chain.id}`,
      err,
    });
    throw err;
  }
}

function monitorAndLogResources(config: {
  logger: Logger;
  directories: string[];
}) {
  const resourceMonitorLogger = config.logger.child({
    subsystem: "ResourceMonitor",
  });

  resourceMonitorLogger.info({ msg: "starting resource monitor" });

  const resourceMonitor = createResourceMonitor({
    logger: resourceMonitorLogger,
    diskstats,
    directories: config.directories,
    pollingIntervalMs: RESOURCE_MONITOR_INTERVAL_MS,
  });

  resourceMonitor.start();
}
