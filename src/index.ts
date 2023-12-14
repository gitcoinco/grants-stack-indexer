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

import { postgraphile } from "postgraphile";
import ConnectionFilterPlugin from "postgraphile-plugin-connection-filter";
import PgSimplifyInflectorPlugin from "@graphile-contrib/pg-simplify-inflector";

import { createPassportProvider, PassportProvider } from "./passport/index.js";

import { createResourceMonitor } from "./resourceMonitor.js";
import diskstats from "diskstats";

import { Chain, getConfig, Config, getChainConfigById } from "./config.js";
import { createPriceProvider, PriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { DatabaseDataProvider } from "./calculator/index.js";
import { ethers } from "ethers";

import abis from "./indexer/abis/index.js";
import type { EventHandlerContext } from "./indexer/indexer.js";
import { handleEvent } from "./indexer/handleEvent.js";
import { Database } from "./database/index.js";
import { decodeJsonWithBigInts } from "./utils/index.js";
import { Block } from "chainsauce/dist/cache.js";
import { createPublicClient, http } from "viem";

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

  if (config.dropDb) {
    baseLogger.info("dropping schema");
    await db.dropSchemaIfExists();
  }

  await db.createSchemaIfNotExists(baseLogger);

  // the chainsauce cache is used to cache events and contract reads
  const chainsauceCache = config.cacheDir
    ? createSqliteCache(path.join(config.cacheDir, "chainsauceCache.db"))
    : null;

  const priceProvider = createPriceProvider({
    db,
    coingeckoApiUrl: config.coingeckoApiUrl,
    coingeckoApiKey: config.coingeckoApiKey,
    logger: baseLogger.child({ subsystem: "PriceProvider" }),
    getBlockTimestampInMs: async (chainId, blockNumber) => {
      const cachedBlock = await chainsauceCache?.getBlockByNumber({
        chainId,
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
        chainId,
        blockNumber: BigInt(block.number),
        timestamp: timestamp,
        blockHash: block.hash,
      };

      await chainsauceCache?.insertBlock(chainsauceBlock);

      return timestamp * 1000;
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

  if (config.runOnce) {
    await Promise.all(
      config.chains.map(async (chain) =>
        catchupAndWatchChain({
          chainsauceCache,
          chain,
          db,
          subscriptionStore,
          baseLogger,
          priceProvider,
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
      ...config.chains.map((chain) =>
        catchupAndWatchChain({
          chainsauceCache,
          chain,
          db,
          subscriptionStore,
          baseLogger,
          priceProvider,
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
        dynamicJson: true,
        bodySizeLimit: "100kb", // response body limit
        disableQueryLog: true,
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
        },

        // TODO: buy pro version?
        // defaultPaginationCap: 1000,
        // readOnlyConnection: true,
        // graphqlDepthLimit: 2
      }
    );

    const httpApi = createHttpApi({
      db,
      priceProvider,
      passportProvider: passportProvider,
      dataProvider: new DatabaseDataProvider(db),
      port: config.apiHttpPort,
      logger: baseLogger.child({ subsystem: "HttpApi" }),
      buildTag: config.buildTag,
      chains: config.chains,
      hostname: config.hostname,
      graphqlHandler: graphqlHandler,
      enableSentry: config.sentryDsn !== null,
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
    db: Database;
    chain: Chain;
    baseLogger: Logger;
  }
) {
  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  const { db, priceProvider } = config;

  try {
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

    const indexer = createIndexer({
      contracts: abis,
      chain: {
        maxBlockRange: 100000n,
        id: config.chain.id,
        pollingIntervalMs: 20 * 1000,
        rpcClient: createHttpRpcClient({
          retryDelayMs: 1000,
          maxConcurrentRequests: 10,
          maxRetries: 3,
          url: config.chain.rpc,
          onRequest({ method }) {
            indexerLogger.trace({
              msg: "JSON-RPC request",
              method,
            });
          },
        }),
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
          void handleEvent(args).then((changesets) => {
            for (const changeset of changesets) {
              db.applyChangeset(changeset).catch((err: unknown) => {
                indexerLogger.warn({
                  msg: "error while processing vote",
                  err,
                  changeset,
                });
              });
            }
          });
        } else {
          const changesets = await handleEvent(args);
          for (const changeset of changesets) {
            await db.applyChangeset(changeset);
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
