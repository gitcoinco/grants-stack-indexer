import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema.js";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import { Address } from "viem";

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
  pool: Pool | null = null;
  db: NodePgDatabase<typeof schema> | null = null;
  databaseUrl: string;
  databaseSchemaName: string;

  constructor(options: { databaseUrl: string; databaseSchemaName: string }) {
    this.databaseUrl = options.databaseUrl;
    this.databaseSchemaName = options.databaseSchemaName;
  }

  async migrate() {
    const pool = new Pool({ connectionString: this.databaseUrl });

    pool.on("connect", async (client) => {
      await client.query(`SET search_path TO ${this.databaseSchemaName}`);
    });

    this.db = drizzle(pool, { schema });

    await migrate(this.db, { migrationsFolder: "./migrations" });
  }

  ensureDatabaseIsInitialized(): NodePgDatabase<typeof schema> {
    if (this.db === null) {
      throw new Error("Database is not initialized");
    }
    return this.db;
  }

  async insertProject(project: NewProject) {
    const db = this.ensureDatabaseIsInitialized();
    await db.insert(projects).values(project);
  }

  async getProjectById(id: string): Promise<Project | null> {
    const db = this.ensureDatabaseIsInitialized();
    const results = await db.select().from(projects).where(eq(projects.id, id));
    return results[0] ?? null;
  }

  async updateProjectById(id: string, project: Partial<NewProject>) {
    const db = this.ensureDatabaseIsInitialized();
    await db.update(projects).set(project).where(eq(projects.id, id));
  }

  async insertRound(round: NewRound) {
    const db = this.ensureDatabaseIsInitialized();
    await db.insert(rounds).values(round);
  }

  async getRoundById(id: {
    chainId: number;
    roundId: Address;
  }): Promise<Round | null> {
    const db = this.ensureDatabaseIsInitialized();
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
    const db = this.ensureDatabaseIsInitialized();
    await db
      .update(rounds)
      .set(round)
      .where(and(eq(rounds.chainId, id.chainId), eq(rounds.id, id.roundId)));
  }

  async insertApplication(application: NewApplication) {
    const db = this.ensureDatabaseIsInitialized();
    await db.insert(applications).values(application);
  }

  async getApplicationById(id: {
    chainId: number;
    applicationId: string;
    roundId: Address;
  }): Promise<Application | null> {
    const db = this.ensureDatabaseIsInitialized();
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
    const db = this.ensureDatabaseIsInitialized();
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
