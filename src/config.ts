import "dotenv/config";
import { parseArgs } from "node:util";
import { ToBlock } from "chainsauce";
import { z } from "zod";
import path from "node:path";
import os from "node:os";
import {
  TChain,
  getChainById,
  getChains,
} from "@gitcoin/gitcoin-chain-data";

const CHAIN_DATA_VERSION = "66";
const CHAINS: TChain[] = getChains();

export const getDecimalsForToken = (
  chainId: number,
  tokenAddress: string
): number => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (chain === undefined) {
    throw new Error(`No such chain: ${chainId}`);
  }

  const token = chain.tokens.find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (token === undefined) {
    throw new Error(
      `No such token: ${tokenAddress} configured for chain ${chainId}`
    );
  }

  return token.decimals;
};

export type Config = {
  buildTag: string | null;
  storageDir: string;
  cacheDir: string | null;
  fromBlock: bigint | "latest";
  toBlock: ToBlock;
  passportScorerId: number;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  httpServerWaitForSync: boolean;
  httpServerEnabled: boolean;
  indexerEnabled: boolean;
  ipfsGateway: string;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  chains: TChain[];
  runOnce: boolean;
  apiHttpPort: number;
  sentryDsn: string | null;
  databaseUrl: string;
  readOnlyDatabaseUrl: string;
  databaseSchemaName: string;
  hostname: string;
  pinoPretty: boolean;
  deploymentEnvironment: "local" | "development" | "staging" | "production";
  enableResourceMonitor: boolean;
  dropDb: boolean;
  estimatesLinearQfWorkerPoolSize: number | null;
};

export function getConfig(): Config {
  const buildTag = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.BUILD_TAG);

  const enableResourceMonitor = z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .parse(process.env.ENABLE_RESOURCE_MONITOR);

  const apiHttpPort = z.coerce.number().parse(process.env.PORT);

  const pinoPretty = z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true")
    .parse(process.env.PINO_PRETTY);

  const deploymentEnvironment = z
    .union([
      z.literal("local"),
      z.literal("development"),
      z.literal("staging"),
      z.literal("production"),
    ])
    .parse(process.env.DEPLOYMENT_ENVIRONMENT);

  const passportScorerId = z.coerce
    .number()
    .parse(process.env.PASSPORT_SCORER_ID);

  const coingeckoApiKey = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.COINGECKO_API_KEY);

  const coingeckoApiUrl =
    coingeckoApiKey === null
      ? "https://api.coingecko.com/api/v3"
      : "https://pro-api.coingecko.com/api/v3/";

  const storageDir = z
    .string()
    .default("./.var")
    .parse(process.env.STORAGE_DIR);

  const cacheDir = z
    .union([z.string(), z.null()])
    .default(path.join(storageDir, "cache"))
    .parse(process.env.CACHE_DIR);

  const { values: args } = parseArgs({
    options: {
      "to-block": {
        type: "string",
      },
      "from-block": {
        type: "string",
      },
      "drop-db": {
        type: "boolean",
      },
      "log-level": {
        type: "string",
      },
      "run-once": {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
      "http-wait-for-sync": {
        type: "string",
      },
      http: {
        type: "boolean",
      },
      indexer: {
        type: "boolean",
      },
    },
  });

  const chains = z
    .string()
    .or(z.literal("all"))
    .transform((value) => {
      if (value === "all") {
        return CHAINS;
      }

      return value.split(",").map((chainName) => {
        const c = CHAINS.find((chain) => chain.name === chainName);
        if (c === undefined) {
          throw new Error(`Chain ${chainName} not configured`);
        }
        return c;
      });
    })
    .parse(process.env.INDEXED_CHAINS);

  const toBlock = z
    .literal("latest")
    .or(z.coerce.bigint())
    .default("latest")
    .parse(args["to-block"]);

  const fromBlock = z
    .literal("latest")
    .or(z.coerce.bigint())
    .default(0n)
    .parse(args["from-block"]);

  const logLevel = z
    .union([
      z.literal("trace"),
      z.literal("debug"),
      z.literal("info"),
      z.literal("warn"),
      z.literal("error"),
    ])
    .default("info")
    .parse(args["log-level"] ?? process.env.LOG_LEVEL);

  const runOnce = z.boolean().default(false).parse(args["run-once"]);

  const ipfsGateway = z
    .string()
    .default("https://ipfs.io")
    .parse(process.env.IPFS_GATEWAY);

  const sentryDsn = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.SENTRY_DSN);

  const databaseUrl = z.string().url().parse(process.env.DATABASE_URL);
  const readOnlyDatabaseUrl = z
    .string()
    .url()
    .default(databaseUrl)
    .parse(process.env.READ_ONLY_DATABASE_URL);

  const databaseSchemaName = `chain_data_${CHAIN_DATA_VERSION}`;

  const dropDb = z.boolean().default(false).parse(args["drop-db"]);

  const parseBoolean = z
    .boolean()
    .or(z.enum(["true", "false"]).transform((value) => value === "true"));

  const estimatesLinearQfWorkerPoolSize = z.coerce
    .number()
    .nullable()
    .default(null)
    .parse(process.env.ESTIMATES_LINEARQF_WORKER_POOL_SIZE);

  const httpServerWaitForSync = z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true")
    .parse(args["http-wait-for-sync"] ?? process.env.HTTP_SERVER_WAIT_FOR_SYNC);

  const httpServerEnabled = parseBoolean
    .default(false)
    .parse(args["http"] ?? process.env.HTTP_ENABLED);

  const indexerEnabled = parseBoolean
    .default(false)
    .parse(args["indexer"] ?? process.env.INDEXER_ENABLED);

  return {
    buildTag: buildTag,
    sentryDsn,
    coingeckoApiUrl,
    coingeckoApiKey,
    storageDir,
    chains,
    toBlock,
    fromBlock,
    cacheDir,
    logLevel,
    runOnce,
    ipfsGateway,
    passportScorerId,
    apiHttpPort,
    pinoPretty,
    deploymentEnvironment,
    enableResourceMonitor,
    databaseUrl,
    readOnlyDatabaseUrl,
    dropDb,
    databaseSchemaName,
    httpServerWaitForSync,
    httpServerEnabled,
    indexerEnabled,
    hostname: os.hostname(),
    estimatesLinearQfWorkerPoolSize,
  };
}

const rpcUrls: { [key: number]: string | undefined } = {
  1: process.env.MAINNET_RPC_URL,
  10: process.env.OPTIMISM_RPC_URL,
  42: process.env.LUKSO_MAINNET_RPC_URL,
  137: process.env.POLYGON_RPC_URL,
  250: process.env.FANTOM_RPC_URL,
  300: process.env.ZKSYNC_TESTNET_RPC_URL,
  324: process.env.ZKSYNC_RPC_URL,
  424: process.env.PGN_RPC_URL,
  4201: process.env.LUKSO_TESTNET_RPC_URL,
  8453: process.env.BASE_RPC_URL,
  42161: process.env.ARBITRUM_RPC_URL,
  42220: process.env.CELO_MAINNET_RPC_URL,
  43113: process.env.AVALANCHE_FUJI_RPC_URL,
  43114: process.env.AVALANCHE_RPC_URL,
  44787: process.env.CELO_TESTNET_RPC_URL,
  58008: process.env.PGN_TESTNET_RPC_URL,
  80001: process.env.POLYGON_MUMBAI_RPC_URL,
  534351: process.env.SCROLL_SEPOLIA_RPC_URL,
  534352: process.env.SCROLL_RPC_URL,
  713715: process.env.SEI_DEVNET_RPC_URL,
  11155111: process.env.SEPOLIA_RPC_URL,
};

export const rpcOverride = (chainId: number): { rpc: string } | undefined => {
  const envRpc = rpcUrls[chainId];
  if (!envRpc) return undefined;
  return { rpc: envRpc };
};

export const chainById = (chainId: number): TChain => {
  return { ...getChainById(chainId), ...rpcOverride(chainId) };
};
