import { Selectable, ColumnType, Updateable, Insertable } from "kysely";

export type ChainId = number;
export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type RoundTable = {
  id: Address;
  chainId: ChainId;
  matchAmount: bigint;
  matchTokenAddress: Address;
  matchAmountInUSD: number;
  applicationMetadataCid: string | null;
  applicationMetadata: unknown | null;
  roundMetadataCid: string;
  roundMetadata: unknown;
  applicationsStartTime: Date | null;
  applicationsEndTime: Date | null;
  donationsStartTime: Date | null;
  donationsEndTime: Date | null;
  createdAtBlock: bigint;
  updatedAtBlock: bigint;
  totalAmountDonatedInUSD: number;
  totalDonationsCount: number;
};

export type Round = Selectable<RoundTable>;
export type NewRound = Insertable<RoundTable>;
export type PartialRound = Updateable<RoundTable>;

export type ProjectTable = {
  id: string;
  chainId: ChainId;
  projectNumber: number;
  registryAddress: Address;
  metadataCid: string | null;
  metadata: unknown | null;
  ownerAddresses: Address[];
  createdAtBlock: bigint;
};

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type PartialProject = Updateable<ProjectTable>;

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
  totalAmountDonatedInUSD: number;
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
  amountInUSD: number;
  amountInRoundMatchToken: bigint;
};

export type NewDonation = Insertable<DonationTable>;
export type Donation = Selectable<DonationTable>;
export type PartialDonation = Updateable<DonationTable>;
