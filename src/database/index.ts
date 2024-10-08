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
  ApplicationPayout,
  IpfsDataTable,
  AttestationTable,
  AttestationTxnTable,
} from "./schema.js";
import { migrate, migrateDataFetcher, migratePriceFetcher } from "./migrate.js";
import { encodeJsonWithBigInts } from "../utils/index.js";
import type { DataChange } from "./changeset.js";
import { Logger } from "pino";
import { LRUCache } from "lru-cache";
import { Address } from "../address.js";
import { ChainId } from "../types.js";

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
  applicationsPayouts: ApplicationPayout;
  ipfsData: IpfsDataTable;
  attestations: AttestationTable;
  attestationTxns: AttestationTxnTable;
}

type KyselyDb = Kysely<Tables>;

const FLUSH_DONATION_BATCH_EVERY_MS = 5_000;
const UPDATE_STATS_EVERY_MS = 60_000;

export class Database {
  #db: KyselyDb;
  #connectionPool: Pool;
  #roundMatchTokenCache = new LRUCache<string, Address>({ max: 500 });
  #donationQueue: NewDonation[] = [];
  #donationBatchTimeout: ReturnType<typeof setTimeout> | null = null;
  #statsTimeout: ReturnType<typeof setTimeout> | null = null;
  #logger: Logger;

  readonly chainDataSchemaName: string;
  readonly ipfsDataSchemaName: string;
  readonly priceDataSchemaName: string;

  constructor(options: {
    statsUpdaterEnabled: boolean;
    logger: Logger;
    connectionPool: Pool;
    chainDataSchemaName: string;
    ipfsDataSchemaName: string;
    priceDataSchemaName: string;
  }) {
    const dialect = new PostgresDialect({
      pool: options.connectionPool,
    });

    this.#connectionPool = options.connectionPool;

    this.#db = new Kysely<Tables>({
      dialect,
      plugins: [new CamelCasePlugin()],
    });

    // Initialize schema names
    this.chainDataSchemaName = options.chainDataSchemaName;
    this.ipfsDataSchemaName = options.ipfsDataSchemaName;
    this.priceDataSchemaName = options.priceDataSchemaName;

    this.#logger = options.logger;

    this.scheduleDonationQueueFlush();

    if (options.statsUpdaterEnabled) {
      this.scheduleStatsUpdate();
    }
  }

  async acquireWriteLock() {
    const client = await this.#connectionPool.connect();

    // generate lock id based on schema
    const lockId = this.chainDataSchemaName.split("").reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);

    try {
      const result = await client.query(
        `SELECT pg_try_advisory_lock(${lockId}) as lock`
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result.rows[0].lock === true) {
        return {
          release: async () => {
            await client.query(`SELECT pg_advisory_unlock(${lockId})`);
            client.release();
          },
          client,
        };
      }
    } catch (error) {
      this.#logger.error({ error }, "Failed to acquire write lock");
    }

    client.release();

    return null;
  }

  private scheduleStatsUpdate() {
    if (this.#statsTimeout !== null) {
      clearTimeout(this.#statsTimeout);
    }

    this.#statsTimeout = setTimeout(async () => {
      try {
        await this.updateStats();
      } catch (error) {
        this.#logger.error({ error }, "Failed to update stats");
      }
      this.scheduleStatsUpdate();
    }, UPDATE_STATS_EVERY_MS);
  }

  private async updateStats() {
    const donationsTableRef = `"${this.chainDataSchemaName}"."donations"`;

    await sql
      .raw(
        `
      UPDATE "${this.chainDataSchemaName}"."rounds" AS r
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
      UPDATE "${this.chainDataSchemaName}"."applications" AS a
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

  public donationQueueLength() {
    return this.#donationQueue.length;
  }

  private scheduleDonationQueueFlush() {
    if (this.#donationBatchTimeout !== null) {
      clearTimeout(this.#donationBatchTimeout);
    }

    this.#donationBatchTimeout = setTimeout(async () => {
      try {
        await this.flushDonationQueue();
      } catch (error) {
        this.#logger.error({ error }, "Failed to flush donation queue");
      }
      this.scheduleDonationQueueFlush();
    }, FLUSH_DONATION_BATCH_EVERY_MS);
  }

  private async flushDonationQueue() {
    // chunk donations into batches of 1k to void hitting the 65k parameter limit
    // https://github.com/brianc/node-postgres/issues/1463
    const chunkSize = 1_000;

    while (this.#donationQueue.length > 0) {
      const chunk = this.#donationQueue.splice(0, chunkSize);

      try {
        await this.applyChange({
          type: "InsertManyDonations",
          donations: chunk,
        });
      } catch (error) {
        // If insertion fails, prepend the chunk back to the beginning of the queue
        // to avoid losing data
        this.#donationQueue.unshift(...chunk);
        throw error; // rethrow the error to caller
      }
    }
  }

  async dropChainDataSchemaIfExists() {
    await this.#db.schema
      .withSchema(this.chainDataSchemaName)
      .dropSchema(this.chainDataSchemaName)
      .ifExists()
      .cascade()
      .execute();
  }

  async dropIpfsDataSchemaIfExists() {
    await this.#db.schema
      .withSchema(this.ipfsDataSchemaName)
      .dropSchema(this.ipfsDataSchemaName)
      .ifExists()
      .cascade()
      .execute();
  }

  async dropPriceDataSchemaIfExists() {
    await this.#db.schema
      .withSchema(this.priceDataSchemaName)
      .dropSchema(this.priceDataSchemaName)
      .ifExists()
      .cascade()
      .execute();
  }

  async dropAllSchemaIfExists() {
    await this.dropChainDataSchemaIfExists();
    await this.dropIpfsDataSchemaIfExists();
    await this.dropPriceDataSchemaIfExists();
  }

  async createSchemaIfNotExists(
    schemaName: string,
    migrateFn: (tx: any, schemaName: string) => Promise<void>,
    logger: Logger
  ) {
    const exists = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = ${schemaName}
      )`.execute(this.#db.withSchema(schemaName));

    if (exists.rows.length > 0 && exists.rows[0].exists) {
      logger.info({
        msg: `schema "${schemaName}" exists, skipping creation`,
      });
      return;
    }

    logger.info({
      msg: `schema "${schemaName}" does not exist, creating schema`,
    });

    await this.#db
      .withSchema(schemaName)
      .transaction()
      .execute(async (tx) => {
        await tx.schema.createSchema(schemaName).execute();
        await migrateFn(tx, schemaName);
      });
  }

  async createAllSchemas(logger: Logger) {
    await this.createSchemaIfNotExists(
      this.chainDataSchemaName,
      migrate,
      logger
    );
    await this.createSchemaIfNotExists(
      this.ipfsDataSchemaName,
      migrateDataFetcher,
      logger
    );
    await this.createSchemaIfNotExists(
      this.priceDataSchemaName,
      migratePriceFetcher,
      logger
    );
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
          .withSchema(this.chainDataSchemaName)
          .insertInto("pendingProjectRoles")
          .values(change.pendingProjectRole)
          .execute();
        break;
      }

      case "DeletePendingProjectRoles": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .deleteFrom("pendingProjectRoles")
          .where("id", "in", change.ids)
          .execute();
        break;
      }

      case "InsertPendingRoundRole": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("pendingRoundRoles")
          .values(change.pendingRoundRole)
          .execute();
        break;
      }

      case "DeletePendingRoundRoles": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .deleteFrom("pendingRoundRoles")
          .where("id", "in", change.ids)
          .execute();
        break;
      }

      case "InsertProject": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("projects")
          .values(change.project)
          .execute();
        break;
      }

      case "UpdateProject": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .updateTable("projects")
          .set(change.project)
          .where("id", "=", change.projectId)
          .where("chainId", "=", change.chainId)
          .execute();
        break;
      }

      case "InsertProjectRole": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("projectRoles")
          .values(change.projectRole)
          .execute();
        break;
      }

      case "DeleteAllProjectRolesByRole": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .deleteFrom("projectRoles")
          .where("chainId", "=", change.projectRole.chainId)
          .where("projectId", "=", change.projectRole.projectId)
          .where("role", "=", change.projectRole.role)
          .execute();
        break;
      }

      case "DeleteAllProjectRolesByRoleAndAddress": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .deleteFrom("projectRoles")
          .where("chainId", "=", change.projectRole.chainId)
          .where("projectId", "=", change.projectRole.projectId)
          .where("role", "=", change.projectRole.role)
          .where("address", "=", change.projectRole.address)
          .execute();
        break;
      }

      case "InsertRound": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("rounds")
          .values(change.round)
          .execute();
        break;
      }

      case "UpdateRound": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .updateTable("rounds")
          .set(change.round)
          .where("chainId", "=", change.chainId)
          .where("id", "=", change.roundId)
          .execute();
        break;
      }

      case "IncrementRoundFundedAmount": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .updateTable("rounds")
          .set((eb) => ({
            fundedAmount: eb("fundedAmount", "+", change.fundedAmount),
            fundedAmountInUsd: eb(
              "fundedAmountInUsd",
              "+",
              change.fundedAmountInUsd
            ),
          }))
          .where("chainId", "=", change.chainId)
          .where("id", "=", change.roundId)
          .execute();
        break;
      }

      case "UpdateRoundByStrategyAddress": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .updateTable("rounds")
          .set(change.round)
          .where("chainId", "=", change.chainId)
          .where("strategyAddress", "=", change.strategyAddress)
          .execute();
        break;
      }

      case "InsertRoundRole": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("roundRoles")
          .values(change.roundRole)
          .execute();
        break;
      }

      case "DeleteAllRoundRolesByRoleAndAddress": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
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

        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("applications")
          .values(application)
          .execute();
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
          .withSchema(this.chainDataSchemaName)
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
          .withSchema(this.chainDataSchemaName)
          .insertInto("donations")
          .values(change.donations)
          .onConflict((c) => c.column("id").doNothing())
          .execute();
        break;
      }

      case "InsertManyPrices": {
        await this.#db
          .withSchema(this.priceDataSchemaName)
          .insertInto("prices")
          .values(change.prices)
          .execute();
        break;
      }

      case "IncrementRoundDonationStats": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
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

      case "IncrementRoundTotalDistributed": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .updateTable("rounds")
          .set((eb) => ({
            totalDistributed: eb("totalDistributed", "+", change.amount),
          }))
          .where("chainId", "=", change.chainId)
          .where("id", "=", change.roundId)
          .execute();
        break;
      }

      case "IncrementApplicationDonationStats": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
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
          .withSchema(this.chainDataSchemaName)
          .insertInto("legacyProjects")
          .values(change.legacyProject)
          .execute();
        break;
      }

      case "InsertApplicationPayout": {
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("applicationsPayouts")
          .values(change.payout)
          .execute();
        break;
      }

      case "InsertIpfsData": {
        await this.#db
          .withSchema(this.ipfsDataSchemaName)
          .insertInto("ipfsData")
          .values(change.ipfs)
          .execute();
        break;
      }

      case "InsertAttestation": {
        const attestationData = change.attestation.attestationData;
        const transactionsData = change.attestation.transactionsData;

        // Insert into attestations
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("attestations")
          .values(attestationData)
          .execute();

        // Insert into attestation transactions
        const attestationTxns: AttestationTxnTable[] = [];
        for (let i = 0; i < transactionsData.length; i++) {
          // Link transaction to attestation
          attestationTxns.push({
            chainId: transactionsData[i].chainId,
            txnHash: transactionsData[i].txnHash,
            attestationUid: attestationData.uid,
            attestationChainId: attestationData.chainId,
          });
        }
        await this.#db
          .withSchema(this.chainDataSchemaName)
          .insertInto("attestationTxns")
          .values(attestationTxns)
          .execute();
        break;
      }

      default:
        throw new Error(`Unknown changeset type`);
    }
  }

  async getPendingProjectRolesByRole(chainId: ChainId, role: string) {
    const pendingProjectRole = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("pendingProjectRoles")
      .where("chainId", "=", chainId)
      .where("role", "=", role)
      .selectAll()
      .execute();

    return pendingProjectRole ?? null;
  }

  async getPendingRoundRolesByRole(chainId: ChainId, role: string) {
    const pendingRoundRole = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("pendingRoundRoles")
      .where("chainId", "=", chainId)
      .where("role", "=", role)
      .selectAll()
      .execute();

    return pendingRoundRole ?? null;
  }

  async getProjectById(chainId: ChainId, projectId: string) {
    const project = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("projects")
      .where("chainId", "=", chainId)
      .where("id", "=", projectId)
      .selectAll()
      .executeTakeFirst();

    return project ?? null;
  }

  async getProjectByAnchor(chainId: ChainId, anchorAddress: Address) {
    const project = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("projects")
      .where("chainId", "=", chainId)
      .where("anchorAddress", "=", anchorAddress)
      .selectAll()
      .executeTakeFirst();

    return project ?? null;
  }

  async getRoundById(chainId: ChainId, roundId: string) {
    const round = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where("id", "=", roundId)
      .selectAll()
      .executeTakeFirst();

    return round ?? null;
  }

  async getRoundByStrategyAddress(chainId: ChainId, strategyAddress: Address) {
    const round = await this.#db
      .withSchema(this.chainDataSchemaName)
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
      .withSchema(this.chainDataSchemaName)
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .where(`${roleName}Role`, "=", roleValue)
      .selectAll()
      .executeTakeFirst();

    return round ?? null;
  }

  async getRoundMatchTokenAddressById(
    chainId: ChainId,
    roundId: Address | string
  ) {
    const cacheKey = `${chainId}-${roundId}`;
    const cachedRoundMatchTokenAddress =
      this.#roundMatchTokenCache.get(cacheKey);

    if (cachedRoundMatchTokenAddress) {
      return cachedRoundMatchTokenAddress;
    }

    const round = await this.#db
      .withSchema(this.chainDataSchemaName)
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
      .withSchema(this.chainDataSchemaName)
      .selectFrom("rounds")
      .where("chainId", "=", chainId)
      .selectAll()
      .execute();

    return rounds;
  }

  async getAllRoundApplications(chainId: ChainId, roundId: string) {
    return await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .selectAll()
      .execute();
  }

  async getAllRoundDonations(chainId: ChainId, roundId: string) {
    return await this.#db
      .withSchema(this.chainDataSchemaName)
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
      .withSchema(this.chainDataSchemaName)
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .where("id", "=", applicationId)
      .selectAll()
      .executeTakeFirst();

    return application ?? null;
  }

  async getApplicationByProjectId(
    chainId: ChainId,
    roundId: string,
    projectId: string
  ) {
    const application = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .where("projectId", "=", projectId)
      .selectAll()
      .executeTakeFirst();

    return application ?? null;
  }

  async getApplicationByAnchorAddress(
    chainId: ChainId,
    roundId: string,
    anchorAddress: Address
  ) {
    const application = await this.#db
      .withSchema(this.chainDataSchemaName)
      .selectFrom("applications")
      .where("chainId", "=", chainId)
      .where("roundId", "=", roundId)
      .where("anchorAddress", "=", anchorAddress)
      .selectAll()
      .executeTakeFirst();

    return application ?? null;
  }

  async getLatestPriceTimestampForChain(chainId: ChainId) {
    const latestPriceTimestamp = await this.#db
      .withSchema(this.priceDataSchemaName)
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
      .withSchema(this.priceDataSchemaName)
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
      .withSchema(this.priceDataSchemaName)
      .selectFrom("prices")
      .where("chainId", "=", chainId)
      .orderBy("blockNumber", "asc")
      .selectAll()
      .execute();
  }

  async getAllChainProjects(chainId: ChainId) {
    return await this.#db
      .withSchema(this.chainDataSchemaName)
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
      .withSchema(this.chainDataSchemaName)
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
      .withSchema(this.chainDataSchemaName)
      .selectFrom("legacyProjects")
      .where("v1ProjectId", "=", v1ProjectId)
      .select("v2ProjectId")
      .executeTakeFirst();

    return result ?? null;
  }

  async deleteChainData(chainId: ChainId) {
    this.#logger.info("Deleting chain data for chainId:", chainId);

    await this.#db.transaction().execute(async (trx) => {
      this.#logger.info("Deleting pending round roles");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("pendingRoundRoles")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting round roles");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("roundRoles")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting pending project roles");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("pendingProjectRoles")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting project roles");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("projectRoles")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting applications");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("applications")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting applications donations");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("donations")
        .where("chainId", "=", chainId)
        .execute();

      // this.#logger.info("Deleting donation prices");
      // await trx
      //   .withSchema(this.priceDataSchemaName)
      //   .deleteFrom("prices")
      //   .where("chainId", "=", chainId)
      //   .execute();

      this.#logger.info("Deleting applications");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("applications")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting rounds");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("rounds")
        .where("chainId", "=", chainId)
        .execute();

      this.#logger.info("Deleting projects");
      await trx
        .withSchema(this.chainDataSchemaName)
        .deleteFrom("projects")
        .where("chainId", "=", chainId)
        .execute();
    });

    this.#logger.info("Updating subscriptions indexed_to_block");
    const sqlQuery = `
      UPDATE ${this.chainDataSchemaName}.subscriptions
      SET indexed_to_block = 0::bigint
      WHERE chain_id = ${chainId}
    `;

    await sql.raw(sqlQuery).execute(this.#db);

    this.#logger.info("Deleted chain data for chainId:", chainId);
  }

  async getDataByCid(cId: string) {
    const metadata = await this.#db
      .withSchema(this.ipfsDataSchemaName)
      .selectFrom("ipfsData")
      .where("cid", "=", cId)
      .selectAll()
      .executeTakeFirst();

    return metadata ?? null;
  }
}
