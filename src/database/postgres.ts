import {
  ProjectTable,
  RoundTable,
  ApplicationTable,
  Donation,
  migrate,
} from "./schema.js";
import { Pool } from "pg";

import { Address } from "viem";
import {
  sql,
  Kysely,
  PostgresDialect,
  Updateable,
  Insertable,
  Selectable,
} from "kysely";
import { encodeJsonWithBigInts } from "../utils/index.js";

interface Tables {
  projects: ProjectTable;
  rounds: RoundTable;
  applications: ApplicationTable;
  donations: Donation;
}

type ChainId = number;

export type Round = Selectable<RoundTable>;

type KyselyDb = Kysely<Tables>;

export type Mutation =
  | {
      type: "InsertProject";
      project: Insertable<ProjectTable>;
    }
  | {
      type: "UpdateProject";
      projectId: string;
      project: Updateable<ProjectTable>;
    }
  | {
      type: "InsertRound";
      round: Insertable<RoundTable>;
    }
  | {
      type: "UpdateRound";
      roundId: Address;
      chainId: ChainId;
      round: Updateable<RoundTable>;
    }
  | {
      type: "InsertApplication";
      application: Insertable<ApplicationTable>;
    }
  | {
      type: "UpdateApplication";
      roundId: Address;
      chainId: ChainId;
      applicationId: string;
      application: Updateable<ApplicationTable>;
    }
  | {
      type: "InsertDonation";
      donation: Insertable<Donation>;
    };

type ExtractQuery<TQueryDefinition, TQueryName> = Extract<
  TQueryDefinition,
  { query: { type: TQueryName } }
>["query"];

type ExtractQueryResponse<I extends { response: unknown }, T> = Extract<
  I,
  { query: { type: T } }
>["response"];

export type QueryInteraction =
  | {
      query: {
        type: "ProjectById";
        projectId: string;
      };
      response: Selectable<ProjectTable> | null;
    }
  | {
      query: {
        type: "RoundById";
        roundId: Address;
        chainId: ChainId;
      };
      response: Selectable<RoundTable> | null;
    }
  | {
      query: {
        type: "AllChainRounds";
        chainId: ChainId;
      };
      response: Selectable<RoundTable>[];
    }
  | {
      query: {
        type: "AllRoundApplications";
        chainId: ChainId;
        roundId: Address;
      };
      response: Selectable<ApplicationTable>[];
    }
  | {
      query: {
        type: "ApplicationById";
        chainId: ChainId;
        roundId: Address;
        applicationId: string;
      };
      response: Selectable<ApplicationTable> | null;
    }
  | {
      query: {
        type: "AllRoundDonations";
        chainId: ChainId;
        roundId: Address;
      };
      response: Selectable<Donation>[];
    };

export class PostgresDatabase {
  db: KyselyDb;
  databaseSchemaName: string;

  constructor(options: { connectionPool: Pool; schemaName: string }) {
    const dialect = new PostgresDialect({
      pool: options.connectionPool,
    });

    this.db = new Kysely<Tables>({
      dialect,
    });

    this.db = this.db.withSchema(options.schemaName);

    this.databaseSchemaName = options.schemaName;
  }

  async dropSchema() {
    console.log("dropping database", this.databaseSchemaName);

    await this.db.schema
      .dropSchema(this.databaseSchemaName)
      .ifExists()
      .cascade()
      .execute();
  }

  async migrateSchema() {
    console.log("Migrating database", this.databaseSchemaName);

    await this.db.transaction().execute(async (tx) => {
      await tx.schema
        .createSchema(this.databaseSchemaName)
        .ifNotExists()
        .execute();

      await sql
        .raw(`SET LOCAL SEARCH_PATH TO "${this.databaseSchemaName}"`)
        .execute(tx);

      await migrate(tx);
    });

    console.log("migrated");
  }

  async mutate(mutation: Mutation): Promise<void> {
    switch (mutation.type) {
      case "InsertProject": {
        await this.db.insertInto("projects").values(mutation.project).execute();
        break;
      }
      case "UpdateProject": {
        await this.db
          .updateTable("projects")
          .set(mutation.project)
          .where("id", "=", mutation.projectId)
          .execute();
        break;
      }
      case "InsertRound": {
        await this.db.insertInto("rounds").values(mutation.round).execute();
        break;
      }
      case "UpdateRound": {
        await this.db
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

        await this.db.insertInto("applications").values(application).execute();
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

        await this.db
          .updateTable("applications")
          .set(application)
          .where("chainId", "=", mutation.chainId)
          .where("roundId", "=", mutation.roundId)
          .where("id", "=", mutation.applicationId)
          .execute();
        break;
      }
      case "InsertDonation": {
        await this.db
          .insertInto("donations")
          .values(mutation.donation)
          .execute();
        break;
      }
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
  async query(
    query: QueryInteraction["query"]
  ): Promise<QueryInteraction["response"]> {
    switch (query.type) {
      case "ProjectById": {
        const project = await this.db
          .selectFrom("projects")
          .where("id", "=", query.projectId)
          .selectAll()
          .executeTakeFirst();

        return project ?? null;
      }
      case "RoundById": {
        const round = await this.db
          .selectFrom("rounds")
          .where("chainId", "=", query.chainId)
          .where("id", "=", query.roundId)
          .selectAll()
          .executeTakeFirst();

        return round ?? null;
      }
      case "AllChainRounds": {
        const rounds = await this.db
          .selectFrom("rounds")
          .where("chainId", "=", query.chainId)
          .selectAll()
          .execute();

        return rounds;
      }
      case "AllRoundApplications": {
        return await this.db
          .selectFrom("applications")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .selectAll()
          .execute();
      }
      case "AllRoundDonations": {
        return await this.db
          .selectFrom("donations")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .selectAll()
          .execute();
      }
      case "ApplicationById": {
        const application = await this.db
          .selectFrom("applications")
          .where("chainId", "=", query.chainId)
          .where("roundId", "=", query.roundId)
          .where("id", "=", query.applicationId)
          .selectAll()
          .executeTakeFirst();

        return application ?? null;
      }
    }
  }
}
