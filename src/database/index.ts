import { Pool } from "pg";
import { sql, Kysely, PostgresDialect, CamelCasePlugin } from "kysely";

import {
  ProjectTable,
  PendingProjectRoleTable,
  ProjectRoleTable,
  RoundTable,
  PendingRoundRoleTable,
  RoundRoleTable,
  ApplicationTable,
  DonationTable,
  PriceTable,
  NewDonation,
  LegacyProjectTable,
} from "./schema.js";
import { migrate } from "./migrate.js";
import { encodeJsonWithBigInts } from "../utils/index.js";
import type { DataChange } from "./changeset.js";
import { Logger } from "pino";
import { LRUCache } from "lru-cache";
import { Address } from "../address.js";
import { ChainId } from "../types.js";
import { Hex } from "viem";

export type { DataChange as Changeset };

interface Tables {
  projects: ProjectTable;
  pendingProjectRoles: PendingProjectRoleTable;
  projectRoles: ProjectRoleTable;
  rounds: RoundTable;
  pendingRoundRoles: PendingRoundRoleTable;
  roundRoles: RoundRoleTable;
  applications: ApplicationTable;
  donations: DonationTable;
  prices: PriceTable;
  legacyProjects: LegacyProjectTable;
}

type KyselyDb = Kysely<Tables>;

const FLUSH_DONATION_BATCH_EVERY_MS = 5_000;
const UPDATE_STATS_EVERY_MS = 60_000;

export class Database {
  #db: KyselyDb;
  #roundMatchTokenCache = new LRUCache<string, Address>({ max: 500 });
  #donationQueue: NewDonation[] = [];
  #donationBatchTimeout: ReturnType<typeof setTimeout> | null = null;
  #statsTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly databaseSchemaName: string;

  constructor(options: { connectionPool: Pool; schemaName: string }) {
    const dialect = new PostgresDialect({
      pool: options.connectionPool,
    });

    this.#db = new Kysely<Tables>({
      dialect,
      plugins: [new CamelCasePlugin()],
    });

    this.#db = this.#db.withSchema(options.schemaName);

    this.databaseSchemaName = options.schemaName;

    this.scheduleDonationQueueFlush();
    this.scheduleStatsUpdate();
  }

  private scheduleStatsUpdate() {
    if (this.#statsTimeout !== null) {
      clearTimeout(this.#statsTimeout);
    }

    this.#statsTimeout = setTimeout(() => {
      this.#statsTimeout = null;
      void this.updateStats();
      this.scheduleStatsUpdate();
    }, UPDATE_STATS_EVERY_MS);
  }

  private async updateStats() {
    const donationsTableRef = `"${this.databaseSchemaName}"."donations"`;

    await sql
      .raw(
        `
      UPDATE "${this.databaseSchemaName}"."rounds" AS r
      SET
          total_amount_donated_in_usd = d.total_amount,
          total_donations_count = d.donation_count,
          unique_donors_count = d.unique_donors_count
      FROM (
          SELECT
              chain_id,
              round_id,
              SUM(amount_in_usd) AS total_amount,
              COUNT(*) AS donation_count,
              COUNT(DISTINCT donor_address) AS unique_donors_count
          FROM ${donationsTableRef}
          GROUP BY chain_id, round_id
      ) AS d
      WHERE r.chain_id = d.chain_id AND r.id = d.round_id;
      `
      )
      .execute(this.#db);

    await sql
      .raw(
        `
      UPDATE "${this.databaseSchemaName}"."applications" AS a
      SET
          total_amount_donated_in_usd = d.total_amount,
          total_donations_count = d.donation_count,
          unique_donors_count = d.unique_donors_count
      FROM (
          SELECT
              chain_id,
              round_id,
              application_id,
              SUM(amount_in_usd) AS total_amount,
              COUNT(*) AS donation_count,
              COUNT(DISTINCT donor_address) AS unique_donors_count
          FROM ${donationsTableRef}
          GROUP BY chain_id, round_id, application_id
      ) AS d
      WHERE a.chain_id = d.chain_id AND a.round_id = d.round_id AND a.id = d.application_id;
      `
      )
      .execute(this.#db);
  }

  private scheduleDonationQueueFlush() {
    if (this.#donationBatchTimeout !== null) {
      clearTimeout(this.#donationBatchTimeout);
    }

    this.#donationBatchTimeout = setTimeout(() => {
      this.#donationBatchTimeout = null;
      void this.flushDonationQueue();
      this.scheduleDonationQueueFlush();
    }, FLUSH_DONATION_BATCH_EVERY_MS);
  }

  private async flushDonationQueue() {
    const donations = this.#donationQueue.splice(0, this.#donationQueue.length);

    if (donations.length === 0) {
      return;
    }

    // chunk donations into batches of 1k to void hitting the 65k parameter limit
    // https://github.com/brianc/node-postgres/issues/1463
    const chunkSize = 1_000;
    const chunks = [];

    for (let i = 0; i < donations.length; i += chunkSize) {
      chunks.push(donations.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      await this.applyChange({
        type: "InsertManyDonations",
        donations: chunk,
      });
    }
  }

  async dropSchemaIfExists() {
    await this.#db.schema
      .dropSchema(this.databaseSchemaName)
      .ifExists()
      .cascade()
      .execute();
  }

  async createSchemaIfNotExists(logger: Logger) {
    const exists = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata
      WHERE schema_name = ${this.databaseSchemaName}
    )`.execute(this.#db);

    if (exists.rows.length > 0 && exists.rows[0].exists) {
      logger.info({
        msg: `schema "${this.databaseSchemaName}" exists, skipping creation`,
      });

      return;
    }

    logger.info({
      msg: `schema "${this.databaseSchemaName}" does not exist, creating schema`,
    });

    await this.#db.transaction().execute(async (tx) => {
      await tx.schema.createSchema(this.databaseSchemaName).execute();

      await migrate(tx, this.databaseSchemaName);
    });
  }

  async applyChanges(changes: DataChange[]): Promise<void> {
    for (const change of changes) {
      await this.applyChange(change);
    }
  }

  async applyChange(change: DataChange): Promise<void> {
    switch (change.type) {
      case "InsertPendingProjectRole": {
        await this.#db
          .insertInto("pendingProjectRoles")
          .values(change.pendingProjectRole)
          .execute();
        break;
      }

      case "DeletePendingProjectRoles": {
        await this.#db
          .deleteFrom("pendingProjectRoles")
          .where("id", "in", change.ids)
          .execute();
        break;
      }

      case "InsertPendingRoundRole": {
        await this.#db
          .insertInto("pendingRoundRoles")
          .values(change.pendingRoundRole)
          .execute();
        break;
      }

      case "DeletePendingRoundRoles": {
        await this.#db
          .deleteFrom("pendingRoundRoles")
          .where("id", "in", change.ids)
          .execute();
        break;
      }

      case "InsertProject": {
        await this.#db.insertInto("projects").values(change.project).execute();
        break;
      }

      case "UpdateProject": {
        await this.#db
          .updateTable("projects")
          .set(change.project)
          .where("id", "=", change.projectId)
          .where("chainId", "=", change.chainId)
          .execute();
        break;
      }

      case "InsertProjectRole": {
        await this.#db
          .insertInto("projectRoles")
          .values(change.projectRole)
          .execute();
        break;
      }

      case "DeleteAllProjectRolesByRole": {
        await this.#db
          .deleteFrom("projectRoles")
          .where("chainId", "=", change.projectRole.chainId)
          .where("projectId", "=", change.projectRole.projectId)
          .where("role", "=", change.projectRole.role)
          .execute();
        break;
      }

      case "DeleteAllProjectRolesByRoleAndAddress": {
        await this.#db
          .deleteFrom("projectRoles")
          .where("chainId", "=", change.projectRole.chainId)
          .where("projectId", "=", change.projectRole.projectId)
          .where("role", "=", change.projectRole.role)
          .where("address", "=", change.projectRole.address)
          .execute();
        break;
      }

      case "InsertRound": {
        await this.#db.insertInto("rounds").values(change.round).execute();
        break;
      }

      case "UpdateRound": {
        await this.#db
          .updateTable("rounds")
          .set(change.round)
          .where("chainId", "=", change.chainId)
          .where("id", "=", change.roundId)
          .execute();
        break;
      }

      case "UpdateRoundByStrategyAddress": {
        await this.#db
          .updateTable("rounds")
          .set(change.round)
          .where("chainId", "=", change.chainId)
          .where("strategyAddress", "=", change.strategyAddress)
          .execute();
        break;
      }

      case "InsertRoundRole": {
        await this.#db
          .insertInto("roundRoles")
          .values(change.roundRole)
          .execute();
        break;
      }

      case "DeleteAllRoundRolesByRoleAndAddress": {
        await this.#db
          .deleteFrom("roundRoles")
          .where("chainId", "=", change.roundRole.chainId)
          .where("roundId", "=", change.roundRole.roundId)
          .where("role", "=", change.roundRole.role)
          .where("address", "=", change.roundRole.address)
          .execute();
        break;
      }

      case "InsertApplication": {
        let application = change.application;
        if (application.statusSnapshots !== undefined) {
          application = {
            ...application,
            statusSnapshots: encodeJsonWithBigInts(application.statusSnapshots),
          };
        }

        await this.#db.insertInto("applications").values(application).execute();
        break;
      }

      case "UpdateApplication": {
        let application = change.application;
        if (application.statusSnapshots !== undefined) {
          application = {
            ...application,
            statusSnapshots: encodeJsonWithBigInts(application.statusSnapshots),
          };
        }

        await this.#db
          .updateTable("applications")
          .set(application)
          .where("chainId", "=", change.chainId)
          .where("roundId", "=", change.roundId)
          .where("id", "=", change.applicationId)
          .execute();
        break;
      }

      case "InsertDonation": {
        this.#donationQueue.push(change.donation);
        break;
      }

      case "InsertManyDonations": {
        await this.#db
          .insertInto("donations")
          .values(change.donations)
          .execute();
        break;
      }

      case "InsertManyPrices": {
        await this.#db.insertInto("prices").values(change.prices).execute();
        break;
      }

      case "IncrementRoundDonationStats": {
        await this.#db
          .updateTable("rounds")
          .set((eb) => ({
            totalAmountDonatedInUsd: eb(
              "totalAmountDonatedInUsd",
              "+",
              change.amountInUsd
            ),
            totalDonationsCount: eb("totalDonationsCount", "+", 1),
          }))
          .where("chainId", "=", change.chainId)
          .where("id", "=", change.roundId)
          .execute();
        break;
      }

      case "IncrementApplicationDonationStats": {
        await this.#db
          .updateTable("applications")
          .set((eb) => ({
            totalAmountDonatedInUsd: eb(
              "totalAmountDonatedInUsd",
              "+",
              change.amountInUsd
            ),
            totalDonationsCount: eb("totalDonationsCount", "+", 1),
          }))
          .where("chainId", "=", change.chainId)
          .where("roundId", "=", change.roundId)
          .where("id", "=", change.applicationId)
          .execute();
        break;
      }

      case "NewLegacyProject": {
        await this.#db
          .insertInto("legacyProjects")
          .values(change.legacyProject)
          .execute();
        break;
      }

      default:
        throw new Error(`Unknown changeset type`);
    }
  }

  async getPendingProjectRolesByRole(chainId: ChainId, role: string) {
    const pendingProjectRole = await this.#db
      .selectFrom("pendingProjectRoles")
      .where("chainId", "=", chainId)
      .where("role", "=", role)
      .selectAll()
      .execute();

    return pendingProjectRole ?? null;
  }

  async getPendingRoundRolesByRole(chainId: ChainId, role: string) {
    const pendingRoundRole = await this.#db
      .selectFrom("pendingRoundRoles")
      .where("chainId", "=", chainId)
      .where("role", "=", role)
      .selectAll()
      .execute();

    return pendingRoundRole ?? null;
  }

  async getProjectById(chainId: ChainId, projectId: string) {
    const project = await this.#db
      .selectFrom("projects")
      .where("chainId", "=", chainId)
      .where("id", "=", projectId)
      .selectAll()
      .executeTakeFirst();

    return project ?? null;
  }

  async getProjectByAnchor(chainId: ChainId, anchorAddress: Address) {
    const project = await this.#db
      .selectFrom("projects")
      .where("chainId", "=", chainId)
      .where("anchorAddress", "=", anchorAddress)
      .selectAll()
      .executeTakeFirst();

    return project ?? null;
  }

  async getRoundById(chainId: ChainId, roundId: Address) {
    const round = await this.#db
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where("id", "=", roundId)
      .selectAll()
      .executeTakeFirst();

    return round ?? null;
  }

  async getRoundByStrategyAddress(chainId: ChainId, strategyAddress: Address) {
    const round = await this.#db
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where("strategyAddress", "=", strategyAddress)
      .selectAll()
      .executeTakeFirst();

    return round ?? null;
  }

  async getRoundByRole(
    chainId: ChainId,
    roleName: "admin" | "manager",
    roleValue: string
  ) {
    const round = await this.#db
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where(`${roleName}Role`, "=", roleValue)
      .selectAll()
      .executeTakeFirst();

    return round ?? null;
  }

  async getRoundMatchTokenAddressById(chainId: ChainId, roundId: Address) {
    const cacheKey = `${chainId}-${roundId}`;
    const cachedRoundMatchTokenAddress =
      this.#roundMatchTokenCache.get(cacheKey);

    if (cachedRoundMatchTokenAddress) {
      return cachedRoundMatchTokenAddress;
    }

    const round = await this.#db
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where("id", "=", roundId)
      .select("matchTokenAddress")
      .executeTakeFirst();

    if (round === undefined) {
      return null;
    }

    this.#roundMatchTokenCache.set(cacheKey, round.matchTokenAddress);
    return round.matchTokenAddress;
  }

  async getAllChainRounds(chainId: ChainId) {
    const rounds = await this.#db
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .selectAll()
      .execute();

    return rounds;
  }

  async getAllRoundApplications(chainId: ChainId, roundId: Address) {
    return await this.#db
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .selectAll()
      .execute();
  }

  async getAllRoundDonations(chainId: ChainId, roundId: Address) {
    return await this.#db
      .selectFrom("donations")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .selectAll()
      .execute();
  }

  async getApplicationById(
    chainId: ChainId,
    roundId: string,
    applicationId: string
  ) {
    const application = await this.#db
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .where("id", "=", applicationId)
      .selectAll()
      .executeTakeFirst();

    return application ?? null;
  }

  async getApplicationsByProjectId(chainId: ChainId, projectId: Hex) {
    const applications = await this.#db
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("projectId", "=", projectId)
      .selectAll()
      .execute();

    return applications ?? null;
  }

  async getLatestPriceTimestampForChain(chainId: ChainId) {
    const latestPriceTimestamp = await this.#db
      .selectFrom("prices")
      .where("chainId", "=", chainId)
      .orderBy("timestamp", "desc")
      .select("timestamp")
      .limit(1)
      .executeTakeFirst();

    return latestPriceTimestamp?.timestamp ?? null;
  }

  async getTokenPriceByBlockNumber(
    chainId: ChainId,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ) {
    let priceQuery = this.#db
      .selectFrom("prices")
      .where("chainId", "=", chainId)
      .where("tokenAddress", "=", tokenAddress)
      .orderBy("blockNumber", "desc")
      .selectAll()
      .limit(1);

    if (blockNumber !== "latest") {
      priceQuery = priceQuery.where("blockNumber", "<=", blockNumber);
    }

    const price = await priceQuery.executeTakeFirst();

    return price ?? null;
  }

  async getAllChainPrices(chainId: ChainId) {
    return await this.#db
      .selectFrom("prices")
      .where("chainId", "=", chainId)
      .orderBy("blockNumber", "asc")
      .selectAll()
      .execute();
  }

  async getAllChainProjects(chainId: ChainId) {
    return await this.#db
      .selectFrom("projects")
      .where("chainId", "=", chainId)
      .selectAll()
      .execute();
  }

  async getDonationsByDonorAddressWithProjectAndRound(
    chainId: ChainId,
    donorAddress: Address
  ) {
    const donations = await this.#db
      .selectFrom("donations")
      .where("donations.donorAddress", "=", donorAddress)
      .where("donations.chainId", "=", chainId)
      .innerJoin("projects", "donations.projectId", "projects.id")
      .innerJoin("rounds", (join) =>
        join
          .onRef("donations.chainId", "=", "rounds.chainId")
          .onRef("donations.roundId", "=", "rounds.id")
      )
      .selectAll("donations")
      .select([
        "rounds.roundMetadata as roundMetadata",
        "rounds.donationsStartTime",
        "rounds.donationsEndTime",
        "projects.metadata as projectMetadata",
      ])
      .execute();

    return donations;
  }

  async getV2ProjectIdByV1ProjectId(v1ProjectId: string) {
    const result = await this.#db
      .selectFrom("legacyProjects")
      .where("v1ProjectId", "=", v1ProjectId)
      .select("v2ProjectId")
      .executeTakeFirst();

    return result ?? null;
  }
}
