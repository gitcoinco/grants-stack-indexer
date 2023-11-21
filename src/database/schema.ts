import {
  Selectable,
  Kysely,
  sql,
  ColumnType,
  Updateable,
  Insertable,
} from "kysely";

type ChainId = number;
type Address = `0x${string}`;

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
export type UpdateableRound = Updateable<RoundTable>;

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
export type UpdateableApplication = Updateable<ApplicationTable>;

export type Donation = {
  id: string;
  chainId: ChainId;
  roundId: Address;
  applicationId: string;
  donorAddress: Address;
  recipientAddress: Address;
  projectId: string;
  transactionHash: string;
  blockNumber: bigint;
  tokenAddress: Address;
  amount: bigint;
  amountInUSD: number;
  amountInRoundMatchToken: bigint;
};

export type NewDonation = Insertable<Donation>;

// todo: decimal(78, 0)
const bigintType = sql`decimal(78,0)`;
const addressType = "text";
const chainIdType = "integer";

export async function migrate<T>(db: Kysely<T>) {
  await db.schema
    .createTable("rounds")
    .addColumn("id", "text")
    .addColumn("chainId", chainIdType)

    .addColumn("matchAmount", bigintType)
    .addColumn("matchTokenAddress", addressType)
    .addColumn("matchAmountInUSD", "real")

    .addColumn("applicationMetadataCid", "text")
    .addColumn("applicationMetadata", "jsonb")
    .addColumn("roundMetadataCid", "text")
    .addColumn("roundMetadata", "jsonb")

    .addColumn("applicationsStartTime", "timestamp")
    .addColumn("applicationsEndTime", "timestamp")
    .addColumn("donationsStartTime", "timestamp")
    .addColumn("donationsEndTime", "timestamp")

    .addColumn("createdAtBlock", bigintType)
    .addColumn("updatedAtBlock", bigintType)

    // aggregates

    .addColumn("totalAmountDonatedInUSD", "real")
    .addColumn("totalDonationsCount", "integer")

    .addPrimaryKeyConstraint("rounds_pkey", ["id", "chainId"])
    .execute();

  console.log("rounds table created");

  await db.schema
    .createTable("projects")

    .addColumn("id", "text")
    .addColumn("chainId", chainIdType)
    .addColumn("projectNumber", "integer")
    .addColumn("registryAddress", addressType)
    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")
    .addColumn("ownerAddresses", sql`text[]`)
    .addColumn("createdAtBlock", bigintType)

    .addPrimaryKeyConstraint("projects_pkey", ["id", "chainId"])
    .execute();

  console.log("projects table created");

  await db.schema
    .createType("application_status")
    .asEnum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "IN_REVIEW"])
    .execute();

  console.log("application_status enum created");

  await db.schema
    .createTable("applications")

    .addColumn("id", "text")
    .addColumn("chainId", chainIdType)
    .addColumn("roundId", addressType)
    .addColumn("projectId", "text")
    .addColumn("status", sql`"application_status"`)
    .addColumn("statusSnapshots", "jsonb")

    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")

    .addColumn("createdAtBlock", bigintType)
    .addColumn("statusUpdatedAtBlock", bigintType)

    // aggregates
    .addColumn("totalDonationsCount", "integer")
    .addColumn("totalAmountDonatedInUSD", "real")

    .addPrimaryKeyConstraint("applications_pkey", ["chainId", "roundId", "id"])
    .addForeignKeyConstraint(
      "applications_rounds_fkey",
      ["roundId", "chainId"],
      "rounds",
      ["id", "chainId"],
      (cb) => cb.onDelete("cascade")
    )

    .execute();

  console.log("applications table created");

  await db.schema
    .createTable("donations")

    .addColumn("id", "text")
    .addColumn("chainId", chainIdType)
    .addColumn("roundId", addressType)
    .addColumn("applicationId", "text")
    .addColumn("donorAddress", addressType)
    .addColumn("recipientAddress", addressType)
    .addColumn("projectId", "text")
    .addColumn("transactionHash", "text")
    .addColumn("blockNumber", bigintType)
    .addColumn("tokenAddress", addressType)

    .addColumn("amount", bigintType)
    .addColumn("amountInUSD", "real")
    .addColumn("amountInRoundMatchToken", bigintType)

    .addPrimaryKeyConstraint("donations_pkey", ["id"])

    .addForeignKeyConstraint(
      "donations_applications_fkey",
      ["applicationId", "roundId", "chainId"],
      "applications",
      ["id", "roundId", "chainId"],
      (cb) => cb.onDelete("cascade")
    )

    .execute();

  console.log("donations table created");
}
