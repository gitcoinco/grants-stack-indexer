import dotenv from "dotenv";

import ProjectRegistryABI from "../abis/ProjectRegistry.json" assert { type: "json" };
import RoundFactoryABI from "../abis/RoundFactory.json" assert { type: "json" };
import QuadraticFundingFactoryABI from "../abis/QuadraticFundingVotingStrategyFactory.json" assert { type: "json" };

dotenv.config();

const chains = {
  mainnet: {
    rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
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
    rpc: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
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
    rpc: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
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
    rpc: `https://rpc.fantom.network`,
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
