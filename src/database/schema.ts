import {
  Selectable,
  ColumnType,
  Updateable,
  Insertable,
  Generated,
} from "kysely";

import { Address, Hex, ChainId } from "../types.js";

export type RoundTable = {
  id: Address;
  chainId: ChainId;
  matchAmount: bigint;
  matchTokenAddress: Address;
  matchAmountInUsd: number;
  applicationMetadataCid: string;
  applicationMetadata: unknown | null;
  roundMetadataCid: string;
  roundMetadata: unknown;
  applicationsStartTime: Date | null;
  applicationsEndTime: Date | null;
  donationsStartTime: Date | null;
  donationsEndTime: Date | null;
  createdAtBlock: bigint;
  updatedAtBlock: bigint;
  totalAmountDonatedInUsd: number;
  totalDonationsCount: number;
  uniqueDonorsCount: number;
  tags: string[];
};

export type Round = Selectable<RoundTable>;
export type NewRound = Insertable<RoundTable>;
export type PartialRound = Updateable<RoundTable>;

export type ProjectTable = {
  id: string;
  name: string;
  chainId: ChainId;
  projectNumber: number;
  registryAddress: Address;
  metadataCid: string | null;
  metadata: unknown | null;
  ownerAddresses: Address[];
  createdAtBlock: bigint;
  tags: string[];
};

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type PartialProject = Updateable<ProjectTable>;

export type ProjectRoleNames = "owner" | "member";

export type ProjectRoleTable = {
  chainId: ChainId;
  projectId: string;
  address: Address;
  role: ProjectRoleNames;
  createdAtBlock: bigint;
};

export type ProjectRole = Selectable<ProjectRoleTable>;
export type NewProjectRole = Insertable<ProjectRoleTable>;
export type PartialProjectRole = Updateable<ProjectRoleTable>;

export type ApplicationStatus = "PENDING" | "REJECTED" | "APPROVED";

export type StatusSnapshot = {
  status: ApplicationStatus;
  statusUpdatedAtBlock: bigint;
};

export type ApplicationTable = {
  id: string;
  chainId: ChainId;
  roundId: Address;
  projectId: string;
  status: ApplicationStatus;
  statusSnapshots: ColumnType<
    StatusSnapshot[],
    StatusSnapshot[] | string,
    StatusSnapshot[] | string
  >;
  metadataCid: string | null;
  metadata: unknown | null;
  createdAtBlock: bigint;
  statusUpdatedAtBlock: bigint;
  totalDonationsCount: number;
  totalAmountDonatedInUsd: number;
  uniqueDonorsCount: number;
};

export type Application = Selectable<ApplicationTable>;
export type NewApplication = Insertable<ApplicationTable>;
export type PartialApplication = Updateable<ApplicationTable>;

export type DonationTable = {
  id: string;
  chainId: ChainId;
  roundId: Address;
  applicationId: string;
  donorAddress: Address;
  recipientAddress: Address;
  projectId: string;
  transactionHash: Hex;
  blockNumber: bigint;
  tokenAddress: Address;
  amount: bigint;
  amountInUsd: number;
  amountInRoundMatchToken: bigint;
};

export type NewDonation = Insertable<DonationTable>;
export type Donation = Selectable<DonationTable>;
export type PartialDonation = Updateable<DonationTable>;

export type PriceTable = {
  id: Generated<number>;
  chainId: ChainId;
  tokenAddress: Address;
  priceInUsd: number;
  timestamp: Date;
  blockNumber: bigint;
};

export type NewPrice = Insertable<PriceTable>;
export type Price = Selectable<PriceTable>;
export type PartialPrice = Updateable<PriceTable>;
