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
  metadata: {
    quadraticFundingConfig?: {
      matchingFundsAvailable?: number;
      sybilDefense?: boolean;
      matchingCap?: boolean;
      matchingCapAmount?: number;
      minDonationThreshold?: boolean;
      minDonationThresholdAmount?: number;
    };
  } | null;
  applicationsStartTime: number;
  applicationsEndTime: number;
  roundStartTime: number;
  roundEndTime: number;
  createdAtBlock: number;
  updatedAtBlock: number;
};

export type Application = {
  id: string;
  projectId: string;
  roundId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  payoutAddress: string;
  amountUSD: number;
  votes: number;
  uniqueContributors: number;
  metadata: {
    application: {
      project: {
        title: string;
      };
      recipient: string;
    };
  };
};

export type Vote = {
  id: string;
  projectId: string;
  roundId: string;
  applicationId: string;
  token: string;
  voter: string;
  grantAddress: string;
  amount: string;
  amountUSD: number;
  amountRoundToken: string;
};

export type DetailedVote = Vote & {
  roundName: string;
  projectTitle: string;
};
