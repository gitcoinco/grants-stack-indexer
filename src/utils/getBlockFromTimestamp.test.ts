import { describe, expect, it, vi } from "vitest";
import { getBlockFromTimestamp } from "./getBlockFromTimestamp.js";
import { createSqliteBlockCache } from "../blockCache/sqlite.js";
import Sqlite from "better-sqlite3";

describe("getBlockFromTimestamp", () => {
  const blocks = [
    {
      number: 0n,
      timestamp: 500,
    },
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

  it("finds lowest block when multiple blocks have same timestamp", async () => {
    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 2000,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(2n);
  });

  it("finds block with the closest higher timestamp", async () => {
    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 2001,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(5n);

    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 0,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(0n);
  });

  it("returns null when timestamp is in the future", async () => {
    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 8000,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(null);
  });

  it("uses the cache", async () => {
    const blockCache = createSqliteBlockCache({ db: new Sqlite(":memory:") });

    await blockCache.init();

    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 1000,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
        blockCache,
      })
    ).toEqual(1n);

    const mockGetBlockTimestamp = vi.fn(getBlockTimestamp);

    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 1000,
        chainId: 1,
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp: mockGetBlockTimestamp,
        blockCache,
      })
    ).toEqual(1n);

    // should not have called getBlockTimestamp, since it was cached
    expect(mockGetBlockTimestamp).not.toHaveBeenCalled();
  });
});
