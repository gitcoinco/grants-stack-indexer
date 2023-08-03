import { RetryProvider, JsonStorage, Cache } from "chainsauce";
import { Logger, pino } from "pino";
import path from "node:path";
import * as Sentry from "@sentry/node";
import fs from "node:fs/promises";
import fetch from "make-fetch-happen";
import { ethers } from "ethers";

import { createPassportProvider, PassportProvider } from "./passport/index.js";

import handleEvent from "./indexer/handleEvent.js";
import { Chain, getConfig, Config } from "./config.js";
import { createPriceUpdater } from "./prices/updater.js";
import { createPriceProvider } from "./prices/provider.js";
import { createHttpApi } from "./http/app.js";
import { FileSystemDataProvider } from "./calculator/index.js";
import { createBlockchainListener } from "./indexer/listener.js";

// If, during reindexing, a chain has these many blocks left to index, consider
// it caught up and start serving
const MINIMUM_BLOCKS_LEFT_BEFORE_STARTING = 500;

async function main(): Promise<void> {
  const config = getConfig();

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
    chains: config.chains.map((c) => c.name),
  });

  // Promise will be resolved once the catchup is done. Afterwards, services
  // will still be in listen-and-update mode
  const [passportProvider, _] = await Promise.all([
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

  if (!config.runOnce) {
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
  await fs.mkdir(config.storageDir, { recursive: true });

  const passportProvider = createPassportProvider({
    apiKey: config.passportApiKey,
    logger: config.baseLogger.child({ subsystem: "PassportProvider" }),
    scorerId: config.passportScorerId,
    dbPath: path.join(config.storageDir, "..", "passport_scores.leveldb"),
  });

  await passportProvider.start({ watch: !config.runOnce });

  return passportProvider;
}

async function catchupAndWatchChain(
  config: Omit<Config, "chains"> & { chain: Chain; baseLogger: Logger }
): Promise<void> {
  const CHAIN_DIR_PATH = path.join(
    config.storageDir,
    config.chain.id.toString()
  );

  const chainLogger = config.baseLogger.child({
    chain: config.chain.id,
  });

  const rpcProvider = new RetryProvider({
    url: config.chain.rpc,
    timeout: 5 * 60 * 1000,
  });

  const priceProvider = createPriceProvider({
    ...config,
    logger: chainLogger.child({ subsystem: "PriceProvider" }),
  });

  const storage = new JsonStorage(CHAIN_DIR_PATH);

  const cachedIpfsGet = async <T>(cid: string): Promise<T | undefined> => {
    const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;
    if (!cidRegex.test(cid)) {
      chainLogger.warn(`Invalid IPFS CID: ${cid}`);
      return undefined;
    }

    const res = await fetch(`${config.ipfsGateway}/ipfs/${cid}`, {
      timeout: 2000,
      retry: { retries: 10, maxTimeout: 60 * 1000 },
      // IPFS data is immutable, we can rely entirely on the cache when present
      cache: "force-cache",
      cachePath:
        config.cacheDir !== null
          ? path.join(config.cacheDir, "ipfs")
          : undefined,
    });

    return (await res.json()) as T;
  };

  const pricesCache: Cache | null = config.cacheDir
    ? new Cache(path.join(config.cacheDir, "prices"))
    : null;

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

  // Force a full re-indexing on every startup.
  // XXX For the longer term, verify whether ChainSauce supports
  // any sort of stop-and-resume.
  chainLogger.debug(`removing data dir (${CHAIN_DIR_PATH}) to start fresh`);
  await fs.rm(CHAIN_DIR_PATH, { force: true, recursive: true });

  await priceUpdater.start({
    watch: !config.runOnce,
    toBlock: config.toBlock,
  });

  return new Promise<void>((resolve) => {
    const blockchainListener = createBlockchainListener({
      logger: chainLogger.child({ subsystem: "DataUpdater" }),
      onEvent: async (event, onContractRequested) => {
        await handleEvent(event, {
          chainId: config.chain.id,
          db: storage,
          ipfsGet: cachedIpfsGet,
          priceProvider,
          // XXX should rename to getContract
          subscribe: (address, abi) => {
            onContractRequested(address, abi);
            return new ethers.Contract(address, abi, rpcProvider);
          },
        });
      },
      onCaughtUp: () => {
        resolve();
      },
      rpcProvider,
      eventLogPath: `/tmp/events-${config.chain.id}.ndjson`,
      storage,
      chain: config.chain,
      toBlock: config.toBlock,
    });

    void blockchainListener.start();
  });
}
