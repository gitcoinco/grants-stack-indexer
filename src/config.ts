import "dotenv/config";
import { ethers } from "ethers";
import { parseArgs } from "node:util";
import { ToBlock } from "chainsauce";
import { z } from "zod";
import path from "node:path";
import * as abis from "./indexer/abis/index.js";

type ChainId = number;
type CoingeckoSupportedChainId = 1 | 10 | 250 | 42161 | 43114;

export type Token = {
  code: string;
  address: string;
  decimals: number;
  priceSource: { chainId: CoingeckoSupportedChainId; address: string };
  voteAmountCap?: bigint;
};

export type Subscription = {
  address: string;
  abi: ethers.ContractInterface;
  fromBlock?: number;
  eventsRenames?: Record<string, string>;
};

export type Chain = {
  rpc: string;
  name: string;
  id: ChainId;
  pricesFromTimestamp: number;
  tokens: Token[];
  subscriptions: Subscription[];
};

const rpcUrl = z.string().url();

const CHAINS: Chain[] = [
  {
    id: 1,
    name: "mainnet",
    rpc: rpcUrl
      .default("https://mainnet.infura.io/v3/")
      .parse(process.env.MAINNET_RPC_URL),
    pricesFromTimestamp: Date.UTC(2022, 11, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
      },
      {
        code: "DAI",
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x03506eD3f57892C85DB20C36846e9c808aFe9ef4",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x9Cb7f434aD3250d1656854A9eC7A71EceC6eE1EF",
        abi: abis.v2.RoundFactory,
        fromBlock: 16994474,
      },
      {
        address: "0x4a850F463D1C4842937c5Bc9540dBc803D744c9F",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 16994526,
      },
    ],
  },
  {
    id: 10,
    name: "optimism",
    rpc: rpcUrl
      .default("https://opt-mainnet.g.alchemy.com/v2/")
      .parse(process.env.OPTIMISM_RPC_URL),
    pricesFromTimestamp: Date.UTC(2022, 11, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
        decimals: 6,
        priceSource: {
          chainId: 10,
          address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
        },
      },
      {
        code: "DAI",
        address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        },
      },
      {
        code: "GIST",
        address: "0x93a5347036f69bc6f37ed2b59cbcdda927719217",
        decimals: 18,
        voteAmountCap: BigInt(10e18),
        priceSource: {
          chainId: 10,
          address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        },
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x04E753cFB8c8D1D7f776f7d7A033740961b6AEC2",
        abi: abis.v2.RoundFactory,
        fromBlock: 87169287,
      },
      {
        address: "0x838C5e10dcc1e54d62761d994722367BA167AC22",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 87168143,
      },
    ],
  },
  {
    id: 250,
    name: "fantom",
    rpc: rpcUrl
      .default("https://rpcapi.fantom.network")
      .parse(process.env.FANTOM_RPC_URL),
    pricesFromTimestamp: Date.UTC(2022, 11, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        decimals: 6,
        priceSource: {
          chainId: 250,
          address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        },
      },
      {
        code: "DAI",
        address: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
        decimals: 18,
        priceSource: {
          chainId: 250,
          address: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
        },
      },
      {
        code: "FTM",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 250,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "GcV",
        address: "0x83791638da5EB2fAa432aff1c65fbA47c5D29510",
        decimals: 18,
        voteAmountCap: BigInt(10e18),
        priceSource: {
          chainId: 250,
          address: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0xfb08d1fD3a7c693677eB096E722ABf4Ae63B0B95",
        abi: abis.v2.RoundFactory,
        fromBlock: 66509340,
      },
      {
        address: "0x534d2AAc03dCd0Cb3905B591BAf04C14A95426AB",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 66509340,
      },
    ],
  },
  {
    id: 58008,
    name: "pgn-testnet",
    rpc: rpcUrl
      .default("https://sepolia.publicgoods.network")
      .parse(process.env.PGN_TESTNET_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 6, 12, 0, 0, 0),
    tokens: [
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "DAI",
        address: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x6294bed5B884Ae18bf737793Ef9415069Bf4bc11",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x0479b9DA9f287539FEBd597350B1eBaEBF7479ac",
        abi: abis.v2.RoundFactory,
        fromBlock: 0,
      },
      {
        address: "0xE8027a807Bb85e57da4B7A5ecE65b0aBDf231ce8",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 0,
      },
    ],
  },
  {
    id: 424,
    name: "pgn-mainnet",
    rpc: rpcUrl
      .default("https://rpc.publicgoods.network")
      .parse(process.env.PGN_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 6, 12, 0, 0, 0),
    tokens: [
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "GTC",
        address: "0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0xde30da39c46104798bb5aa3fe8b9e0e1f348163f",
        },
      },
      {
        code: "DAI",
        address: "0x6C121674ba6736644A7e73A8741407fE8a5eE5BA",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x8AdFcF226dfb2fA73788Ad711C958Ba251369cb3",
        abi: abis.v2.RoundFactory,
        fromBlock: 0,
      },
      {
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 0,
      },
    ],
  },
  {
    id: 42161,
    name: "arbitrum",
    rpc: rpcUrl
      .default("https://arb-mainnet.g.alchemy.com/v2/")
      .parse(process.env.ARBITRUM_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 7, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
        priceSource: {
          chainId: 42161,
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
      },
      {
        code: "ARB",
        address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        },
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x73AB205af1476Dc22104A6B8b3d4c273B58C6E27",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0xC3A195EEa198e74D67671732E1B8F8A23781D735",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
  {
    id: 421613,
    name: "arbitrum-goerli",
    rpc: rpcUrl
      .default("https://arb-goerli.g.alchemy.com/v2/")
      .parse(process.env.ARBITRUM_GOERLI_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 7, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0xfd064A18f3BF249cf1f87FC203E90D8f650f2d63",
        decimals: 6,
        priceSource: {
          chainId: 42161,
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
      },
      {
        code: "ARB",
        address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        },
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x0CD135777dEaB6D0Bb150bDB0592aC9Baa4d0871",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0xdf25423c9ec15347197Aa5D3a41c2ebE27587D59",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0x0BFA0AAF5f2D81f859e85C8E82A3fc5b624fc6E8",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
  {
    id: 80001,
    name: "polygon-mumbai",
    rpc: rpcUrl
      .default("https://rpc-mumbai.maticvigil.com/")
      .parse(process.env.POLYGON_MUMBAI_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 8, 19, 0, 0, 0),
    tokens: [
      {
        code: "MATIC",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
        },
      },
      {
        code: "USDC",
        address: "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0xE1c5812e9831bc1d5BDcF50AAEc1a47C4508F3fA",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0xF7c101A95Ea4cBD5DA0Ab9827D7B2C9857440143",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
  {
    id: 137,
    name: "polygon",
    rpc: rpcUrl
      .default("https://polygon-rpc.com")
      .parse(process.env.POLYGON_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 8, 19, 0, 0, 0),
    tokens: [
      {
        code: "MATIC",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
        },
      },
      {
        code: "USDC",
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x5C5E2D94b107C7691B08E43169fDe76EAAB6D48b",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x5ab68dCdcA37A1C2b09c5218e28eB0d9cc3FEb03",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0xc1a26b0789C3E93b07713e90596Cad8d0442C826",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
  {
    id: 43114,
    name: "avalanche",
    rpc: rpcUrl
      .default("https://avalanche-c-chain.publicnode.com")
      .parse(process.env.AVALANCHE_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 8, 19, 0, 0, 0),
    tokens: [
      {
        code: "AVAX",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 43114,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "USDC",
        address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
  {
    id: 43113,
    name: "avalanche-fuji",
    rpc: rpcUrl
      .default("https://avalanche-fuji-c-chain.publicnode.com")
      .parse(process.env.AVALANCHE_FUJI_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 8, 19, 0, 0, 0),
    tokens: [
      {
        code: "AVAX",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 43114,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "USDC",
        address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        abi: abis.v2.ProjectRegistry,
      },
      {
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
        abi: abis.v2.RoundFactory,
      },
      {
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
      },
    ],
  },
];

export const getDecimalsForToken = (
  chainId: ChainId,
  tokenAddress: string
): number => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (chain === undefined) {
    throw new Error(`No such chain: ${chainId}`);
  }

  const token = chain.tokens.find(
    (t) => t.address.toLowerCase() === tokenAddress
  );
  if (token === undefined) {
    throw new Error(
      `No such token: ${tokenAddress} configured for chain ${chainId}`
    );
  }

  return token.decimals;
};

export const getChainConfigById = (chainId: ChainId): Chain => {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (chain === undefined) {
    throw new Error(`Chain not configured: ${chainId}`);
  }
  return chain;
};

export type Config = {
  buildTag: string | null;
  storageDir: string;
  cacheDir: string | null;
  chainDataDir: string;
  fromBlock: number;
  toBlock: ToBlock;
  passportScorerId: number;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  ipfsGateway: string;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  chains: Chain[];
  runOnce: boolean;
  apiHttpPort: number;
  sentryDsn: string | null;
  deploymentEnvironment: "local" | "development" | "staging" | "production";
};

export function getConfig(): Config {
  const buildTag = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.BUILD_TAG);

  const apiHttpPort = z.coerce.number().parse(process.env.PORT);

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
    .default("./.var/storage")
    .parse(process.env.STORAGE_DIR);

  const cacheDir = z
    .union([z.string(), z.null()])
    .default(path.join(storageDir, "cache"))
    .parse(process.env.CACHE_DIR);

  const chainDataDir = path.join(storageDir, "chainData");

  const { values: args } = parseArgs({
    options: {
      "to-block": {
        type: "string",
      },
      "from-block": {
        type: "string",
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
    },
  });

  const chains = z
    .string()
    .parse(process.env.INDEXED_CHAINS)
    .split(",")
    .map((chainName) => {
      const c = CHAINS.find((chain) => chain.name === chainName);
      if (c === undefined) {
        throw new Error(`Chain ${chainName} not configured`);
      }
      return c;
    });

  const toBlock = z
    .union([z.coerce.number(), z.literal("latest")])
    .default("latest")
    .parse(args["to-block"]);

  const fromBlock = z.coerce.number().default(0).parse(args["from-block"]);

  const logLevel = z
    .union([
      z.literal("trace"),
      z.literal("debug"),
      z.literal("info"),
      z.literal("warn"),
      z.literal("error"),
    ])
    .default("info")
    .parse(process.env.LOG_LEVEL);

  const runOnce = z.boolean().default(false).parse(args["run-once"]);

  const ipfsGateway = z
    .string()
    .default("https://cloudflare-ipfs.com")
    .parse(process.env.IPFS_GATEWAY);

  const sentryDsn = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.SENTRY_DSN);

  return {
    buildTag: buildTag,
    sentryDsn,
    coingeckoApiUrl,
    coingeckoApiKey,
    storageDir,
    chains,
    toBlock,
    chainDataDir,
    fromBlock,
    cacheDir,
    logLevel,
    runOnce,
    ipfsGateway,
    passportScorerId,
    apiHttpPort,
    deploymentEnvironment,
  };
}
