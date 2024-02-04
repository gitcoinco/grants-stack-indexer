import "dotenv/config";
import { parseArgs } from "node:util";
import { ToBlock } from "chainsauce";
import { z } from "zod";
import path from "node:path";
import abis from "./indexer/abis/index.js";
import { Hex } from "./types.js";
import os from "node:os";

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
};

const rpcUrl = z.string().url();

const CHAINS: Chain[] = [
  {
    id: 5,
    name: "goerli",
    rpc: rpcUrl
      .default("https://rpc.ankr.com/eth_goerli")
      .parse(process.env.GOERLI_RPC_URL),
    pricesFromTimestamp: Date.UTC(2023, 11, 1, 0, 0, 0),
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
      // Allo V2
      {
        contractName: "AlloV2/Registry/V1",
        address: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
        fromBlock: 9975287,
      },
      {
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
        fromBlock: 9975490,
      },
    ],
  },
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
        address: "0x20231D192a739B289c60144b83e4878983b3240e",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
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
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x4d1f64c7920262c8F78e989C9E7Bf48b7eC02Eb5",
        fromBlock: 65169115,
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
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8AdFcF226dfb2fA73788Ad711C958Ba251369cb3",
        fromBlock: 0,
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
        fromBlock: 0,
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x73AB205af1476Dc22104A6B8b3d4c273B58C6E27",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xC3A195EEa198e74D67671732E1B8F8A23781D735",
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        fromBlock: 123566896,
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x0CD135777dEaB6D0Bb150bDB0592aC9Baa4d0871",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xdf25423c9ec15347197Aa5D3a41c2ebE27587D59",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x0BFA0AAF5f2D81f859e85C8E82A3fc5b624fc6E8",
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd39b40aC9279EeeB86FBbDeb2C9acDF16e16cF89",
        fromBlock: 0,
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xE1c5812e9831bc1d5BDcF50AAEc1a47C4508F3fA",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xF7c101A95Ea4cBD5DA0Ab9827D7B2C9857440143",
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
    ],
    subscriptions: [
      {
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0x5C5E2D94b107C7691B08E43169fDe76EAAB6D48b",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x5ab68dCdcA37A1C2b09c5218e28eB0d9cc3FEb03",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0xc1a26b0789C3E93b07713e90596Cad8d0442C826",
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
    ],
    subscriptions: [
      {
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
        contractName: "AlloV1/ProjectRegistry/V2",
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
        contractName: "AlloV2/Allo/V1",
        address: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
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
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x68a14AF71BFa0FE09fC937033f6Ea5153c0e75e4",
        fromBlock: 20907048,
      },
    ],
  },
  {
    id: 280,
    name: "zksync-era-testnet",
    rpc: rpcUrl
      .default("https://testnet.era.zksync.dev")
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
        address: "0xb0F4882184EB6,e3ed120c5181651D50719329788",
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
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x6D341814Be4E2316142D9190E390b494F1dECFAf",
        fromBlock: 14412765,
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 34540182,
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
        contractName: "AlloV1/ProjectRegistry/V2",
        address: "0xDF9BF58Aa1A1B73F0e214d79C652a7dd37a6074e",
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0x8eC471f30cA797FD52F9D37A47Be2517a7BD6912",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x2AFA4bE0f2468347A2F086c2167630fb1E58b725",
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0x862D7F621409cF572f179367DdF1B7144AcE1c76",
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
      },
      {
        contractName: "AlloV1/RoundFactory/V2",
        address: "0xF2a07728107B04266015E67b1468cA0a536956C8",
      },
      {
        contractName: "AlloV1/QuadraticFundingVotingStrategyFactory/V2",
        address: "0x545B282A50EaeA01A619914d44105437036CbB36",
      },
      {
        contractName: "AlloV1/ProgramFactory/V1",
        address: "0xd07D54b0231088Ca9BF7DA6291c911B885cBC140",
        fromBlock: 2735989,
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

export type Config = {
  buildTag: string | null;
  storageDir: string;
  cacheDir: string | null;
  fromBlock: bigint;
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
  databaseUrl: string;
  databaseSchemaName: string;
  hostname: string;
  deploymentEnvironment: "local" | "development" | "staging" | "production";
  enableResourceMonitor: boolean;
  dropDb: boolean;
  estimatesLinearQfWorkerPoolSize: number | null;
};

const CHAIN_DATA_VERSION = "19";

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
    .literal("latest")
    .or(z.coerce.bigint())
    .default("latest")
    .parse(args["to-block"]);

  const fromBlock = z.coerce.bigint().default(0n).parse(args["from-block"]);

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
    .default("https://ipfs.io")
    .parse(process.env.IPFS_GATEWAY);

  const sentryDsn = z
    .union([z.string(), z.null()])
    .default(null)
    .parse(process.env.SENTRY_DSN);

  const hostname = os.hostname();

  const databaseUrl = z.string().url().parse(process.env.DATABASE_URL);

  const sqlSafeHostname = hostname.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const databaseSchemaName = `chain_data_${sqlSafeHostname}_${CHAIN_DATA_VERSION}`;

  const dropDb = z.boolean().default(false).parse(args["drop-db"]);

  const estimatesLinearQfWorkerPoolSize = z.coerce
    .number()
    .nullable()
    .default(null)
    .parse(process.env.ESTIMATES_LINEARQF_WORKER_POOL_SIZE);

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
    dropDb,
    databaseSchemaName,
    hostname: os.hostname(),
    estimatesLinearQfWorkerPoolSize,
  };
}
