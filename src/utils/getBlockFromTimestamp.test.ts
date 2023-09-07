import { describe, expect, test } from "vitest";
import { estimateBlockNumber } from "./getBlockFromTimestamp.js";

describe("estimate block number", () => {
  const CASES = [
    {
      startBlock: 44044000,
      endBlock: 44049999,
      secondsToTarget: 1181,
      startTimestamp: 1669851619,
      endTimestamp: 1669853686,
      targetTimestamp: 1669852800,
      result: 44047428,
    },
    {
      startBlock: 44057000,
      endBlock: 44062999,
      secondsToTarget: 1057,
      startTimestamp: 1669855343,
      endTimestamp: 1669857150,
      targetTimestamp: 1669856400,
      result: 44060509,
    },
    {
      startBlock: 44069000,
      endBlock: 44074999,
      secondsToTarget: 1257,
      startTimestamp: 1669858743,
      endTimestamp: 1669860185,
      targetTimestamp: 1669860000,
      result: 44074229,
    },
  ];

  test("values", () => {
    for (const { result, ...params } of CASES) {
      expect(estimateBlockNumber(params)).toEqual(result);
    }

    for (const { result, ...params } of CASES) {
      expect(estimateBlockNumber(params)).toEqual(result);
    }
  });
});
