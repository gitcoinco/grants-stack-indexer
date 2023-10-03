import { describe, expect, it } from "vitest";
import { getBlockFromTimestamp } from "./getBlockFromTimestamp.js";

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

    return Promise.resolve(timestamp);
  }

  it("finds lowest block when multiple blocks have same timestamp", async () => {
    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 2000,
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
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(5n);

    expect(
      await getBlockFromTimestamp({
        timestampInSeconds: 0,
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
        startBlock: 0n,
        endBlock: 6n,
        getBlockTimestamp,
      })
    ).toEqual(null);
  });
});
