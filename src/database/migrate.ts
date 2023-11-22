import { Kysely, sql } from "kysely";

// enough to hold 256 bit integers
const BIGINT_TYPE = sql`decimal(78,0)`;

const ADDRESS_TYPE = "text";
const CHAIN_ID_TYPE = "integer";

export async function migrate<T>(db: Kysely<T>, schemaName: string) {
  const ref = (name: string) => sql.table(`${schemaName}.${name}`);

  const schema = db.withSchema(schemaName).schema;

  await schema
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

  await schema
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

  await schema
    .createType("application_status")
    .asEnum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "IN_REVIEW"])
    .execute();

  await schema
    .createTable("applications")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("roundId", ADDRESS_TYPE)
    .addColumn("projectId", "text")
    .addColumn("status", ref("application_status"))
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

  await schema
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

  // https://www.graphile.org/postgraphile/smart-tags/
  // https://www.graphile.org/postgraphile/computed-columns/
  await sql`
  comment on constraint "applications_rounds_fkey" on ${ref("applications")} is
  E'@foreignFieldName applications\n@fieldName round';

  comment on table ${ref("applications")} is
  E'@foreignKey ("project_id") references ${ref(
    "projects"
  )}(id)|@fieldName project';

  comment on constraint "donations_applications_fkey" on ${ref("donations")} is
  E'@foreignFieldName donations\n@fieldName application';

  -- this adds a computed column to the rounds table, could be slow
  CREATE FUNCTION ${ref("rounds_unique_donors_count")}(round ${ref(
    "rounds"
  )}) RETURNS integer AS $$
    SELECT COUNT(DISTINCT "donations"."donor_address")
    FROM ${ref("donations")} AS donations
    WHERE donations."round_id" = round.id AND donations."chain_id" = round."chain_id";
  $$ LANGUAGE sql STABLE;

  CREATE FUNCTION ${ref("applications_unique_donors_count")}(application ${ref(
    "applications"
  )}) RETURNS integer AS $$
    SELECT COUNT(DISTINCT "donations"."donor_address")
    FROM ${ref("donations")} AS donations
    WHERE donations."application_id" = application.id AND donations."round_id" = application."round_id" AND donations."chain_id" = application."chain_id";
  $$ LANGUAGE sql STABLE;
  `.execute(db);
}
