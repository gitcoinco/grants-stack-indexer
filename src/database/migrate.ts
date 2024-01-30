import { Kysely, sql } from "kysely";

// enough to hold 256 bit integers
const BIGINT_TYPE = sql`decimal(78,0)`;

const ADDRESS_TYPE = "text";
const CHAIN_ID_TYPE = "integer";
const PENDING_ROLE_TYPE = "text";

export async function migrate<T>(db: Kysely<T>, schemaName: string) {
  const ref = (name: string) => sql.table(`${schemaName}.${name}`);

  const schema = db.withSchema(schemaName).schema;

  await schema
    .createTable("rounds")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)

    .addColumn("tags", sql`text[]`)

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
    .addColumn("uniqueDonorsCount", "integer")

    .addPrimaryKeyConstraint("rounds_pkey", ["id", "chainId"])
    .execute();

  await schema
    .createTable("projects")
    .addColumn("id", "text")
    .addColumn("name", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("projectNumber", "integer")
    .addColumn("registryAddress", ADDRESS_TYPE)
    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("updatedAtBlock", BIGINT_TYPE)
    .addColumn("tags", sql`text[]`)

    .addPrimaryKeyConstraint("projects_pkey", ["id", "chainId"])
    .execute();

  await schema
    .createTable("pending_project_roles")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("role", PENDING_ROLE_TYPE)
    .addColumn("address", ADDRESS_TYPE)
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .execute();

  await schema
    .createType("project_role_name")
    .asEnum(["owner", "member"])
    .execute();

  await schema
    .createTable("project_roles")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("projectId", "text")
    .addColumn("address", ADDRESS_TYPE)
    .addColumn("role", ref("project_role_name"))
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addPrimaryKeyConstraint("project_roles_pkey", [
      "chainId",
      "projectId",
      "address",
      "role",
    ])

    .execute();

  await schema
    .createIndex("project_roles_unique_index")
    .on("project_roles")
    .columns(["chain_id", "project_id", "address", "role"])
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
    .addColumn("uniqueDonorsCount", "integer")

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

    .execute();

  await schema
    .createIndex("idx_donations_donor_chain")
    .on("donations")
    .columns(["donorAddress"])
    .execute();

  await schema
    .createIndex("idx_donations_chain_round")
    .on("donations")
    .columns(["chainId", "roundId"])
    .execute();

  await schema
    .createIndex("idx_donations_chain_round_app")
    .on("donations")
    .columns(["chainId", "roundId", "applicationId"])
    .execute();

  await schema
    .createTable("prices")
    .addColumn("id", "serial", (cb) => cb.primaryKey())
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("tokenAddress", ADDRESS_TYPE)
    .addColumn("priceInUSD", "real")
    .addColumn("timestamp", "timestamp")
    .addColumn("blockNumber", BIGINT_TYPE)
    .execute();

  await db.schema
    .createIndex("idx_prices_chain_token_block")
    .on("prices")
    .expression(sql`chain_id, token_address, block_number DESC`)
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

  comment on table ${ref("donations")} is
  E'@foreignKey ("application_id", "round_id", "chain_id") references ${ref(
    "applications"
  )}(id, round_id, chain_id)|@fieldName application|@foreignFieldName donations';

  comment on table ${ref("donations")} is
  E'@foreignKey ("round_id", "chain_id") references ${ref(
    "rounds"
  )}(id, chain_id)|@fieldName round|@foreignFieldName donations';

  comment on table ${ref("project_roles")} is
  E'@foreignKey ("project_id") references ${ref(
    "projects"
  )}(id)|@fieldName project|@foreignFieldName roles';
  `.execute(db);
}
