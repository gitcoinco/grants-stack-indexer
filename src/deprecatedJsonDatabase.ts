import { Hex } from "./types.js";
import { Application, Donation, Project, Round } from "./database/schema.js";
import { getAddress } from "viem";

function maybeChecksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch (e) {
    return address;
  }
}

export function createDeprecatedRound(round: Round): DeprecatedRound {
  return {
    id: maybeChecksumAddress(round.id.toString()),
    amountUSD: round.totalAmountDonatedInUsd,
    votes: round.totalDonationsCount,
    token: getAddress(round.matchTokenAddress),
    matchAmount: round.matchAmount.toString(),
    matchAmountUSD: round.matchAmountInUsd,
    uniqueContributors: round.uniqueDonorsCount,
    applicationMetaPtr: round.applicationMetadataCid,
    applicationMetadata: round.applicationMetadata,
    metaPtr: round.roundMetadataCid,
    metadata: round.roundMetadata as DeprecatedRound["metadata"],
    applicationsStartTime: round.applicationsStartTime
      ? Math.trunc(round.applicationsStartTime.getTime() / 1000).toString()
      : "",
    applicationsEndTime: round.applicationsEndTime
      ? Math.trunc(round.applicationsEndTime.getTime() / 1000).toString()
      : "",
    roundStartTime: round.donationsStartTime
      ? Math.trunc(round.donationsStartTime.getTime() / 1000).toString()
      : "",
    roundEndTime: round.donationsEndTime
      ? Math.trunc(round.donationsEndTime.getTime() / 1000).toString()
      : "",
    createdAtBlock: Number(round.createdAtBlock),
    updatedAtBlock: Number(round.updatedAtBlock),
  };
}

export function createDeprecatedVote(donation: Donation): DeprecatedVote {
  return {
    id: donation.id,
    transaction: donation.transactionHash,
    blockNumber: Number(donation.blockNumber),
    projectId: donation.projectId,
    roundId: donation.roundId,
    applicationId: donation.applicationId,
    token: getAddress(donation.tokenAddress),
    voter: getAddress(donation.donorAddress),
    grantAddress: getAddress(donation.recipientAddress),
    amount: donation.amount.toString(),
    amountUSD: donation.amountInUsd,
    amountRoundToken: donation.amountInRoundMatchToken.toString(),
  };
}

export function createDeprecatedApplication(
  application: Application
): DeprecatedApplication {
  return {
    id: application.id,
    projectId: application.projectId,
    anchorAddress: application.anchorAddress,
    status: application.status,
    amountUSD: application.totalAmountDonatedInUsd,
    votes: application.totalDonationsCount,
    uniqueContributors: application.uniqueDonorsCount,
    metadata: application.metadata as DeprecatedApplication["metadata"],
    createdAtBlock: Number(application.createdAtBlock),
    statusUpdatedAtBlock: Number(application.statusUpdatedAtBlock),
    roundId: application.roundId,
    statusSnapshots: application.statusSnapshots.map((snapshot) => ({
      status: snapshot.status,
      statusUpdatedAtBlock: Number(snapshot.updatedAtBlock),
    })),
  };
}

export function createDeprecatedProject(project: Project): DeprecatedProject {
  return {
    id: project.id,
    metaPtr: project.metadataCid,
    createdAtBlock: Number(project.createdAtBlock),
    projectNumber: project.projectNumber,
    metadata: project.metadata as DeprecatedProject["metadata"],
  };
}

export type DeprecatedRound = {
  id: Hex | string;
  amountUSD: number;
  votes: number;
  token: string;
  matchAmount: string;
  matchAmountUSD: number;
  uniqueContributors: number;
  applicationMetaPtr: string;
  applicationMetadata: unknown | null;
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

export type DeprecatedProject = {
  id: string;
  metaPtr: string | null;
  createdAtBlock: number;
  projectNumber: number | null;
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

export type DeprecatedDetailedVote = DeprecatedVote & {
  roundName?: string;
  projectTitle?: string;
  roundStartTime?: string;
  roundEndTime?: string;
};

export type DeprecatedApplication = {
  id: string;
  projectId: string;
  roundId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "IN_REVIEW";
  amountUSD: number;
  votes: number;
  uniqueContributors: number;
  anchorAddress: string | null;
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
  statusSnapshots: Array<{
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "IN_REVIEW";
    statusUpdatedAtBlock: number;
  }>;
};

export type DeprecatedVote = {
  id: string;
  transaction: Hex;
  blockNumber: number;
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
