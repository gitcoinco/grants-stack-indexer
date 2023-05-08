export type Round = {
  id: string;
  amountUSD: number;
  votes: number;
  token: string;
  matchAmount: bigint;
  matchAmountUSD: number;
  uniqueContributors: number;
  applicationMetaPtr: string;
  applicationMetadata: string | null;
  metaPtr: string;
  metadata: string | null;
  applicationsStartTime: number;
  applicationsEndTime: number;
  roundStartTime: number;
  roundEndTime: number;
  createdAtBlock: number;
  updatedAtBlock: number;
};
