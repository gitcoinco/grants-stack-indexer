import { describe, expect, test } from "vitest";
import { getBlockFromTimestamp } from "./getBlockFromTimestamp.js";
import { createSqliteBlockCache } from "../blockCache.js";
import Sqlite from "better-sqlite3";

describe("getBlockFromTimestamp", () => {
  const blocks = [
    {
      number: 1n,
      timestamp: 1000,
    },
    {
      number: 2n,
      timestamp: 2000,
    },
    {
      number: 3n,
      timestamp: 2000,
    },
    {
      number: 4n,
      timestamp: 2000,
    },
    {
      number: 5n,
      timestamp: 4000,
    },
    {
      number: 6n,
      timestamp: 6000,
    },
  ];

  async function getBlockTimestamp(blockNumber: bigint) {
    const timestamp = blocks.find((b) => b.number === blockNumber)?.timestamp;
    if (timestamp === undefined) {
      throw new Error(`block ${blockNumber} not found`);
    }

    return timestamp;
  }

  test("values", async () => {
    const blockCache = createSqliteBlockCache(new Sqlite(":memory:"));

    expect(
      await getBlockFromTimestamp(
        1,
        2000,
        0n,
        6n,
        getBlockTimestamp,
        blockCache
      )
    ).toEqual(2n);
  });
});
