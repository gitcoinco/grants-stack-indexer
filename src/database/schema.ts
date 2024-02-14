import {
  Selectable,
  ColumnType,
  Updateable,
  Insertable,
  Generated,
} from "kysely";

import { Address, Hex, ChainId } from "../types.js";

export type RoundTable = {
  id: Address | string;
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
  createdByAddress: Address;
  createdAtBlock: bigint;
  updatedAtBlock: bigint;
  totalAmountDonatedInUsd: number;
  totalDonationsCount: number;
  uniqueDonorsCount: number;
  managerRole: string;
  adminRole: string;
  strategyAddress: Address;
  strategyId: string;
  strategyName: string;

  projectId: string;

  tags: string[];
};

export type Round = Selectable<RoundTable>;
export type NewRound = Insertable<RoundTable>;
export type PartialRound = Updateable<RoundTable>;

// In Allo V2 rounds roles are emitted before a pool/round exists.
// The role emitted is the bytes32(poolId).
// Once a round is created we search for roles with that pool id
// and add real round roles. After that we can remove the pending round roles.
export type PendingRoundRoleTable = {
  id?: number;
  chainId: ChainId;
  role: string;
  address: Address;
  createdAtBlock: bigint;
};

export type PendingRoundRole = Selectable<PendingRoundRoleTable>;
export type NewPendingRoundRole = Insertable<PendingRoundRoleTable>;
export type PartialPendingRoundRole = Updateable<PendingRoundRoleTable>;

export type RoundRoleNames = "admin" | "manager";

export type RoundRoleTable = {
  chainId: ChainId;
  roundId: string;
  address: Address;
  role: RoundRoleNames;
  createdAtBlock: bigint;
};

export type RoundRole = Selectable<RoundRoleTable>;
export type NewRoundRole = Insertable<RoundRoleTable>;
export type PartialRoundRole = Updateable<RoundRoleTable>;

export type ProjectTable = {
  id: string;
  name: string;
  chainId: ChainId;
  projectNumber: number | null;
  registryAddress: Address;
  metadataCid: string | null;
  metadata: unknown | null;
  createdByAddress: Address;
  createdAtBlock: bigint;
  updatedAtBlock: bigint;
  tags: string[];
};

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type PartialProject = Updateable<ProjectTable>;

// In Allo V2 profile roles are emitted before a profile exists.
// The role emitted is the profile id.
// Once a profile is created we search for roles with that profile id
// and add real project roles. After that we can remove the pending project roles.
export type PendingProjectRoleTable = {
  id?: number;
  chainId: ChainId;
  role: string;
  address: Address;
  createdAtBlock: bigint;
};

export type PendingProjectRole = Selectable<PendingProjectRoleTable>;
export type NewPendingProjectRole = Insertable<PendingProjectRoleTable>;
export type PartialPendingProjectRole = Updateable<PendingProjectRoleTable>;

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
  createdByAddress: Address;
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
