import {
  PostgresJsDatabase,
  PostgresJsQueryResultHKT,
  drizzle,
} from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema.js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import { Address } from "viem";
import { PgInsertBase, PgInsertPrepare } from "drizzle-orm/pg-core";

const { projects, rounds, applications, donations } = schema;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type Donation = typeof donations.$inferSelect;
export type NewDonation = typeof donations.$inferInsert;

export class PostgresDatabase {
  db: PostgresJsDatabase<typeof schema> | null = null;
  version: string;
  connString: string;
  preparedInsertDonation: PgInsertPrepare<
    PgInsertBase<typeof donations, PostgresJsQueryResultHKT>
  > | null = null;

  constructor(options: { connString: string; version: string }) {
    this.connString = options.connString;
    this.version = options.version;
  }

  async migrate() {
    const psql = postgres(this.connString);

    const dbName = `chain_data_${this.version}`;
    const exists =
      await psql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    console.log("exists");

    if (exists.length === 1) {
      const result = await psql`DROP DATABASE ${psql(dbName)}`;
      console.log("dropped", result);
      const result1 = await psql`CREATE DATABASE ${psql(dbName)}`;
      console.log("created", result1);
    }

    if (exists.length === 0) {
      const result = await psql`CREATE DATABASE ${psql(dbName)}`;
      console.log("created", result);
    }

    await psql.end();

    const conn = postgres(this.connString, {
      db: dbName,
    });

    // this.db = drizzle(conn, { schema, logger: true });
    this.db = drizzle(conn, { schema });

    await migrate(this.db, { migrationsFolder: "./migrations" });

    this.preparedInsertDonation = this.db
      .insert(donations)
      .values({
        id: sql.placeholder("id"),
        chainId: sql.placeholder("chainId"),
        roundId: sql.placeholder("roundId"),
        transactionHash: sql.placeholder("transactionHash"),
        blockNumber: sql.placeholder("blockNumber"),
        projectId: sql.placeholder("projectId"),
        applicationId: sql.placeholder("applicationId"),
        donorAddress: sql.placeholder("donorAddress"),
        tokenAddress: sql.placeholder("tokenAddress"),
        recipientAddress: sql.placeholder("recipientAddress"),
        amount: sql.placeholder("amount"),
        amountInUSD: sql.placeholder("amountInUSD"),
        amountInRoundMatchToken: sql.placeholder("amountInRoundMatchToken"),
      })
      .prepare("insert_donation");
  }

  ensureDatabaseIsMigrated(): PostgresJsDatabase<typeof schema> {
    if (this.db === null) {
      throw new Error("Database is not migrated");
    }
    return this.db;
  }

  async insertProject(project: NewProject) {
    const db = this.ensureDatabaseIsMigrated();
    await db.insert(projects).values(project);
  }

  async getProjectById(id: string): Promise<Project | null> {
    const db = this.ensureDatabaseIsMigrated();
    const results = await db.select().from(projects).where(eq(projects.id, id));
    return results[0] ?? null;
  }

  async updateProjectById(id: string, project: Partial<NewProject>) {
    const db = this.ensureDatabaseIsMigrated();
    await db.update(projects).set(project).where(eq(projects.id, id));
  }

  async insertRound(round: NewRound) {
    const db = this.ensureDatabaseIsMigrated();
    await db.insert(rounds).values(round);
  }

  async getRoundById(id: {
    chainId: number;
    roundId: Address;
  }): Promise<Round | null> {
    const db = this.ensureDatabaseIsMigrated();
    const results = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.chainId, id.chainId), eq(rounds.id, id.roundId)));
    return results[0] ?? null;
  }

  async updateRoundById(
    id: { chainId: number; roundId: Address },
    round: Partial<NewRound>
  ) {
    const db = this.ensureDatabaseIsMigrated();
    await db
      .update(rounds)
      .set(round)
      .where(and(eq(rounds.chainId, id.chainId), eq(rounds.id, id.roundId)));
  }

  async insertApplication(application: NewApplication) {
    const db = this.ensureDatabaseIsMigrated();
    await db.insert(applications).values(application);
  }

  async getApplicationById(id: {
    chainId: number;
    applicationId: string;
    roundId: Address;
  }): Promise<Application | null> {
    const db = this.ensureDatabaseIsMigrated();
    const results = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id.applicationId),
          eq(applications.roundId, id.roundId),
          eq(applications.chainId, id.chainId)
        )
      );
    return results[0] ?? null;
  }

  async updateApplicationById(
    id: { chainId: number; applicationId: string; roundId: Address },
    application: Partial<NewApplication>
  ) {
    const db = this.ensureDatabaseIsMigrated();
    await db
      .update(applications)
      .set(application)
      .where(
        and(
          eq(applications.id, id.applicationId),
          eq(applications.roundId, id.roundId),
          eq(applications.chainId, id.chainId)
        )
      );
  }

  async insertDonation(donation: NewDonation) {
    await this.preparedInsertDonation?.execute(donation);
  }
}
