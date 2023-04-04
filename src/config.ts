import dotenv from "dotenv";

import ProjectRegistryABI from "../abis/ProjectRegistry.json" assert { type: "json" };
import RoundFactoryABI from "../abis/RoundFactory.json" assert { type: "json" };
import QuadraticFundingFactoryABI from "../abis/QuadraticFundingVotingStrategyFactory.json" assert { type: "json" };

dotenv.config();

type ChainConfig = {
  rpc: string;
  id: number;
  tokens: { code: string; address: string; decimals: number }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscriptions: { address: string; abi: any }[];
};

type Chains = Record<string, ChainConfig>;

const chains: Chains = {
  mainnet: {
    id: 1,
    rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    tokens: [
      {
        code: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
      {
        code: "DAI",
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        decimals: 18,
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    ],
    subscriptions: [
      {
        address: "0x03506eD3f57892C85DB20C36846e9c808aFe9ef4",
        abi: ProjectRegistryABI,
      },
      {
        address: "0xE2Bf906f7d10F059cE65769F53fe50D8E0cC7cBe",
        abi: RoundFactoryABI,
      },
      {
        address: "0x06A6Cc566c5A88E77B1353Cdc3110C2e6c828e38",
        abi: QuadraticFundingFactoryABI,
      },
    ],
  },
  goerli: {
    id: 5,
    rpc: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
    tokens: [
      {
        code: "USDC",
        address: "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
        decimals: 6,
      },
      {
        code: "DAI",
        address: "0x73967c6a0904aA032C103b4104747E88c566B1A2",
        decimals: 18,
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    ],
    subscriptions: [
      {
        address: "0x832c5391dc7931312CbdBc1046669c9c3A4A28d5",
        abi: ProjectRegistryABI,
      },
      {
        address: "0x5770b7a57BD252FC4bB28c9a70C9572aE6400E48",
        abi: RoundFactoryABI,
      },
      {
        address: "0x0000000000000000000000000000000000000000",
        abi: QuadraticFundingFactoryABI,
      },
    ],
  },
  optimism: {
    id: 10,
    rpc: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    tokens: [
      {
        code: "USDC",
        address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
        decimals: 6,
      },
      {
        code: "DAI",
        address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
        decimals: 18,
      },
      {
        code: "ETH",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    ],
    subscriptions: [
      {
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        abi: ProjectRegistryABI,
      },
      {
        address: "0x0f0A4961274A578443089D06AfB9d1fC231A5a4D",
        abi: RoundFactoryABI,
      },
      {
        address: "0xE1F4A28299966686c689223Ee7803258Dbde0942",
        abi: QuadraticFundingFactoryABI,
      },
    ],
  },
  fantom: {
    id: 250,
    rpc: "https://rpcapi.fantom.network",
    tokens: [
      {
        code: "USDC",
        address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        decimals: 6,
      },
      {
        code: "DAI",
        address: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
        decimals: 18,
      },
      {
        code: "FTM",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    ],
    subscriptions: [
      {
        address: "0x8e1bD5Da87C14dd8e08F7ecc2aBf9D1d558ea174",
        abi: ProjectRegistryABI,
      },
      {
        address: "0x3e7f72DFeDF6ba1BcBFE77A94a752C529Bb4429E",
        abi: RoundFactoryABI,
      },
      {
        address: "0x06A6Cc566c5A88E77B1353Cdc3110C2e6c828e38",
        abi: QuadraticFundingFactoryABI,
      },
    ],
  },
};

export default {
  storageDir: process.env.STORAGE_DIR || "./data",
  port: Number(process.env.PORT || "4000"),
  chains,
};
