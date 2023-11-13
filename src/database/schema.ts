import {
  timestamp,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  varchar,
  primaryKey,
  pgEnum,
  foreignKey,
  customType,
} from "drizzle-orm/pg-core";
import { Address } from "viem";

function address(name: string) {
  return varchar(name, { length: 42 }).$type<Address>();
}

function chainId() {
  return integer("chain_id").$type<number>();
}

function bigint(name: string) {
  return customType<{ data: bigint }>({
    dataType() {
      return "text";
    },
    toDriver(value) {
      return value.toString();
    },
    fromDriver(value: unknown) {
      return BigInt(value as string);
    },
  })(name);
}

export const rounds = pgTable(
  "rounds",
  {
    id: address("id").notNull(),
    chainId: chainId().notNull(),

    matchAmount: bigint("match_amount").notNull(),
    matchTokenAddress: address("match_token").notNull(),
    matchAmountInUSD: real("match_token_amount_in_usd").notNull(),

    applicationMetadataCid: text("application_metadata_cid").notNull(),
    applicationMetadata: jsonb("application_metadata"),
    roundMetadataCid: text("round_metadata_cid").notNull(),
    roundMetadata: jsonb("round_metadata"),

    applicationsStartTime: timestamp("applications_start_time").notNull(),
    applicationsEndTime: timestamp("applications_end_time").notNull(),
    donationsStartTime: timestamp("voting_start_time").notNull(),
    donationsEndTime: timestamp("voting_end_time").notNull(),

    createdAtBlock: bigint("created_at_block").notNull(),
    updatedAtBlock: bigint("updated_at_block").notNull(),

    // aggregates
    totalUniqueDonors: integer("total_unique_donors").notNull(),
    totalAmountDonatedInUSD: real("total_votes_amount_usd").notNull(),
    totalDonationsCount: integer("total_votes_count").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.chainId] }),
    };
  }
);

export const projects = pgTable("projects", {
  chainId: chainId().notNull(),
  id: text("id").primaryKey(),
  projectNumber: integer("project_number").notNull(),
  registryAddress: varchar("registry_address", { length: 42 }).notNull(),
  metadataCid: text("metadata_cid"),
  metadata: jsonb("metadata"),
  ownerAddresses: address("owner_address").array().notNull(),
  createdAtBlock: bigint("created_at_block").notNull(),
});

export const applicationStatus = pgEnum("status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "IN_REVIEW",
]);

type StatusSnapshots = {
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "IN_REVIEW";
  statusUpdatedAtBlock: number;
}[];

export const applications = pgTable(
  "applications",
  {
    chainId: chainId().notNull(),
    id: text("id"),
    roundId: address("round_id").notNull(),
    projectId: text("project_id").notNull(),
    status: applicationStatus("status").notNull(),
    statusSnapshots: jsonb("status_snapshots")
      .$type<StatusSnapshots>()
      .notNull(),

    metadataCid: text("metadata_cid").notNull(),
    metadata: jsonb("metadata"),

    createdAtBlock: bigint("created_at_block").notNull(),
    statusUpdatedAtBlock: bigint("status_updated_at_block").notNull(),

    // aggregates
    totalUniqueDonors: integer("total_unique_donors").notNull(),
    totalDonationsCount: integer("total_donations").notNull(),
    totalAmountDonatedInUSD: real("total_amount_donated_in_usd").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.roundId, table.chainId] }),
      applications_rounds_fk: foreignKey({
        columns: [table.chainId, table.roundId],
        foreignColumns: [rounds.chainId, rounds.id],
      }),
    };
  }
);

export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),

    chainId: chainId().notNull(),
    roundId: address("round_id").notNull(),
    applicationId: text("application_id"),
    donorAddress: address("donor_address").notNull(),
    tokenAddress: address("token_address").notNull(),
    recipientAddress: address("recipient_address").notNull(),
    projectId: text("project_id"),
    transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
    blockNumber: bigint("block_number").notNull(),
    amount: bigint("amount").notNull(),
    amountInUSD: real("amount_usd").notNull(),
    amountInRoundMatchToken: bigint("amount_in_round_match_token").notNull(),
  },
  (table) => {
    return {
      donations_applications_fk: foreignKey({
        columns: [table.applicationId, table.roundId, table.chainId],
        foreignColumns: [
          applications.id,
          applications.roundId,
          applications.chainId,
        ],
      }),
    };
  }
);
