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
    .createType("project_type")
    .asEnum(["canonical", "linked"])
    .execute();

  await schema
    .createTable("projects")
    .addColumn("id", "text")
    .addColumn("name", "text")
    .addColumn("nonce", BIGINT_TYPE)
    .addColumn("anchorAddress", ADDRESS_TYPE)
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("projectNumber", "integer")
    .addColumn("registryAddress", ADDRESS_TYPE)
    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")
    .addColumn("createdByAddress", ADDRESS_TYPE)
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("updatedAtBlock", BIGINT_TYPE)
    .addColumn("tags", sql`text[]`)
    .addColumn("projectType", ref("project_type"))

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
    .addForeignKeyConstraint(
      "project_roles_projects_fkey",
      ["chainId", "projectId"],
      "projects",
      ["chainId", "id"]
    )
    .execute();

  await schema
    .createTable("rounds")
    .addColumn("id", "text")
    .addColumn("chainId", CHAIN_ID_TYPE)

    .addColumn("tags", sql`text[]`)

    .addColumn("matchAmount", BIGINT_TYPE)
    .addColumn("matchTokenAddress", ADDRESS_TYPE)
    .addColumn("matchAmountInUSD", "real")

    .addColumn("fundedAmount", BIGINT_TYPE, (col) => col.defaultTo("0"))
    .addColumn("fundedAmountInUSD", "real", (col) => col.defaultTo(0.0))

    .addColumn("applicationMetadataCid", "text")
    .addColumn("applicationMetadata", "jsonb")
    .addColumn("roundMetadataCid", "text")
    .addColumn("roundMetadata", "jsonb")

    .addColumn("applicationsStartTime", "timestamptz")
    .addColumn("applicationsEndTime", "timestamptz")
    .addColumn("donationsStartTime", "timestamptz")
    .addColumn("donationsEndTime", "timestamptz")

    .addColumn("createdByAddress", ADDRESS_TYPE)
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("updatedAtBlock", BIGINT_TYPE)

    // POOL_MANAGER_ROLE = bytes32(poolId);
    .addColumn("managerRole", "text")
    // POOL_ADMIN_ROLE = keccak256(abi.encodePacked(poolId, "admin"));
    .addColumn("adminRole", "text")

    .addColumn("strategyAddress", "text")
    .addColumn("strategyId", "text")
    .addColumn("strategyName", "text")

    .addColumn("matchingDistribution", "jsonb")
    .addColumn("readyForPayoutTransaction", "text")

    .addColumn("projectId", "text")

    .addForeignKeyConstraint(
      "rounds_projects_fkey",
      ["chainId", "projectId"],
      "projects",
      ["chainId", "id"]
    )

    // aggregates

    .addColumn("totalAmountDonatedInUSD", "real")
    .addColumn("totalDonationsCount", "integer")
    .addColumn("uniqueDonorsCount", "integer")

    .addPrimaryKeyConstraint("rounds_pkey", ["id", "chainId"])
    .execute();

  await schema
    .createIndex("idx_rounds_manager_role")
    .on("rounds")
    .columns(["managerRole"])
    .execute();

  await schema
    .createIndex("idx_rounds_admin_role")
    .on("rounds")
    .columns(["adminRole"])
    .execute();

  await schema
    .createTable("pending_round_roles")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("role", PENDING_ROLE_TYPE)
    .addColumn("address", ADDRESS_TYPE)
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .execute();

  await schema
    .createType("round_role_name")
    .asEnum(["admin", "manager"])
    .execute();

  await schema
    .createTable("round_roles")
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("roundId", "text")
    .addColumn("address", ADDRESS_TYPE)
    .addColumn("role", ref("round_role_name"))
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addPrimaryKeyConstraint("round_roles_pkey", [
      "chainId",
      "roundId",
      "address",
      "role",
    ])
    .addForeignKeyConstraint(
      "round_roles_rounds_fkey",
      ["chainId", "roundId"],
      "rounds",
      ["chainId", "id"]
    )
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
    .addColumn("anchorAddress", ADDRESS_TYPE)
    .addColumn("status", ref("application_status"))
    .addColumn("statusSnapshots", "jsonb")
    .addColumn("distributionTransaction", "text")

    .addColumn("metadataCid", "text")
    .addColumn("metadata", "jsonb")

    .addColumn("createdByAddress", ADDRESS_TYPE)
    .addColumn("createdAtBlock", BIGINT_TYPE)
    .addColumn("statusUpdatedAtBlock", BIGINT_TYPE)

    // aggregates
    .addColumn("totalDonationsCount", "integer")
    .addColumn("totalAmountDonatedInUSD", "real")
    .addColumn("uniqueDonorsCount", "integer")

    .addColumn("tags", sql`text[]`)

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
    .createTable("applications_payouts")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("chainId", CHAIN_ID_TYPE)
    .addColumn("applicationId", "text")
    .addColumn("roundId", "text")
    .addColumn("amount", BIGINT_TYPE)
    .addColumn("tokenAddress", ADDRESS_TYPE)
    .addColumn("amountInUSD", "real")
    .addColumn("amountInRoundMatchToken", "text")
    .addColumn("transactionHash", "text")
    .addForeignKeyConstraint(
      "applications_payouts_applications_fkey",
      ["chainId", "roundId", "applicationId"],
      "applications",
      ["chainId", "roundId", "id"],
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

    .addColumn("timestamp", "timestamptz")

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
    .addColumn("timestamp", "timestamptz")
    .addColumn("blockNumber", BIGINT_TYPE)
    .execute();

  await db.schema
    .createIndex("idx_prices_chain_token_block")
    .on("prices")
    .expression(sql`chain_id, token_address, block_number DESC`)
    .execute();

  await schema
    .createTable("legacy_projects")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("v1ProjectId", "text")
    .addColumn("v2ProjectId", "text")
    .addUniqueConstraint("unique_v1ProjectId", ["v1ProjectId"])
    .addUniqueConstraint("unique_v2ProjectId", ["v2ProjectId"])
    .execute();

  // https://www.graphile.org/postgraphile/smart-tags/
  // https://www.graphile.org/postgraphile/computed-columns/
  await sql`
  comment on constraint "applications_rounds_fkey" on ${ref("applications")} is
  E'@foreignFieldName applications\n@fieldName round';

  create function ${ref("applications_project")}(a ${ref(
    "applications"
  )} ) returns ${ref("projects")} as $$
    select *
    from ${ref("projects")}
    where id = a.project_id
    and (chain_id = a.chain_id or true)
    order by
      case when chain_id = a.chain_id then 0 else 1 end,
      id
    limit 1;
  $$ language sql stable;

  create function ${ref("projects_applications")}(p ${ref(
    "projects"
  )} ) returns setof ${ref("applications")} as $$
    select *
    from ${ref("applications")}
    where project_id = p.id;
  $$ language sql stable;

  comment on table ${ref("donations")} is
  E'@foreignKey ("application_id", "chain_id") references ${ref(
    "applications"
  )}(id, chain_id)|@fieldNme application';

  create function ${ref("applications_canonical_project")}(a ${ref(
    "applications"
  )} ) returns ${ref("projects")} as $$
    select *
    from ${ref("projects")}
    where id = a.project_id
    and project_type = 'canonical'
    limit 1;
  $$ language sql stable;

  comment on table ${ref("donations")} is
  E'@foreignKey ("round_id", "chain_id") references ${ref(
    "rounds"
  )}(id, chain_id)|@fieldName round|@foreignFieldName donations\n@foreignKey ("application_id", "round_id", "chain_id") references ${ref(
    "applications"
  )}(id, round_id, chain_id)|@fieldName application|@foreignFieldName donations
  ';

  comment on constraint "round_roles_rounds_fkey" on ${ref("round_roles")} is
  E'@foreignFieldName roles\n@fieldName round';

  comment on constraint "project_roles_projects_fkey" on ${ref(
    "project_roles"
  )} is
  E'@foreignFieldName roles\n@fieldName project';

  comment on constraint "rounds_projects_fkey" on ${ref("rounds")} is
  E'@foreignFieldName rounds\n@fieldName project';
  `.execute(db);
}
