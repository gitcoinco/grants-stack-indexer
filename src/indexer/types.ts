import type { Event as ChainsauceEvent } from "chainsauce";
import { ethers } from "ethers";

type EventArguments = {
  RoundMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  MatchAmountUpdated: {
    newAmount: ethers.BigNumber;
  };
  ApplicationMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  NewProjectApplication: {
    projectID: ethers.BigNumber;
    project: string;
    applicationIndex: ethers.BigNumber;
    applicationMetaPtr: MetaPtr;
  };
  ProjectsMetaPtrUpdated: {
    newMetaPtr: MetaPtr;
  };
  ApplicationStatusesUpdated: {
    index: ethers.BigNumber;
    status: ethers.BigNumber;
  };
  VotingContractCreatedV1: {
    votingContractAddress: string;
  };
  VotingContractCreated: {
    votingContractAddress: string;
  };
  Voted: {
    roundAddress: string;
    applicationIndex?: ethers.BigNumber;
    projectId: string;
    amount: ethers.BigNumber;
    grantAddress: string;
    voter: string;
    contributor: string;
    token: string;
  };
  ProjectCreated: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  MetadataUpdated: {
    projectID: ethers.BigNumber;
    metaPtr: MetaPtr;
  };
  OwnerAdded: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  OwnerRemoved: {
    projectID: ethers.BigNumber;
    owner: string;
  };
  RoundCreatedV1: {
    roundAddress: string;
    token: string;
  };
  RoundCreated: {
    roundAddress: string;
    token: string;
  };
};

export type Events = {
  [A in keyof EventArguments]: Omit<ChainsauceEvent, "name" | "args"> & {
    name: A;
    args: EventArguments[A];
  };
};

export type Event = Events[keyof Events];

export type MetaPtr = {
  pointer: string;
};

export type Round = {
  id: string;
  amountUSD: number;
  votes: number;
  token: string;
  matchAmount: string;
  matchAmountUSD: number;
  uniqueContributors: number;
  applicationMetaPtr: string;
  applicationMetadata: string | null;
  metaPtr: string;
  metadata: {
    name: string;
    quadraticFundingConfig?: {
      matchingFundsAvailable?: number;
      sybilDefense?: boolean;
      matchingCap?: boolean;
      matchingCapAmount?: number;
      minDonationThreshold?: boolean;
      minDonationThresholdAmount?: number;
    };
  } | null;
  applicationsStartTime: string;
  applicationsEndTime: string;
  roundStartTime: string;
  roundEndTime: string;
  createdAtBlock: number;
  updatedAtBlock: number;
};

export type Project = {
  id: string;
  metaPtr: string | null;
  owners: Array<string>;
  createdAtBlock: number;
  projectNumber: number;
  metadata: {
    title: string;
    description: string;
    website: string;
    projectTwitter: string;
    projectGithub: string;
    userGithub: string;
    logoImg: string;
    bannerImg: string;
    logoImgData: string;
    bannerImgData: string;
    cretedAt: number;
  } | null;
};

export type Contributor = { id: string; amountUSD: number; votes: number };

export type Application = {
  id: string;
  projectId: string;
  roundId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  amountUSD: number;
  votes: number;
  uniqueContributors: number;
  metadata: {
    application: {
      project: {
        title: string;
        website: string;
        projectTwitter: string;
        projectGithub: string;
        userGithub: string;
      };
      answers: Array<{
        question: string;
        answer: string;
        encryptedAnswer: string | null;
      }>;
      recipient: string;
    };
  } | null;
  createdAtBlock: number;
  statusUpdatedAtBlock: number;
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
  roundName?: string;
  projectTitle?: string;
  roundStartTime?: string;
  roundEndTime?: string;
};
