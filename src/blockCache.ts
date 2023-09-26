import Sqlite from "better-sqlite3";

export type Block = {
  chainId: number;
  blockNumber: bigint;
  timestamp: number;
};

export interface BlockCache {
  getBlockByNumber(chainId: number, blockNumber: bigint): Promise<Block | null>;
  getBlockByTimestamp(
    chainId: number,
    timestamp: number
  ): Promise<Block | null>;
  saveBlock(block: Block): Promise<void>;
  getNearestBlocksByTimestamp(
    chainId: number,
    timestamp: number
  ): Promise<{ before: Block | null; after: Block | null }>;
}

export function createSqliteBlockCache(db: Sqlite.Database): BlockCache {
  interface Row {
    chainId: number;
    blockNumber: string;
    timestamp: number;
  }

  db.exec(
    `CREATE TABLE IF NOT EXISTS blocks (
      chainId INTEGER,
      blockNumber TEXT,
      timestamp INTEGER,
      PRIMARY KEY (chainId, blockNumber)
    )`
  );

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chainId_timestamp_blockNumber 
     ON blocks (chainId, timestamp, blockNumber DESC);`
  );

  return {
    async getBlockByNumber(chainId, blockNumber) {
      const row = db
        .prepare("SELECT * FROM blocks WHERE chainId = ? AND blockNumber = ?")
        .get(chainId, blockNumber.toString()) as Row | undefined;
      return row
        ? ({ ...row, blockNumber: BigInt(row.blockNumber) } as Block)
        : null;
    },

    async getBlockByTimestamp(chainId, timestamp) {
      const row = db
        .prepare("SELECT * FROM blocks WHERE chainId = ? AND timestamp = ?")
        .get(chainId, timestamp) as Row | undefined;
      return row
        ? ({ ...row, blockNumber: BigInt(row.blockNumber) } as Block)
        : null;
    },

    async saveBlock(block: Block) {
      db.prepare(
        "INSERT OR REPLACE INTO blocks (chainId, blockNumber, timestamp) VALUES (?, ?, ?)"
      ).run(block.chainId, block.blockNumber.toString(), block.timestamp);
    },

    async getNearestBlocksByTimestamp(chainId, timestamp) {
      const before = db
        .prepare(
          "SELECT * FROM blocks WHERE chainId = ? AND timestamp <= ? ORDER BY timestamp DESC, blockNumber DESC LIMIT 1"
        )
        .get(chainId, timestamp) as Row | undefined;

      const after = db
        .prepare(
          "SELECT * FROM blocks WHERE chainId = ? AND timestamp >= ? ORDER BY timestamp ASC, blockNumber ASC LIMIT 1"
        )
        .get(chainId, timestamp) as Row | undefined;

      return {
        before: before
          ? ({ ...before, blockNumber: BigInt(before.blockNumber) } as Block)
          : null,
        after: after
          ? ({ ...after, blockNumber: BigInt(after.blockNumber) } as Block)
          : null,
      };
    },
  };
}
