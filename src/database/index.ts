import { Pool } from "pg";
import { sql, Kysely, PostgresDialect, CamelCasePlugin } from "kysely";

import {
  ProjectTable,
  RoundTable,
  ApplicationTable,
  DonationTable,
  PriceTable,
} from "./schema.js";
import { migrate } from "./migrate.js";
import { encodeJsonWithBigInts } from "../utils/index.js";
import { Mutation } from "./mutation.js";
import {
  ExtractQuery,
  ExtractQueryResponse,
  QueryInteraction,
} from "./query.js";
import { Logger } from "pino";

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
  readonly databaseSchemaName: string;

  constructor(options: { connectionPool: Pool; schemaName: string }) {
    const dialect = new PostgresDialect({
      pool: options.connectionPool,
    });

    this.#db = new Kysely<Tables>({
      dialect,
      plugins: [new CamelCasePlugin()],
      // log(event) {
      //   if (event.level === "query") {
      //     console.log(event.query.sql);
      //     console.log(event.query.parameters);
      //   }
      // },
    });

    this.#db = this.#db.withSchema(options.schemaName);

    this.databaseSchemaName = options.schemaName;
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

  async mutate(mutation: Mutation): Promise<void> {
    switch (mutation.type) {
      case "InsertProject": {
        await this.#db
          .insertInto("projects")
          .values(mutation.project)
          .execute();
        break;
      }

      case "UpdateProject": {
        await this.#db
          .updateTable("projects")
          .set(mutation.project)
          .where("id", "=", mutation.projectId)
          .execute();
        break;
      }

      case "InsertRound": {
        await this.#db.insertInto("rounds").values(mutation.round).execute();
        break;
      }

      case "UpdateRound": {
        await this.#db
          .updateTable("rounds")
          .set(mutation.round)
          .where("chainId", "=", mutation.chainId)
          .where("id", "=", mutation.roundId)
          .execute();
        break;
      }

      case "InsertApplication": {
        let application = mutation.application;
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
        let application = mutation.application;
        if (application.statusSnapshots !== undefined) {
          application = {
            ...application,
            statusSnapshots: encodeJsonWithBigInts(application.statusSnapshots),
          };
        }

        await this.#db
          .updateTable("applications")
          .set(application)
          .where("chainId", "=", mutation.chainId)
          .where("roundId", "=", mutation.roundId)
          .where("id", "=", mutation.applicationId)
          .execute();
        break;
      }

      case "InsertDonation": {
        await this.#db
          .insertInto("donations")
          .values(mutation.donation)
          .execute();
        break;
      }

      case "InsertManyDonations": {
        await this.#db
          .insertInto("donations")
          .values(mutation.donations)
          .execute();
        break;
      }

      case "InsertManyPrices": {
        await this.#db.insertInto("prices").values(mutation.prices).execute();
        break;
      }

      default:
        throw new Error(`Unknown mutation type`);
    }
  }

  query(
    query: ExtractQuery<QueryInteraction, "ProjectById">
  ): Promise<ExtractQueryResponse<QueryInteraction, "ProjectById">>;
  query(
    query: ExtractQuery<QueryInteraction, "RoundById">
  ): Promise<ExtractQueryResponse<QueryInteraction, "RoundById">>;
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

export type { Mutation };