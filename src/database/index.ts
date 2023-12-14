import { Pool } from "pg";
import { sql, Kysely, PostgresDialect, CamelCasePlugin } from "kysely";
import {
  tinybatch,
  AddToBatch,
  timeoutScheduler,
} from "@teamawesome/tiny-batch";

import {
  ProjectTable,
  RoundTable,
  ApplicationTable,
  DonationTable,
  PriceTable,
  NewDonation,
} from "./schema.js";
import { migrate } from "./migrate.js";
import { encodeJsonWithBigInts } from "../utils/index.js";
import { Changeset } from "./changeset.js";
import {
  ExtractQuery,
  ExtractQueryResponse,
  QueryInteraction,
} from "./query.js";
import { Logger } from "pino";
import { LRUCache } from "lru-cache";
import { Address } from "../address.js";

export { Changeset };

interface Tables {
  projects: ProjectTable;
  rounds: RoundTable;
  applications: ApplicationTable;
  donations: DonationTable;
  prices: PriceTable;
}

type KyselyDb = Kysely<Tables>;

export class Database {
  #db: KyselyDb;
  #roundMatchTokenCache = new LRUCache<string, Address>({ max: 500 });
  #batchDonationInsert: AddToBatch<void, NewDonation[]>;

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
    this.#batchDonationInsert = tinybatch<void, NewDonation[]>(async (args) => {
      const donations = args.flat();

      await this.applyChangeset({
        type: "InsertManyDonations",
        donations: donations,
      });

      return [];
    }, timeoutScheduler(500));
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
      await tx.schema
        .createSchema(this.databaseSchemaName)
        .ifNotExists()
        .execute();

      await migrate(tx, this.databaseSchemaName);
    });
  }

  async applyChangeset(changeset: Changeset): Promise<void> {
    switch (changeset.type) {
      case "InsertProject": {
        await this.#db
          .insertInto("projects")
          .values(changeset.project)
          .execute();
        break;
      }

      case "UpdateProject": {
        await this.#db
          .updateTable("projects")
          .set(changeset.project)
          .where("id", "=", changeset.projectId)
          .execute();
        break;
      }

      case "InsertRound": {
        await this.#db.insertInto("rounds").values(changeset.round).execute();
        break;
      }

      case "UpdateRound": {
        await this.#db
          .updateTable("rounds")
          .set(changeset.round)
          .where("chainId", "=", changeset.chainId)
          .where("id", "=", changeset.roundId)
          .execute();
        break;
      }

      case "InsertApplication": {
        let application = changeset.application;
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
        let application = changeset.application;
        if (application.statusSnapshots !== undefined) {
          application = {
            ...application,
            statusSnapshots: encodeJsonWithBigInts(application.statusSnapshots),
          };
        }

        await this.#db
          .updateTable("applications")
          .set(application)
          .where("chainId", "=", changeset.chainId)
          .where("roundId", "=", changeset.roundId)
          .where("id", "=", changeset.applicationId)
          .execute();
        break;
      }

      case "InsertDonation": {
        await this.#batchDonationInsert(changeset.donation);
        break;
      }

      case "InsertManyDonations": {
        await this.#db
          .insertInto("donations")
          .values(changeset.donations)
          .execute();
        break;
      }

      case "InsertManyPrices": {
        await this.#db.insertInto("prices").values(changeset.prices).execute();
        break;
      }

      case "IncrementRoundDonationStats": {
        await this.#db
          .updateTable("rounds")
          .set((eb) => ({
            totalAmountDonatedInUsd: eb(
              "totalAmountDonatedInUsd",
              "+",
              changeset.amountInUsd
            ),
            totalDonationsCount: eb("totalDonationsCount", "+", 1),
          }))
          .where("chainId", "=", changeset.chainId)
          .where("id", "=", changeset.roundId)
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
              changeset.amountInUsd
            ),
            totalDonationsCount: eb("totalDonationsCount", "+", 1),
          }))
          .where("chainId", "=", changeset.chainId)
          .where("roundId", "=", changeset.roundId)
          .where("id", "=", changeset.applicationId)
          .execute();
        break;
      }

      default:
        throw new Error(`Unknown changeset type`);
    }
  }

  query(
    query: ExtractQuery<QueryInteraction, "ProjectById">
  ): Promise<ExtractQueryResponse<QueryInteraction, "ProjectById">>;
  query(
    query: ExtractQuery<QueryInteraction, "RoundById">
  ): Promise<ExtractQueryResponse<QueryInteraction, "RoundById">>;
  query(
    query: ExtractQuery<QueryInteraction, "RoundMatchTokenAddressById">
  ): Promise<
    ExtractQueryResponse<QueryInteraction, "RoundMatchTokenAddressById">
  >;
  query(
    query: ExtractQuery<QueryInteraction, "AllChainRounds">
  ): Promise<ExtractQueryResponse<QueryInteraction, "AllChainRounds">>;
  query(
    query: ExtractQuery<QueryInteraction, "AllRoundApplications">
  ): Promise<ExtractQueryResponse<QueryInteraction, "AllRoundApplications">>;
  query(
    query: ExtractQuery<QueryInteraction, "ApplicationById">
  ): Promise<ExtractQueryResponse<QueryInteraction, "ApplicationById">>;
  query(
    query: ExtractQuery<QueryInteraction, "AllRoundDonations">
  ): Promise<ExtractQueryResponse<QueryInteraction, "AllRoundDonations">>;
  query(
    query: ExtractQuery<QueryInteraction, "LatestPriceTimestampForChain">
  ): Promise<
    ExtractQueryResponse<QueryInteraction, "LatestPriceTimestampForChain">
  >;
  query(
    query: ExtractQuery<QueryInteraction, "AllChainPrices">
  ): Promise<ExtractQueryResponse<QueryInteraction, "AllChainPrices">>;
  query(
    query: ExtractQuery<QueryInteraction, "TokenPriceByBlockNumber">
  ): Promise<ExtractQueryResponse<QueryInteraction, "TokenPriceByBlockNumber">>;
  query(
    query: ExtractQuery<QueryInteraction, "AllChainProjects">
  ): Promise<ExtractQueryResponse<QueryInteraction, "AllChainProjects">>;
  async query(
    query: QueryInteraction["query"]
  ): Promise<QueryInteraction["response"]> {
    switch (query.type) {
      case "ProjectById": {
        const project = await this.#db
          .selectFrom("projects")
          .where("id", "=", query.projectId)
          .selectAll()
          .executeTakeFirst();

        return project ?? null;
      }

      case "RoundById": {
        const round = await this.#db
          .selectFrom("rounds")
          .where("chainId", "=", query.chainId)
          .where("id", "=", query.roundId)
          .selectAll()
          .executeTakeFirst();

        return round ?? null;
      }

      case "RoundMatchTokenAddressById": {
        const cacheKey = `${query.chainId}-${query.roundId}`;
        const cachedRoundMatchTokenAddress =
          this.#roundMatchTokenCache.get(cacheKey);

        if (cachedRoundMatchTokenAddress) {
          return cachedRoundMatchTokenAddress;
        }

        const round = await this.#db
          .selectFrom("rounds")
          .where("chainId", "=", query.chainId)
          .where("id", "=", query.roundId)
          .select("matchTokenAddress")
          .executeTakeFirst();

        if (round === undefined) {
          return null;
        }

        this.#roundMatchTokenCache.set(cacheKey, round.matchTokenAddress);
        return round.matchTokenAddress;
      }

      case "AllChainRounds": {
        const rounds = await this.#db
          .selectFrom("rounds")
          .where("chainId", "=", query.chainId)
          .selectAll()
          .execute();

        return rounds;
      }

      case "AllRoundApplications": {
        return await this.#db
          .selectFrom("applications")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .selectAll()
          .execute();
      }

      case "AllRoundDonations": {
        return await this.#db
          .selectFrom("donations")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .selectAll()
          .execute();
      }

      case "ApplicationById": {
        const application = await this.#db
          .selectFrom("applications")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .where("id", "=", query.applicationId)
          .selectAll()
          .executeTakeFirst();

        return application ?? null;
      }

      case "LatestPriceTimestampForChain": {
        const latestPriceTimestamp = await this.#db
          .selectFrom("prices")
          .where("chainId", "=", query.chainId)
          .orderBy("timestamp", "desc")
          .select("timestamp")
          .limit(1)
          .executeTakeFirst();

        return latestPriceTimestamp?.timestamp ?? null;
      }

      case "TokenPriceByBlockNumber": {
        let priceQuery = this.#db
          .selectFrom("prices")
          .where("chainId", "=", query.chainId)
          .where("tokenAddress", "=", query.tokenAddress)
          .orderBy("blockNumber", "desc")
          .selectAll()
          .limit(1);

        if (query.blockNumber !== "latest") {
          priceQuery = priceQuery.where("blockNumber", "<=", query.blockNumber);
        }

        const price = await priceQuery.executeTakeFirst();

        return price ?? null;
      }

      case "AllChainPrices": {
        return await this.#db
          .selectFrom("prices")
          .where("chainId", "=", query.chainId)
          .orderBy("blockNumber", "asc")
          .selectAll()
          .execute();
      }

      case "AllChainProjects": {
        return await this.#db
          .selectFrom("projects")
          .where("chainId", "=", query.chainId)
          .selectAll()
          .execute();
      }
    }
  }
}
