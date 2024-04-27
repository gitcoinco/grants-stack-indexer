import "dotenv/config";
import { parseArgs } from "node:util";
import { ToBlock } from "chainsauce";
import { z } from "zod";
import path from "node:path";
import abis from "./indexer/abis/index.js";
import { Address, Hex } from "./types.js";
import os from "node:os";

type ChainId = number;
type CoingeckoSupportedChainId = 1 | 10 | 250 | 42161 | 43114 | 713715;

const CHAIN_DATA_VERSION = "63";

export type Token = {
  code: string;
  address: string;
  decimals: number;
  priceSource: { chainId: CoingeckoSupportedChainId; address: string };
  voteAmountCap?: bigint;
};

export type Subscription = {
  address: Hex;
  contractName: keyof typeof abis;
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
  maxGetLogsRange?: number;
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
      {
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x03506eD3f57892C85DB20C36846e9c808aFe9ef4",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x9Cb7f434aD3250d1656854A9eC7A71EceC6eE1EF",
        fromBlock: 16994474,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x4a850F463D1C4842937c5Bc9540dBc803D744c9F",
        fromBlock: 16994526,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0x8F8d78f119Aa722453d33d6881f4D400D67D054F",
        fromBlock: 16994526,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 16994526,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x56296242CA408bA36393f3981879fF9692F193cC",
        fromBlock: 16994451,
      },
      // Allo V2
      {
        contractName: "AlloV2/Registry/V1",
        address: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
        fromBlock: 18486688,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 18486975,
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
        code: "USDGLO",
        address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
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
      {
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "OP",
        address: "0x4200000000000000000000000000000000000042",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0x4200000000000000000000000000000000000042",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x04E753cFB8c8D1D7f776f7d7A033740961b6AEC2",
        fromBlock: 87169287,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x838C5e10dcc1e54d62761d994722367BA167AC22",
        fromBlock: 87168143,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xB5365543cdDa2C795AD104F4cB784EF3DB1CD383",
        fromBlock: 87168143,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0x2Bb670C3ffC763b691062d671b386E51Cf1840f0",
        fromBlock: 87168143,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd5Fb00093Ebd30011d932cB69bb6313c550aB05f",
        fromBlock: 87162429,
      },
      // Allo V2
      {
        contractName: "AlloV2/Registry/V1",
        address: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
        fromBlock: 111678968,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 111680064,
      },
    ],
  },
  {
    id: 11155111,
    name: "sepolia",
    rpc: rpcUrl
      .default("https://ethereum-sepolia.publicnode.com")
      .parse(process.env.SEPOLIA_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 11, 1, 0, 0, 0),
    tokens: [
      {
        code: "DAI",
        address: "0x8db0F9eE54753B91ec1d81Bf68074Be82ED30fEb",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
      {
        code: "DAI",
        address: "0xa9dd7983B57E1865024d27110bAB098B66087e8F",
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "USDC",
        address: "0x78e0D07C4A08adFfe610113310163b40E7e47e81",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
      },
    ],
    subscriptions: [
      {
        address: "0x2420EABfA2C0e6f77E435B0B7615c848bF4963AF",
        contractName: "AlloV1/ProjectRegistry/V2",
        fromBlock: 4738892,
      },
      {
        address: "0xF1d4F5f21746bCD75fD71eB18992443f4F0edb6f",
        contractName: "AlloV1/RoundFactory/V2",
        fromBlock: 4738000,
      },
      {
        address: "0xf5D111B57de221774866AC32c4435841F5c141D5",
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        fromBlock: 4738000,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xB5CF3fFD3BDfC6A124aa9dD96fE14118Ed8083e5",
        fromBlock: 4738000,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xC2B0d8dAdB88100d8509534BB8B5778d1901037d",
        fromBlock: 4738000,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x79Ba35cb31620db1b5b101A9A13A1b0A82B5BC9e",
        fromBlock: 4738000,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 4617051,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 4617314,
      },
      // Allo V1 -> V2 Migration
      {
        contractName: "AlloV2/AlloV1ToV2ProfileMigration",
        address: "0xCd5AbD09ee34BA604795F7f69413caf20ee0Ab60",
        fromBlock: 5100681,
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
        code: "FTM",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        fromBlock: 65169115,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xfb08d1fD3a7c693677eB096E722ABf4Ae63B0B95",
        fromBlock: 66509340,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x534d2AAc03dCd0Cb3905B591BAf04C14A95426AB",
        fromBlock: 66509340,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xFA1D9FF7F885757fc20Fdd9D78B72F88B00Cff77",
        fromBlock: 66509340,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0x9B1Ee60B539a3761E328a621A3d980EE9385679a",
        fromBlock: 66509340,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x4d1f64c7920262c8F78e989C9E7Bf48b7eC02Eb5",
        fromBlock: 65169115,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 77624278,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 77624963,
      },
    ],
  },
  {
    id: 58008,
    name: "pgn-testnet",
    rpc: rpcUrl
      .default("https://sepolia.publicgoods.network")
      .parse(process.env.PGN_TESTNET_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 5, 2, 0, 0, 0),
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x6294bed5B884Ae18bf737793Ef9415069Bf4bc11",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x0479b9DA9f287539FEBd597350B1eBaEBF7479ac",
        fromBlock: 0,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xE8027a807Bb85e57da4B7A5ecE65b0aBDf231ce8",
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
    pricesFromTimestamp: Date.UTC(2023, 5, 2, 0, 0, 0),
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 31239,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8AdFcF226dfb2fA73788Ad711C958Ba251369cb3",
        fromBlock: 31239,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        fromBlock: 31239,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0x27efa1C90e097c980c669AB1a6e326AD4164f1Cb",
        fromBlock: 31239,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0x0c33c9dEF7A3d9961b802C6C6402d306b7D48135",
        fromBlock: 31239,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 31239,
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
        code: "USDGLO",
        address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
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
      {
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 42161,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "GTC",
        address: "0x7f9a7db853ca816b9a138aee3380ef34c437dee0",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0xde30da39c46104798bb5aa3fe8b9e0e1f348163f",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x73AB205af1476Dc22104A6B8b3d4c273B58C6E27",
        fromBlock: 123566896,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
        fromBlock: 123566896,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xC3A195EEa198e74D67671732E1B8F8A23781D735",
        fromBlock: 123566896,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0x04b194b14532070F5cc8D3A760c9a0957D85ad5B",
        fromBlock: 123566896,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xc1a26b0789C3E93b07713e90596Cad8d0442C826",
        fromBlock: 123566896,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 123566896,
      },
      // Allo V1 -> V2 Migration
      {
        contractName: "AlloV2/AlloV1ToV2ProfileMigration",
        address: "0x1bFda15Ad5FC82E74Da81F0B8DcA486b3Ad14c71",
        fromBlock: 191943906,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 146489425,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 146498081,
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
        code: "MATIC",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
        fromBlock: 39793132,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xE1c5812e9831bc1d5BDcF50AAEc1a47C4508F3fA",
        fromBlock: 39793132,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xF7c101A95Ea4cBD5DA0Ab9827D7B2C9857440143",
        fromBlock: 39793132,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xc1a26b0789C3E93b07713e90596Cad8d0442C826",
        fromBlock: 39793132,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xD9B7Ce1F68A93dF783A8519ed52b74f5DcF5AFE1",
        fromBlock: 39793132,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 39793132,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 41939383,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 41940805,
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
        code: "MATIC",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
      {
        code: "DATA",
        address: "0x3a9A81d576d83FF21f26f325066054540720fC34",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x8f693ca8d21b157107184d29d398a8d082b38b76",
        },
      },
      {
        code: "USDGLO",
        address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
        decimals: 18,
        priceSource: {
          chainId: 10,
          address: "0x4f604735c1cf31399c6e711d5962b2b3e0225ad3",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x5C5E2D94b107C7691B08E43169fDe76EAAB6D48b",
        fromBlock: 47215935,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x5ab68dCdcA37A1C2b09c5218e28eB0d9cc3FEb03",
        fromBlock: 47215935,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xc1a26b0789C3E93b07713e90596Cad8d0442C826",
        fromBlock: 47215935,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xD0e19DBF9b896199F35Df255A1bf8dB3C787531c",
        fromBlock: 47215935,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
        fromBlock: 47215935,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xF7c101A95Ea4cBD5DA0Ab9827D7B2C9857440143",
        fromBlock: 47215935,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 49466006,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 49467628,
      },
    ],
  },
  {
    id: 8453,
    name: "base",
    rpc: rpcUrl
      .default("https://mainnet.base.org/")
      .parse(process.env.BASE_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 12, 1, 0, 0, 0),
    tokens: [
      {
        code: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xA78Daa89fE9C1eC66c5cB1c5833bC8C6Cb307918",
        contractName: "AlloV1/ProjectRegistry/V2",
        fromBlock: 7151900,
      },
      {
        address: "0xc7722909fEBf7880E15e67d563E2736D9Bb9c1Ab",
        contractName: "AlloV1/RoundFactory/V2",
        fromBlock: 7151900,
      },
      {
        address: "0xC3A195EEa198e74D67671732E1B8F8A23781D735",
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        fromBlock: 7151900,
      },
      {
        address: "0xF7c101A95Ea4cBD5DA0Ab9827D7B2C9857440143",
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        fromBlock: 7152110,
      },
      {
        address: "0x74c3665540FC8B92Dd06a7e56a51eCa038C18180",
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        fromBlock: 7151900,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 7151884,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 6083365,
      },
      {
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        contractName: "AlloV2/Allo/V1",
        fromBlock: 6084909,
      },
    ],
  },
  {
    id: 324,
    name: "zksync-era-mainnet",
    rpc: rpcUrl
      .default("https://mainnet.era.zksync.io")
      .parse(process.env.ZKSYNC_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 12, 1, 0, 0, 0),
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "USDC",
        address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
      },
      {
        code: "USDT",
        address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        },
      },
      {
        code: "DAI",
        address: "0x4B9eb6c0b6ea15176BBF62841C6B2A8a398cb656",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
      {
        code: "LUSD",
        address: "0x503234F203fC7Eb888EEC8513210612a43Cf6115",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
        },
      },
      {
        code: "MUTE",
        address: "0x0e97c7a0f8b2c9885c8ac9fc6136e829cbc21d42",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0xa49d7499271ae71cd8ab9ac515e6694c755d400c",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xe6CCEe93c97E20644431647B306F48e278aFFdb9",
        contractName: "AlloV1/ProjectRegistry/V2",
        fromBlock: 20900000,
      },
      {
        address: "0xF3B5a0d59C6292BD0e4f8Cf735EEF52b98f428E6",
        contractName: "AlloV1/RoundFactory/V2",
        fromBlock: 20900000,
      },
      {
        address: "0x94cB638556d3991363102431d8cE9e839C734677",
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        fromBlock: 20900000,
      },
      {
        address: "0x41A8F19C6CB88C9Cc98d29Cb7A4015629910fFc0",
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        fromBlock: 20900000,
      },
      {
        address: "0x0ccdfCB7e5DB60AAE5667d1680B490F7830c49C8",
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        fromBlock: 20900000,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x68a14AF71BFa0FE09fC937033f6Ea5153c0e75e4",
        fromBlock: 20907048,
      },
      {
        contractName: "AlloV2/Registry/V1",
        address: "0xaa376Ef759c1f5A8b0B5a1e2FEC5C23f3bF30246",
        fromBlock: 31154341,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x9D1D1BF2835935C291C0f5228c86d5C4e235A249",
        fromBlock: 31154408,
      },
    ],
  },
  {
    id: 280,
    name: "zksync-era-testnet",
    rpc: rpcUrl
      .default("https://sepolia.era.zksync.dev")
      .parse(process.env.ZKSYNC_TESTNET_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 12, 1, 0, 0, 0),
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "TEST",
        address: "0x8fd03Cd97Da068CC242Ab7551Dc4100DD405E8c7",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
    ],
    subscriptions: [
      {
        address: "0xb0F4882184EB6e3ed120c5181651D50719329788",
        contractName: "AlloV1/ProjectRegistry/V2",
      },
      {
        address: "0x0Bb6e2dfEaef0Db5809B3979717E99e053Cbae72",
        contractName: "AlloV1/RoundFactory/V2",
        fromBlock: 14410000,
      },
      {
        address: "0x8c28F21D2d8C53eedC58bF9cdCfb7DCF7d809d97",
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        fromBlock: 14410000,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0xbA160C13F8F626e3232078aDFD6eD2f2B2289563",
        fromBlock: 14410000,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0x4170665B31bC10009f8a69CeaACf3265C3d66797",
        fromBlock: 14410000,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x6D341814Be4E2316142D9190E390b494F1dECFAf",
        fromBlock: 14412765,
      },
      {
        contractName: "AlloV2/Registry/V1",
        address: "0xaa376Ef759c1f5A8b0B5a1e2FEC5C23f3bF30246",
        fromBlock: 14412765,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x9D1D1BF2835935C291C0f5228c86d5C4e235A249",
        fromBlock: 14412765,
      },
    ],
  },
  {
    id: 43114,
    name: "avalanche",
    rpc: rpcUrl
      .default("https://rpc.ankr.com/avalanche")
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
        code: "AVAX",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0x27efa1C90e097c980c669AB1a6e326AD4164f1Cb",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0x8AdFcF226dfb2fA73788Ad711C958Ba251369cb3",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 34540051,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 34540051,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 34540051,
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
        code: "AVAX",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 25380385,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
        fromBlock: 25380385,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        fromBlock: 25380385,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x862D7F621409cF572f179367DdF1B7144AcE1c76",
        fromBlock: 25380385,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 25380385,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 25380385,
      },
    ],
  },
  {
    id: 534351,
    name: "scroll-sepolia",
    rpc: rpcUrl
      .default("https://sepolia-rpc.scroll.io")
      .parse(process.env.SCROLL_SEPOLIA_RPC_URL),
    pricesFromTimestamp: Date.UTC(2024, 0, 1, 0, 0, 0),
    maxGetLogsRange: 2000,
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "MTK",
        address: "0xc2332031de487f430fae3290c05465d907785eda",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xA78Daa89fE9C1eC66c5cB1c5833bC8C6Cb307918",
        fromBlock: 2774478,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
        fromBlock: 2774478,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
        fromBlock: 2774478,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 2774478,
      },
      // Allo V2 not deployed yet to scroll sepolia - was not on our list.
      // {
      //   address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
      //   contractName: "AlloV2/Registry/V1",
      //   fromBlock: 2774478,
      // },
      // {
      //   contractName: "AlloV2/Allo/V1",
      //   address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
      //   fromBlock: 2774478,
      // },
    ],
  },
  {
    id: 534352,
    name: "scroll",
    rpc: rpcUrl
      .default("https://rpc.scroll.io")
      .parse(process.env.SCROLL_RPC_URL),
    pricesFromTimestamp: Date.UTC(2024, 0, 1, 0, 0, 0),
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
        code: "ETH",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 1,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "USDC",
        address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
        decimals: 6,
        priceSource: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
      },
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x29aAF7D4E83A778DAee08Fe04B0712c4C2989AD1",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x5b55728e41154562ee80027C1247B13382692e5C",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/DirectPayoutStrategyFactory/V2",
        address: "0xc7722909fEBf7880E15e67d563E2736D9Bb9c1Ab",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/MerklePayoutStrategyFactory/V2",
        address: "0x7ac74Be34b1A27E48a2525259719F877a57B2Aa4",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x5b55728e41154562ee80027C1247B13382692e5C",
        fromBlock: 2683205,
      },
      // Allo V2
      {
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        contractName: "AlloV2/Registry/V1",
        fromBlock: 2683205,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 2683205,
      },
    ],
  },
  {
    id: 713715,
    name: "sei-devnet",
    rpc: rpcUrl
      .default("https://evm-rpc-arctic-1.sei-apis.com")
      .parse(process.env.SEI_DEVNET_RPC_URL),
    pricesFromTimestamp: Date.UTC(2024, 0, 1, 0, 0, 0),
    tokens: [
      {
        code: "SEI",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        priceSource: {
          chainId: 713715,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "SEI",
        address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        decimals: 18,
        priceSource: {
          chainId: 713715,
          address: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        code: "WSEI",
        address: "0x26841a0A5D958B128209F4ea9a1DD7E61558c330",
        decimals: 18,
        priceSource: {
          chainId: 713715,
          address: "0x26841a0A5D958B128209F4ea9a1DD7E61558c330",
        },
      },
    ],
    subscriptions: [
      // Allo V2
      {
        contractName: "AlloV2/Registry/V1",
        address: "0x4aacca72145e1df2aec137e1f3c5e3d75db8b5f3",
        fromBlock: 14660337,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 14661917,
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
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
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

export const getTokenForChain = (
  chainId: ChainId,
  tokenAddress: Address
): Token | null => {
  const chain = getChainConfigById(chainId);

  const token = chain.tokens.find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );

  return token ?? null;
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
  chains: Chain[];
  runOnce: boolean;
  apiHttpPort: number;
  sentryDsn: string | null;
  databaseUrl: string;
  readOnlyDatabaseUrl: string;
  databaseSchemaName: string;
  hostname: string;
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
