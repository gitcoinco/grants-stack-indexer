import { Kysely, sql } from "kysely";

const BIGINT_TYPE = sql`decimal(78,0)`;
const ADDRESS_TYPE = "text";
const CHAIN_ID_TYPE = "integer";

export async function migrate<T>(db: Kysely<T>) {
  await db.schema
    .createTable("rounds")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)

    .addColumn("matchAmount", BIGINT_TYPE)
    .addColumn("matchTokenAddress", ADDRESS_TYPE)
    .addColumn("matchAmountInUSD", "real")

    .addColumn("applicationMetadataCid", "text")
    .addColumn("applicationMetadata", "jsonb")
    .addColumn("roundMetadataCid", "text")
    .addColumn("roundMetadata", "jsonb")

    .addColumn("applicationsStartTime", "timestamp")
    .addColumn("applicationsEndTime", "timestamp")
    .addColumn("donationsStartTime", "timestamp")
    .addColumn("donationsEndTime", "timestamp")

    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("updatedAtBlock", BIGINT_TYPE)

    // aggregates

    .addColumn("totalAmountDonatedInUSD", "real")
    .addColumn("totalDonationsCount", "integer")

    .addPrimaryKeyConstraint("rounds_pkey", ["id", "chainId"])
    .execute();

  await db.schema
    .createTable("projects")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("projectNumber", "integer")
    .addColumn("registryAddress", ADDRESS_TYPE)
    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")
    .addColumn("ownerAddresses", sql`text[]`)
    .addColumn("createdAtBlock", BIGINT_TYPE)

    .addPrimaryKeyConstraint("projects_pkey", ["id", "chainId"])
    .execute();

  await db.schema
    .createType("application_status")
    .asEnum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "IN_REVIEW"])
    .execute();

  await db.schema
    .createTable("applications")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("roundId", ADDRESS_TYPE)
    .addColumn("projectId", "text")
    .addColumn("status", sql`"application_status"`)
    .addColumn("statusSnapshots", "jsonb")

    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")

    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("statusUpdatedAtBlock", BIGINT_TYPE)

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
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("roundId", ADDRESS_TYPE)
    .addColumn("applicationId", "text")
    .addColumn("donorAddress", ADDRESS_TYPE)
    .addColumn("recipientAddress", ADDRESS_TYPE)
    .addColumn("projectId", "text")
    .addColumn("transactionHash", "text")
    .addColumn("blockNumber", BIGINT_TYPE)
    .addColumn("tokenAddress", ADDRESS_TYPE)

    .addColumn("amount", BIGINT_TYPE)
    .addColumn("amountInUSD", "real")
    .addColumn("amountInRoundMatchToken", BIGINT_TYPE)

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
