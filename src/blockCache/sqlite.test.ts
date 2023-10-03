import { createSqliteBlockCache } from "./sqlite.js";
import { BlockCache } from "../blockCache.js";
import { it, describe, expect, beforeEach, afterEach } from "vitest";
import Sqlite from "better-sqlite3";
import fs from "fs/promises";
import os from "os";
import path from "path";

describe("createSqliteBlockCache", () => {
  let db: Sqlite.Database;
  let blockCache: BlockCache;

  beforeEach(() => {
    db = new Sqlite(":memory:");
    blockCache = createSqliteBlockCache({ db });
  });

  afterEach(() => {
    db.close();
  });

  it("should initialize without errors", async () => {
    await expect(blockCache.init()).resolves.not.toThrow();
  });

  it("should initialize if using invalid table name", () => {
    expect(() => {
      createSqliteBlockCache({
        db,
        tableName: "invalid table name",
      });
    }).toThrow();

    expect(() => {
      createSqliteBlockCache({
        db,
        tableName: "table/",
      });
    }).toThrow();
  });

  it("should throw if already initialized", async () => {
    await blockCache.init();
    await expect(blockCache.init()).rejects.toThrow("Already initialized");
  });

  it("should save and retrieve a block by number", async () => {
    await blockCache.init();
    const block = {
      chainId: 1,
      blockNumber: BigInt(1),
      timestampInSecs: 12345,
    };
    await blockCache.saveBlock(block);

    const timestampInSecs = await blockCache.getTimestampByBlockNumber(
      1,
      BigInt(1)
    );
    expect(timestampInSecs).toEqual(block.timestampInSecs);
  });

  it("should save and retrieve a block by timestamp", async () => {
    await blockCache.init();
    const block = {
      chainId: 1,
      blockNumber: BigInt(1),
      timestampInSecs: 12345,
    };
    await blockCache.saveBlock(block);

    const blockNumber = await blockCache.getBlockNumberByTimestamp(1, 12345);
    expect(blockNumber).toEqual(block.blockNumber);
  });

  it("should get closest bounds for timestamp", async () => {
    await blockCache.init();
    const block1 = { chainId: 1, blockNumber: BigInt(1), timestampInSecs: 10 };
    const block2 = { chainId: 1, blockNumber: BigInt(2), timestampInSecs: 20 };

    await blockCache.saveBlock(block1);
    await blockCache.saveBlock(block2);

    const bounds = await blockCache.getClosestBoundsForTimestamp(1, 15);
    expect(bounds.before).toEqual(block1);
    expect(bounds.after).toEqual(block2);
  });
});

describe("createSqliteBlockCache with dbPath", () => {
  it("should initialize without errors using dbPath", async () => {
    const tmpFilePath = path.join(os.tmpdir(), `tmpdb-${Date.now()}.db`);
    const diskBlockCache = createSqliteBlockCache({ dbPath: tmpFilePath });
    await expect(diskBlockCache.init()).resolves.not.toThrow();
    await fs.rm(tmpFilePath);
  });
});
