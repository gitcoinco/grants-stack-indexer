import { ContractInterface } from "ethers";
import "dotenv/config";
import { parseArgs } from "node:util";
import { ToBlock } from "chainsauce";
import path from "node:path";
import * as abis from "./indexer/abis/index.js";

type ChainId = number;

export type Token = {
  code: string;
  address: string;
  decimals: number;
  priceSource: { chainId: ChainId; address: string };
};

export type Subscription = {
  address: string;
  abi: ContractInterface;
  fromBlock?: number;
  events?: Record<string, string>;
};

export type Chain = {
  rpc: string;
  name: string;
  id: ChainId;
  tokens: Token[];
  subscriptions: Subscription[];
};

export const CHAINS: Chain[] = [
  {
    id: 1,
    name: "mainnet",
    rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY ?? ""}`,
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
    id: 5,
    name: "goerli",
    rpc: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY ?? ""}`,
    tokens: [
      {
        code: "USDC",
        address: "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
      },
      {
        code: "DAI",
        address: "0x73967c6a0904aA032C103b4104747E88c566B1A2",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
      {
        code: "DAI",
        address: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844",
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
      {
        code: "BUSD",
        address: "0xa7c3bf25ffea8605b516cf878b7435fe1768c89b",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x4fabb145d64652a948d72533023f6e7a623c7c53",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x832c5391dc7931312CbdBc1046669c9c3A4A28d5",
        abi: abis.v1.ProjectRegistry,
      },
      {
        address: "0x5770b7a57BD252FC4bB28c9a70C9572aE6400E48",
        abi: abis.v1.RoundFactory,
        events: {
          RoundCreated: "RoundCreatedV1",
        },
      },
      {
        address: "0xa71864fAd36439C50924359ECfF23Bb185FFDf21",
        abi: abis.v2.ProjectRegistry,
        fromBlock: 8738420,
      },
      {
        address: "0x24F9EBFAdf095e0afe3d98635ee83CD72e49B5B0",
        abi: abis.v2.RoundFactory,
        fromBlock: 8738430,
      },
      {
        address: "0x06A6Cc566c5A88E77B1353Cdc3110C2e6c828e38",
        abi: abis.v2.QuadraticFundingVotingStrategyFactory,
        fromBlock: 8790265,
      },
    ],
  },
  {
    id: 10,
    name: "optimism",
    rpc: `https://opt-mainnet.g.alchemy.com/v2/${
      process.env.ALCHEMY_API_KEY ?? ""
    }`,
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
    rpc: "https://rpcapi.fantom.network",
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
    ],
    subscriptions: [
      {
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        abi: abis.v1.ProjectRegistry,
      },
      {
        address: "0x3e7f72DFeDF6ba1BcBFE77A94a752C529Bb4429E",
        abi: abis.v1.RoundFactory,
        events: {
          RoundCreated: "RoundCreatedV1",
        },
        fromBlock: 55528191,
      },
      {
        address: "0x06A6Cc566c5A88E77B1353Cdc3110C2e6c828e38",
        abi: abis.v1.QuadraticFundingVotingStrategyFactory,
        fromBlock: 55528191,
      },
    ],
  },
  {
    id: 58008,
    name: "pgn-testnet",
    rpc: "https://sepolia.publicgoods.network",
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
        events: {
          VotingContractCreated: "VotingContractCreatedV3",
        },
      },
    ],
  },
  {
    id: 424,
    name: "pgn-mainnet",
    rpc: "https://rpc.publicgoods.network",
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
];

// mapping of chain id => token address => decimals
export const tokenDecimals = Object.fromEntries(
  CHAINS.map((chain) => {
    return [
      chain.id,
      Object.fromEntries(
        chain.tokens.map((token) => [
          token.address.toLowerCase(),
          token.decimals,
        ])
      ),
    ];
  })
);

export type Config = {
  storageDir: string;
  fromBlock: number;
  toBlock: ToBlock;
  passportScorerId: string;
  passportApiKey: string;
  cacheDir: string | null;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  clear: boolean;
  ipfsGateway: string;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  chains: Chain[];
  runOnce: boolean;
  apiHttpPort: number;
  sentryDsn: string | null;
};

export function getConfig(): Config {
  const apiHttpPort = Number(process.env.PORT || "4000");

  if (!process.env.PASSPORT_SCORER_ID) {
    throw new Error("PASSPORT_SCORER_ID is not set");
  }
  if (!process.env.PASSPORT_API_KEY) {
    throw new Error("PASSPORT_SCORER_ID is not set");
  }
  const passportScorerId = process.env.PASSPORT_SCORER_ID;
  const passportApiKey = process.env.PASSPORT_API_KEY;

  const coingeckoApiKey = process.env.COINGECKO_API_KEY ?? null;

  const coingeckoApiUrl = process.env.COINGECKO_API_KEY
    ? "https://pro-api.coingecko.com/api/v3/"
    : "https://api.coingecko.com/api/v3";

  const storageDir = path.join(process.env.STORAGE_DIR || "./data");

  const { values: args } = parseArgs({
    options: {
      chains: {
        type: "string",
      },
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
      clear: {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
    },
  });

  if (typeof args.chains !== "string") {
    throw new Error("Chains not provided");
  }

  const chains = args.chains.split(",").map((chainName: string) => {
    const c = CHAINS.find((chain) => chain.name === chainName);
    if (c === undefined) {
      throw new Error(`Chain ${chainName} not configured`);
    }
    return c;
  });

  const toBlock =
    "to-block" in args
      ? args["to-block"] === "latest"
        ? ("latest" as const)
        : Number(args["to-block"])
      : ("latest" as const);

  const fromBlock = "from-block" in args ? Number(args["from-block"]) : 0;

  const logLevel = args["log-level"] ?? "info";
  if (
    logLevel !== "trace" &&
    logLevel !== "debug" &&
    logLevel !== "info" &&
    logLevel !== "warn" &&
    logLevel !== "error"
  ) {
    throw new Error(`Invalid log level: ${logLevel}`);
  }

  const clear = args.clear ?? false;

  const runOnce = args["run-once"] ?? false;

  const cacheDir = args["no-cache"]
    ? null
    : process.env.CACHE_DIR || "./.cache";

  const ipfsGateway = process.env.IPFS_GATEWAY || "https://cloudflare-ipfs.com";

  const sentryDsn = process.env.SENTRY_DSN ?? null;

  return {
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
    clear,
    ipfsGateway,
    passportApiKey,
    passportScorerId,
    apiHttpPort,
  };
}
