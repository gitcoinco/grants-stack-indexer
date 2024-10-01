import {
  createIndexer,
  createSqliteCache,
  createPostgresSubscriptionStore,
  createHttpRpcClient,
  SubscriptionStore,
  Cache,
} from "chainsauce";
import { Logger, pino } from "pino";
import path from "node:path";
import * as Sentry from "@sentry/node";
import fs from "node:fs/promises";
import fetch from "make-fetch-happen";
import { throttle } from "throttle-debounce";

import * as pg from "pg";
const { Pool, types } = pg.default;

import { postgraphile, makePluginHook } from "postgraphile";
import ConnectionFilterPlugin from "postgraphile-plugin-connection-filter";
import PgSimplifyInflectorPlugin from "@graphile-contrib/pg-simplify-inflector";
import GraphilePro from "@graphile/pro";

import { createPassportProvider, PassportProvider } from "./passport/index.js";

import { createResourceMonitor } from "./resourceMonitor.js";
import diskstats from "diskstats";
import { StatsD } from "hot-shots";

import { Chain, getConfig, Config, getChainConfigById } from "./config.js";
import { createPriceProvider, PriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { DatabaseDataProvider } from "./calculator/dataProvider/databaseDataProvider.js";
import { CachedDataProvider } from "./calculator/dataProvider/cachedDataProvider.js";
import { ethers } from "ethers";
import TTLCache from "@isaacs/ttlcache";

import abis from "./indexer/abis/index.js";
import type { EventHandlerContext } from "./indexer/indexer.js";
import { handleEvent as handleAlloV1Event } from "./indexer/allo/v1/handleEvent.js";
import { handleEvent as handleAlloV2Event } from "./indexer/allo/v2/handleEvent.js";
import { handleEvent as handleGitcoinAttestationNetworkEvent } from "./indexer/gitcoin-attestation-network/handleEvent.js";
import { Database } from "./database/index.js";
import { decodeJsonWithBigInts, getExternalIP } from "./utils/index.js";
import { Block } from "chainsauce/dist/cache.js";
import { createPublicClient, http } from "viem";
import { IndexerEvents } from "chainsauce/dist/indexer.js";

const RESOURCE_MONITOR_INTERVAL_MS = 1 * 60 * 1000; // every minute

const dogstatsd = new StatsD({
  host: "149.248.217.210",
  port: 8125,
  tagPrefix: "allo-indexer.",
});

function createPgPool(args: { url: string; logger: Logger }): pg.Pool {
  const pool = new Pool({
    connectionString: args.url,
    max: 15,

    // Maximum number of milliseconds a client in the pool is allowed to be idle before it is closed
    idleTimeoutMillis: 30_000,
    keepAlive: true,

    // Maximum number of milliseconds to wait for acquiring a client from the pool
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    args.logger.error({ err, url: args.url }, "Postgres pool error");
  });

  pool.on("connect", (client) => {
    client.on("error", (err) => {
      args.logger.error({ err, url: args.url }, "Postgres client error");
    });
  });

  return pool;
}
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

  const pinoTransport = config.pinoPretty
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
          },
        },
      }
    : {};

  const baseLogger = pino({
    msgPrefix: `[${config.dataVersion}] `,
    level: config.logLevel,
    formatters: {
      level(level) {
        // represent severity as strings so that DataDog can recognize it
        return { level };
      },
    },
    ...pinoTransport,
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

  await getExternalIP(baseLogger);

  if (config.cacheDir) {
    if (config.removeCache) {
      await fs.rm(config.cacheDir, { recursive: true });
      try {
        await fs.access(config.cacheDir);
        baseLogger.error("Cache folder is not removed");
      } catch (err) {
        baseLogger.info("Cache folder is removed");
      }
    }
    await fs.mkdir(config.cacheDir, { recursive: true });
  }

  const databaseConnectionPool = createPgPool({
    url: config.databaseUrl,
    logger: baseLogger,
  });

  const readOnlyDatabaseConnectionPool =
    config.readOnlyDatabaseUrl === config.databaseUrl
      ? databaseConnectionPool
      : createPgPool({
          url: config.readOnlyDatabaseUrl,
          logger: baseLogger,
        });

  const db = new Database({
    logger: baseLogger.child({ subsystem: "Database" }),
    statsUpdaterEnabled: config.indexerEnabled,
    connectionPool: databaseConnectionPool,
    chainDataSchemaName: config.databaseSchemaName,
    ipfsDataSchemaName: config.ipfsDatabaseSchemaName,
    priceDataSchemaName: config.priceDatabaseSchemaName,
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

  // the chainsauce cache is used to cache events and contract reads
  const chainsauceCache = config.cacheDir
    ? createSqliteCache(path.join(config.cacheDir, "chainsauceCache.db"))
    : null;

  const blockTimestampInMs = async (chainId: number, blockNumber: bigint) => {
    const cachedBlock = await chainsauceCache?.getBlockByNumber({
      chainId: chainId,
      blockNumber,
    });

    if (cachedBlock) {
      return cachedBlock.timestamp * 1000;
    }

    const chain = getChainConfigById(chainId);
    const client = createPublicClient({
      transport: http(chain.rpc),
    });

    const block = await client.getBlock({ blockNumber });
    const timestamp = Number(block.timestamp);

    const chainsauceBlock: Block = {
      chainId: chainId,
      blockNumber: BigInt(block.number),
      timestamp: timestamp,
      blockHash: block.hash,
    };

    await chainsauceCache?.insertBlock(chainsauceBlock);

    return timestamp * 1000;
  };

  const priceProvider = createPriceProvider({
    db,
    coingeckoApiUrl: config.coingeckoApiUrl,
    coingeckoApiKey: config.coingeckoApiKey,
    logger: baseLogger.child({ subsystem: "PriceProvider" }),
    getBlockTimestampInMs: async (chainId, blockNumber) => {
      return blockTimestampInMs(chainId, blockNumber);
    },
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        retry: false,
        cache: "force-cache",
        cachePath:
          config.cacheDir !== null
            ? path.join(config.cacheDir, "prices")
            : undefined,
      });
    },
  });

  if (config.enableResourceMonitor) {
    monitorAndLogResources({
      logger: baseLogger,
      directories: [config.storageDir].concat(
        config.cacheDir ? [config.cacheDir] : []
      ),
    });
  }

  async function indexChains(isFirstRun = false) {
    baseLogger.debug("attempting to acquire write lock");

    const lock = await db.acquireWriteLock();

    if (lock !== null) {
      if (isFirstRun) {
        if (config.dropDb) {
          baseLogger.info("dropping all schemas");
          await db.dropAllSchemaIfExists();
        } else if (config.dropChainDb) {
          baseLogger.info("resetting chain data schema");
          await db.dropChainDataSchemaIfExists();
        } else if (config.dropIpfsDb) {
          baseLogger.info("resetting ipfs data schema");
          await db.dropIpfsDataSchemaIfExists();
        } else if (config.dropPriceDb) {
          baseLogger.info("resetting price data schema");
          await db.dropPriceDataSchemaIfExists();
        }

        await db.createAllSchemas(baseLogger);
        await subscriptionStore.init();
      }

      const chains = config.chains.map((chain) =>
        catchupAndWatchChain({
          chainsauceCache,
          chain,
          db,
          subscriptionStore,
          baseLogger,
          priceProvider,
          blockTimestampInMs,
          ...config,
        })
      );

      if (!config.runOnce) {
        lock.client.on("end", async () => {
          baseLogger.info("lost write lock, stopping chains");

          for await (const chain of chains) {
            void chain.stop();
          }

          setTimeout(() => {
            void indexChains();
          }, 0);
        });
      }

      return Promise.all(chains);
    }

    if (config.runOnce) {
      return null;
    }

    setTimeout(() => {
      void indexChains();
    }, 5000);
  }

  let indexChainsPromise;

  const subscriptionStore = createPostgresSubscriptionStore({
    pool: databaseConnectionPool,
    schema: config.databaseSchemaName,
  });

  if (config.indexerEnabled) {
    indexChainsPromise = indexChains(true);
  }

  if (config.runOnce && indexChainsPromise) {
    await indexChainsPromise;
    baseLogger.info("exiting");
    return;
  }

  if (config.httpServerEnabled) {
    const [passportProvider] = await Promise.all([
      catchupAndWatchPassport({
        ...config,
        baseLogger,
        runOnce: config.runOnce,
      }),
      ...(config.httpServerWaitForSync ? [indexChainsPromise] : []),
    ]);

    const pluginHook = process.env.GRAPHILE_LICENSE
      ? makePluginHook([GraphilePro.default])
      : undefined;

    const graphqlHandler = postgraphile(
      readOnlyDatabaseConnectionPool,
      [
        config.databaseSchemaName,
        config.ipfsDatabaseSchemaName,
        config.priceDatabaseSchemaName,
      ],
      {
        watchPg: false,
        graphqlRoute: "/graphql",
        graphiql: true,
        graphiqlRoute: "/graphiql",
        enhanceGraphiql: true,
        disableDefaultMutations: true,
        dynamicJson: true,
        bodySizeLimit: "100kb", // response body limit
        pluginHook,
        disableQueryLog: true,
        // allowExplain: (req) => {
        //   return true;
        // },
        appendPlugins: [
          PgSimplifyInflectorPlugin.default,
          ConnectionFilterPlugin,
        ],
        legacyRelations: "omit",
        setofFunctionsContainNulls: false,
        exportGqlSchemaPath: "./schema.graphql",
        simpleCollections: "only",
        graphileBuildOptions: {
          pgOmitListSuffix: true,
          pgShortPk: true,
          connectionFilterRelations: true,
          connectionFilterUseListInflectors: true,
          connectionFilterAllowedOperators: [
            "isNull",
            "equalTo",
            "notEqualTo",
            "lessThan",
            "lessThanOrEqualTo",
            "greaterThan",
            "greaterThanOrEqualTo",
            "in",
            "notIn",
            "contains",
          ],
        },
        defaultPaginationCap: -1,
        graphqlCostLimit: -1,
        graphqlDepthLimit: 4,
      }
    );

    const httpApi = createHttpApi({
      db,
      priceProvider,
      passportProvider: passportProvider,
      dataVersion: config.dataVersion,
      dataProvider: new CachedDataProvider({
        dataProvider: new DatabaseDataProvider(db),
        cache: new TTLCache({
          max: 10,
          ttl: 1000 * 60 * 1, // 1 minute
        }),
      }),
      port: config.apiHttpPort,
      logger: baseLogger.child({ subsystem: "HttpApi" }),
      buildTag: config.buildTag,
      chains: config.chains,
      hostname: config.hostname,
      graphqlHandler: graphqlHandler,
      enableSentry: config.sentryDsn !== null,
      calculator: {
        esimatesLinearQfImplementation:
          config.estimatesLinearQfWorkerPoolSize === null
            ? {
                type: "in-thread",
              }
            : {
                type: "worker-pool",
                workerPoolSize: config.estimatesLinearQfWorkerPoolSize,
              },
      },
      indexedChains: await indexChainsPromise,
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
    chainsauceCache: Cache | null;
    subscriptionStore: SubscriptionStore;
    priceProvider: PriceProvider;
    blockTimestampInMs: (
      chainId: number,
      blockNumber: bigint
    ) => Promise<number>;
    db: Database;
    chain: Chain;
    baseLogger: Logger;
  }
) {
  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  const { db, priceProvider, blockTimestampInMs } = config;

  try {
    const cachedIpfsGet = async <T>(cid: string): Promise<T | undefined> => {
      const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;
      if (!cidRegex.test(cid)) {
        chainLogger.warn(`Invalid IPFS CID: ${cid}`);
        return undefined;
      }

      // Check if data is already in the IPFS database
      const ipfsData = await db.getDataByCid(cid);
      if (ipfsData) {
        // chainLogger.info(`Found IPFS data in database for CID: ${cid}`);
        return Promise.resolve(ipfsData.data as string as T);
      }

      // Fetch from a single IPFS gateway
      const fetchFromGateway = async (url: string): Promise<T | undefined> => {
        try {
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

          if (res.ok) {
            return (await res.json()) as T; // Return the fetched data
          } else {
            chainLogger.warn(
              `Failed to fetch from ${url}, status: ${res.status} ${res.statusText}`
            );
          }
        } catch (err) {
          chainLogger.error(
            `Error fetching from gateway ${url}: ${String(err)}`
          );
        }
      };

      // Iterate through each gateway and attempt to fetch data
      for (const gateway of config.ipfsGateways) {
        const url = `${gateway}/ipfs/${cid}`;
        // chainLogger.info(`Trying IPFS gateway: ${gateway} for CID: ${cid}`);

        const result = await fetchFromGateway(url);
        if (result !== undefined) {
          // chainLogger.info(
          //   `Fetch successful from gateway: ${gateway} for CID: ${cid}`
          // );

          // Save to IpfsData table
          try {
            await db.applyChange({
              type: "InsertIpfsData",
              ipfs: {
                cid,
                data: result, // TODO: check is JSON.parse is needed
              },
            });
          } catch (err) {
            chainLogger.error(
              `Error saving IPFS data to database: ${String(err)}`
            );
          }

          return result; // Return the result if fetched successfully
        } else {
          chainLogger.warn(
            `IPFS fetch failed for gateway ${gateway} for CID ${cid}`
          );
        }
      }

      chainLogger.error(
        `Failed to fetch IPFS data for CID ${cid} from all gateways.`
      );
      return undefined; // Return undefined if all gateways fail
    };

    chainLogger.info("DEBUG: catching up with blockchain events");

    const indexerLogger = chainLogger.child({ subsystem: "DataUpdater" });

    const viemRpcClient = createPublicClient({
      transport: http(config.chain.rpc),
    });

    const eventHandlerContext: EventHandlerContext = {
      chainId: config.chain.id,
      db,
      rpcClient: viemRpcClient,
      ipfsGet: cachedIpfsGet,
      priceProvider,
      blockTimestampInMs: blockTimestampInMs,
      logger: indexerLogger,
    };

    const rpcClient = createHttpRpcClient({
      retryDelayMs: 1000,
      maxConcurrentRequests: 10,
      maxRetries: 3,
      url: config.chain.rpc,
      onRequest({ method, params }) {
        chainLogger.trace({ msg: `RPC Request ${method}`, params });
      },
    });

    const indexer = createIndexer({
      contracts: abis,
      chain: {
        id: config.chain.id,
        maxBlockRange: config.chain.maxGetLogsRange
          ? BigInt(config.chain.maxGetLogsRange)
          : 100000n,
        pollingIntervalMs: 5 * 1000, // 5 seconds
        rpcClient,
      },
      context: eventHandlerContext,
      subscriptionStore: config.subscriptionStore,
      cache: config.chainsauceCache,
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
        // console.time(args.event.name);
        // do not await donation inserts as they are write only
        if (args.event.name === "Voted") {
          handleAlloV1Event(args)
            .then((changesets) => db.applyChanges(changesets))
            .catch((err: unknown) => {
              indexerLogger.warn({
                msg: "error while processing vote",
                err,
              });
            });
        } else if (args.event.name === "Allocated") {
          handleAlloV2Event(args)
            .then((changesets) => db.applyChanges(changesets))
            .catch((err: unknown) => {
              indexerLogger.warn({
                msg: "error while processing allocation",
                err,
              });
            });
        } else {
          let handler;

          if (args.event.contractName.startsWith("GitcoinAttestationNetwork")) {
            handler = handleGitcoinAttestationNetworkEvent;
          } else if (args.event.contractName.startsWith("AlloV1")) {
            handler = handleAlloV1Event;
          } else if (args.event.contractName.startsWith("AlloV2")) {
            handler = handleAlloV2Event;
          } else {
            indexerLogger.warn({
              msg: "skipping event due to unknown contract",
              event: args.event,
            });
            return;
          }

          const changesets = await handler(args);

          for (const changeset of changesets) {
            await db.applyChange(changeset);
          }
        }
      } catch (err) {
        indexerLogger.warn({
          msg: "skipping event due to error while processing",
          err,
          event: args.event,
        });
      } finally {
        // console.timeEnd(args.event.name);
      }
    });

    indexer.on(
      "progress",
      throttle<IndexerEvents["progress"]>(
        5000,
        ({ currentBlock, targetBlock, pendingEventsCount }) => {
          const progressPercentage = (
            (Number(currentBlock) / Number(targetBlock)) *
            100
          ).toFixed(1);

          const subscriptions = indexer.getSubscriptions();

          const activeSubscriptions = subscriptions.filter((sub) => {
            return sub.toBlock === "latest" || sub.toBlock < targetBlock;
          });

          const donationQueueLength = db.donationQueueLength();

          dogstatsd.gauge(
            `indexer.progress.${config.chain.id}`,
            Number(progressPercentage)
          );
          dogstatsd.gauge(
            `indexer.blockhead.${config.chain.id}`,
            Number(targetBlock)
          );

          indexerLogger.info(
            `${currentBlock}/${targetBlock} indexed (${progressPercentage}%) (pending events: ${pendingEventsCount}) (pending donations: ${donationQueueLength}) (contracts: ${activeSubscriptions.length})`
          );
        }
      )
    );

    const fromBlock =
      config.fromBlock === "latest"
        ? await rpcClient.getLastBlockNumber()
        : config.fromBlock;

    for (const subscription of config.chain.subscriptions) {
      const contractName = subscription.contractName;
      const subscriptionFromBlock =
        subscription.fromBlock === undefined
          ? undefined
          : BigInt(subscription.fromBlock);

      indexer.subscribeToContract({
        contract: contractName,
        address: subscription.address,
        fromBlock:
          subscriptionFromBlock !== undefined &&
          subscriptionFromBlock > fromBlock
            ? subscriptionFromBlock
            : fromBlock,
      });
    }

    await indexer.indexToBlock(config.toBlock);

    indexerLogger.info({
      msg: "caught up with blockchain events",
      toBlock: config.toBlock,
    });

    if (!config.runOnce) {
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

    return indexer;
  } catch (err) {
    chainLogger.error({
      msg: `error during initial catch up with chain ${config.chain.id}`,
      err,
    });
    Sentry.captureException(err);
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
