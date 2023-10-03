import Sqlite from "better-sqlite3";
import { BlockCache, Block } from "../blockCache.js";

const defaultTableName = "blocks";

export type Options =
  | {
      dbPath: string;
      tableName?: string;
    }
  | { db: Sqlite.Database; tableName?: string };

interface Row {
  chainId: number;
  blockNumber: string;
  timestamp: number;
}

type UninitializedState = { state: "uninitialized" };
type InitializedState = {
  state: "initialized";
  db: Sqlite.Database;
  getTimestampByBlockNumberStmt: Sqlite.Statement;
  getBlockNumberByTimestampStmt: Sqlite.Statement;
  saveBlockStmt: Sqlite.Statement;
  getBeforeStmt: Sqlite.Statement;
  getAfterStmt: Sqlite.Statement;
};
type State = UninitializedState | InitializedState;

export function createSqliteBlockCache(opts: Options): BlockCache {
  let dbState: State = { state: "uninitialized" };

  if (opts.tableName !== undefined && /[^a-zA-Z0-9_]/.test(opts.tableName)) {
    throw new Error(`Table name ${opts.tableName} has invalid characters.`);
  }

  const tableName = opts.tableName ?? defaultTableName;

  return {
    async init(): Promise<void> {
      if (dbState.state === "initialized") {
        throw new Error("Already initialized");
      }

      const db = "db" in opts ? opts.db : new Sqlite(opts.dbPath);

      db.exec("PRAGMA journal_mode = WAL;");

      // TODO: Add proper migrations, with Kysely?
      db.exec(
        `CREATE TABLE IF NOT EXISTS ${tableName} (
          chainId INTEGER,
          blockNumber TEXT,
          timestamp INTEGER,
          PRIMARY KEY (chainId, blockNumber)
        )`
      );

      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_chainId_timestamp_blockNumber 
         ON ${tableName} (chainId, timestamp, blockNumber DESC);`
      );

      dbState = {
        state: "initialized",
        db,
        getTimestampByBlockNumberStmt: db.prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND blockNumber = ?`
        ),
        getBlockNumberByTimestampStmt: db.prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp = ?`
        ),
        saveBlockStmt: db.prepare(
          `INSERT OR REPLACE INTO ${tableName} (chainId, blockNumber, timestamp) VALUES (?, ?, ?)`
        ),
        getBeforeStmt: db.prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp < ? ORDER BY timestamp DESC, blockNumber DESC LIMIT 1`
        ),
        getAfterStmt: db.prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp >= ? ORDER BY timestamp ASC, blockNumber ASC LIMIT 1`
        ),
      };

      return Promise.resolve();
    },

    async getTimestampByBlockNumber(
      chainId,
      blockNumber
    ): Promise<number | null> {
      if (dbState.state === "uninitialized") {
        throw new Error("SQLite database not initialized");
      }

      const row = dbState.getTimestampByBlockNumberStmt.get(
        chainId,
        blockNumber.toString()
      ) as Row | undefined;

      return Promise.resolve(row ? row.timestamp : null);
    },

    async getBlockNumberByTimestamp(
      chainId,
      timestamp
    ): Promise<bigint | null> {
      if (dbState.state === "uninitialized") {
        throw new Error("SQLite database not initialized");
      }

      const row = dbState.getBlockNumberByTimestampStmt.get(
        chainId,
        timestamp
      ) as Row | undefined;

      return Promise.resolve(row ? BigInt(row.blockNumber) : null);
    },

    async saveBlock(block: Block): Promise<void> {
      if (dbState.state === "uninitialized") {
        throw new Error("SQLite database not initialized");
      }

      dbState.saveBlockStmt.run(
        block.chainId,
        block.blockNumber.toString(),
        block.timestampInSecs
      );

      return Promise.resolve();
    },

    async getClosestBoundsForTimestamp(
      chainId,
      timestamp
    ): Promise<{ before: Block | null; after: Block | null }> {
      if (dbState.state === "uninitialized") {
        throw new Error("SQLite database not initialized");
      }

      const before = dbState.getBeforeStmt.get(chainId, timestamp) as
        | Row
        | undefined;

      const after = dbState.getAfterStmt.get(chainId, timestamp) as
        | Row
        | undefined;

      return Promise.resolve({
        before: before
          ? {
              chainId: before.chainId,
              timestampInSecs: before.timestamp,
              blockNumber: BigInt(before.blockNumber),
            }
          : null,
        after: after
          ? {
              chainId: after.chainId,
              timestampInSecs: after.timestamp,
              blockNumber: BigInt(after.blockNumber),
            }
          : null,
      });
    },
  };
}
