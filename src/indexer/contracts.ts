import type { ethers } from "ethers";
import type { MetaPtr } from "./types.js";

export type RoundContract = ethers.Contract & {
  matchAmount: () => Promise<ethers.BigNumber>;
  applicationMetaPtr: () => Promise<MetaPtr>;
  roundMetaPtr: () => Promise<MetaPtr>;
  token: () => Promise<string>;
  applicationsStartTime: () => Promise<ethers.BigNumber>;
  applicationsEndTime: () => Promise<ethers.BigNumber>;
  roundStartTime: () => Promise<ethers.BigNumber>;
  roundEndTime: () => Promise<ethers.BigNumber>;
};
