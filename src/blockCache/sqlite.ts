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

export function createSqliteBlockCache(opts: Options): BlockCache {
  let db: Sqlite.Database | null = null;

  if (opts.tableName !== undefined && opts.tableName.match(/[^a-zA-Z0-9_]/)) {
    throw new Error(
      `Table name ${opts.tableName} contains invalid characters. Only alphanumeric and underscore characters are allowed.`
    );
  }

  const tableName = opts.tableName ?? defaultTableName;

  return {
    init(): Promise<void> {
      if (db) {
        throw new Error("Already initialized");
      }

      if ("db" in opts) {
        db = opts.db;
      } else {
        db = new Sqlite(opts.dbPath);
      }

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

      return Promise.resolve();
    },

    getTimestampByBlockNumber(chainId, blockNumber): Promise<number | null> {
      if (!db) {
        throw new Error("SQLite database not initialized");
      }

      const row = db
        .prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND blockNumber = ?`
        )
        .get(chainId, blockNumber.toString()) as Row | undefined;

      return Promise.resolve(row?.timestamp ?? null);
    },

    getBlockNumberByTimestamp(chainId, timestamp): Promise<bigint | null> {
      if (!db) {
        throw new Error("SQLite database not initialized");
      }

      const row = db
        .prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp = ?`
        )
        .get(chainId, timestamp) as Row | undefined;

      return Promise.resolve(row?.blockNumber ? BigInt(row.blockNumber) : null);
    },

    saveBlock(block: Block): Promise<void> {
      if (!db) {
        throw new Error("SQLite database not initialized");
      }

      db.prepare(
        `INSERT OR REPLACE INTO ${tableName} (chainId, blockNumber, timestamp) VALUES (?, ?, ?)`
      ).run(block.chainId, block.blockNumber.toString(), block.timestampInSecs);

      return Promise.resolve();
    },

    getClosestBoundsForTimestamp(
      chainId,
      timestamp
    ): Promise<{
      before: Block | null;
      after: Block | null;
    }> {
      if (!db) {
        throw new Error("SQLite database not initialized");
      }
      const before = db
        .prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp < ? ORDER BY timestamp DESC, blockNumber DESC LIMIT 1`
        )
        .get(chainId, timestamp) as Row | undefined;

      const after = db
        .prepare(
          `SELECT * FROM ${tableName} WHERE chainId = ? AND timestamp >= ? ORDER BY timestamp ASC, blockNumber ASC LIMIT 1`
        )
        .get(chainId, timestamp) as Row | undefined;

      return Promise.resolve({
        before: before
          ? ({
              ...before,
              timestampInSecs: before.timestamp,
              blockNumber: BigInt(before.blockNumber),
            } as Block)
          : null,
        after: after
          ? ({
              ...after,
              timestampInSecs: after.timestamp,
              blockNumber: BigInt(after.blockNumber),
            } as Block)
          : null,
      });
    },
  };
}
