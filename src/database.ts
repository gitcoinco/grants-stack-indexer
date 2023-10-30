import { getChainConfigById } from "./config.js";
import path from "node:path";
import { createJsonDatabase, Database as JsonDatabase } from "chainsauce";
import SQLite from "better-sqlite3";
import { CompiledQuery, Kysely, SqliteDialect } from "kysely";
import {
  Round,
  RoundSchema,
  Hex,
  Project,
  ProjectSchema,
  Contributor,
  Vote,
  Application,
  ApplicationSchema,
} from "./indexer/types.js";
import { z } from "zod";

export default function load(
  storageDir: string,
  chainId?: number
): JsonDatabase {
  if (chainId) {
    const chain = getChainConfigById(chainId);
    storageDir = path.join(storageDir, chain.id.toString());
  }
  return createJsonDatabase({ dir: storageDir });
}

export interface Database {
  migrate: () => Promise<void>;
  drop: () => Promise<void>;

  insertProject: (project: Project) => Promise<void>;
  getProjectById: (id: string) => Promise<Project | null>;
  updateProjectById: (
    id: string,
    project: Partial<Omit<Project, "id">>
  ) => Promise<void>;

  insertRound: (round: Round) => Promise<void>;
  getRoundById: (id: Hex) => Promise<Round | null>;
  updateRoundById: (
    id: Hex,
    round: Partial<Omit<Round, "id">>
  ) => Promise<void>;

  insertContributor: (contributor: Contributor) => Promise<void>;
  getContributorById: (id: string) => Promise<Contributor | null>;
  updateContributorById: (
    id: string,
    contributor: Partial<Omit<Contributor, "id">>
  ) => Promise<void>;

  insertApplication: (application: Application) => Promise<void>;
  getApplicationById: (id: {
    roundId: Hex;
    applicationId: string;
  }) => Promise<Application | null>;
  updateApplicationById: (
    id: {
      roundId: Hex;
      applicationId: string;
    },
    application: Partial<Omit<Application, "id">>
  ) => Promise<void>;

  insertVote: (vote: Vote) => Promise<void>;
}

function decodeJson<T>(schema: z.ZodType<T>) {
  return z.string().transform((value) => schema.parse(JSON.parse(value)));
}

function encodeJson<T>(schema: z.ZodType<T>) {
  return schema.transform((value) => JSON.stringify(value));
}

const ProjectRowSchema = ProjectSchema.extend({
  owners: encodeJson(ProjectSchema.shape.owners),
  metadata: encodeJson(ProjectSchema.shape.metadata),
});

const ProjectFromRowSchema = ProjectRowSchema.extend({
  owners: decodeJson(ProjectSchema.shape.owners),
  metadata: z.null().or(decodeJson(ProjectSchema.shape.metadata)),
});

const RoundRowSchema = RoundSchema.extend({
  metadata: encodeJson(RoundSchema.shape.metadata),
  applicationMetadata: encodeJson(RoundSchema.shape.applicationMetadata),
});

const RoundFromRowSchema = RoundRowSchema.extend({
  metadata: z.null().or(decodeJson(RoundSchema.shape.metadata)),
  applicationMetadata: z
    .null()
    .or(decodeJson(RoundSchema.shape.applicationMetadata)),
});

const ApplicationRowSchema = ApplicationSchema.extend({
  metadata: encodeJson(ApplicationSchema.shape.metadata),
  statusSnapshots: encodeJson(ApplicationSchema.shape.statusSnapshots),
});

const ApplicationFromRowSchema = ApplicationRowSchema.extend({
  metadata: z.null().or(decodeJson(ApplicationSchema.shape.metadata)),
  statusSnapshots: z
    .null()
    .or(decodeJson(ApplicationSchema.shape.statusSnapshots)),
});

type Tables = {
  rounds: z.infer<typeof RoundRowSchema>;
  projects: z.infer<typeof ProjectRowSchema>;
  contributors: Contributor;
  applications: z.infer<typeof ApplicationRowSchema>;
  votes: Vote;
};

export function createSqliteDatabase({ dbPath }: { dbPath: string }): Database {
  const dialect = new SqliteDialect({
    database: new SQLite(dbPath),
  });

  const db = new Kysely<Tables>({
    dialect,
  });

  return createKyselyDatabase({ db });
}

interface KyselyDatabaseConfig {
  db: Kysely<Tables>;
}

export function createKyselyDatabase({ db }: KyselyDatabaseConfig): Database {
  return {
    async migrate() {
      await db.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL;"));

      await db.schema
        .createTable("rounds")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("amountUSD", "real")
        .addColumn("votes", "integer")
        .addColumn("token", "text")
        .addColumn("matchAmount", "text")
        .addColumn("matchAmountUSD", "real")
        .addColumn("uniqueContributors", "integer")
        .addColumn("applicationMetaPtr", "text")
        .addColumn("applicationMetadata", "text")
        .addColumn("metaPtr", "text")
        .addColumn("metadata", "json")
        .addColumn("applicationsStartTime", "text")
        .addColumn("applicationsEndTime", "text")
        .addColumn("roundStartTime", "text")
        .addColumn("roundEndTime", "text")
        .addColumn("createdAtBlock", "integer")
        .addColumn("updatedAtBlock", "integer")
        .execute();

      await db.schema
        .createTable("projects")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("metaPtr", "text")
        .addColumn("owners", "json")
        .addColumn("createdAtBlock", "integer")
        .addColumn("projectNumber", "integer")
        .addColumn("metadata", "json")
        .execute();

      await db.schema
        .createTable("contributors")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("amountUSD", "real")
        .addColumn("votes", "integer")
        .execute();

      await db.schema
        .createTable("applications")
        .addColumn("id", "text")
        .addColumn("roundId", "text", (col) =>
          col.references("rounds.id").onDelete("cascade")
        )
        .addColumn("projectId", "text")
        .addColumn("status", "text")
        .addColumn("amountUSD", "real")
        .addColumn("votes", "integer")
        .addColumn("uniqueContributors", "integer")
        .addColumn("metadata", "json")
        .addColumn("createdAtBlock", "integer")
        .addColumn("statusUpdatedAtBlock", "integer")
        .addColumn("statusSnapshots", "json")
        .addPrimaryKeyConstraint("applicationId_roundId_pkey", [
          "id",
          "roundId",
        ])
        .execute();

      await db.schema
        .createTable("votes")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("transaction", "text")
        .addColumn("blockNumber", "integer")
        .addColumn("projectId", "text")
        .addColumn("roundId", "text")
        .addColumn("applicationId", "text")
        .addColumn("token", "text")
        .addColumn("voter", "text")
        .addColumn("grantAddress", "text")
        .addColumn("amount", "text")
        .addColumn("amountUSD", "real")
        .addColumn("amountRoundToken", "text")
        .addForeignKeyConstraint(
          "vote_application_fkey",
          ["applicationId", "roundId"],
          "applications",
          ["id", "roundId"],
          (cb) => cb.onDelete("cascade")
        )
        .execute();
    },

    async insertProject(project: Project): Promise<void> {
      await db
        .insertInto("projects")
        .values(ProjectRowSchema.parse(project))
        .execute();
    },

    async getProjectById(projectId: string): Promise<Project | null> {
      const project = await db
        .selectFrom("projects")
        .where("id", "=", projectId)
        .selectAll()
        .executeTakeFirst();

      if (project === undefined) {
        return null;
      }

      return ProjectFromRowSchema.parse(project);
    },

    async updateProjectById(
      projectId: string,
      project: Partial<Omit<Project, "id">>
    ): Promise<void> {
      const updatePartial = ProjectRowSchema.partial().parse(project);

      await db
        .updateTable("projects")
        .set(updatePartial)
        .where("id", "=", projectId)
        .execute();
    },

    async insertRound(round: Round): Promise<void> {
      const updatePartial = RoundRowSchema.parse(round);
      await db.insertInto("rounds").values(updatePartial).execute();
    },

    async getRoundById(roundId: Hex): Promise<Round | null> {
      const round = await db
        .selectFrom("rounds")
        .where("id", "=", roundId)
        .selectAll()
        .execute();

      if (round.length === 0) {
        console.log("round not found", roundId);
        return null;
      }

      return RoundFromRowSchema.parse(round[0]);
    },

    async updateRoundById(
      roundId: Hex,
      round: Partial<Omit<Round, "id">>
    ): Promise<void> {
      const updatePartial = RoundRowSchema.partial().parse(round);
      await db
        .updateTable("rounds")
        .set(updatePartial)
        .where("id", "=", roundId)
        .execute();
    },

    async insertApplication(application: Application): Promise<void> {
      const applicationRow = ApplicationRowSchema.parse(application);
      await db.insertInto("applications").values(applicationRow).execute();
    },

    async updateApplicationById(
      id: {
        applicationId: string;
        roundId: Hex;
      },
      application: Partial<Omit<Application, "id">>
    ): Promise<void> {
      const updatePartial = ApplicationRowSchema.partial().parse(application);

      await db
        .updateTable("applications")
        .set(updatePartial)
        .where("id", "=", id.applicationId)
        .where("roundId", "=", id.roundId)
        .execute();
    },

    async getApplicationById(id: {
      roundId: Hex;
      applicationId: string;
    }): Promise<Application | null> {
      const application = await db
        .selectFrom("applications")
        .where("id", "=", id.applicationId)
        .where("roundId", "=", id.roundId)
        .selectAll()
        .executeTakeFirst();

      if (application === undefined) {
        return null;
      }

      return ApplicationFromRowSchema.parse(application);
    },

    async getContributorById(
      contributorId: string
    ): Promise<Contributor | null> {
      const contributor = await db
        .selectFrom("contributors")
        .where("id", "=", contributorId)
        .selectAll()
        .executeTakeFirst();

      if (contributor === undefined) {
        return null;
      }

      return contributor;
    },

    async insertContributor(contributor: Contributor): Promise<void> {
      await db.insertInto("contributors").values(contributor).execute();
    },

    async updateContributorById(
      contributorId: string,
      contributor: Partial<Omit<Contributor, "id">>
    ): Promise<void> {
      await db
        .updateTable("contributors")
        .set(contributor)
        .where("id", "=", contributorId)
        .execute();
    },

    async insertVote(vote: Vote): Promise<void> {
      await db.insertInto("votes").values(vote).execute();
    },

    async drop(): Promise<void> {
      await db.executeQuery(CompiledQuery.raw("DROP TABLE IF EXISTS projects"));
      await db.executeQuery(CompiledQuery.raw("DROP TABLE IF EXISTS rounds"));
      await db.executeQuery(
        CompiledQuery.raw("DROP TABLE IF EXISTS applications")
      );
      await db.executeQuery(
        CompiledQuery.raw("DROP TABLE IF EXISTS contributors")
      );
      await db.executeQuery(CompiledQuery.raw("DROP TABLE IF EXISTS votes"));
    },
  };
}
