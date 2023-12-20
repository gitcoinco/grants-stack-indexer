import { describe, expect, beforeAll } from "vitest";
import { getVotesWithCoefficients } from "../../calculator/votes.js";
import { test } from "./proportionalMatch.test.fixtures.js";

describe("getVotesWithCoefficients", () => {
  beforeAll(() => {});

  describe("should update the amount proportionally based on the passport score", () => {
    test("returns votes with amounts updated proportionally based on passport score", ({
      chain,
      round,
      applications,
      data,
    }) => {
      const res = getVotesWithCoefficients({
        chain,
        round,
        applications,
        votes: data.votes,
        passportScoreByAddress: data.passportScoresByAddress,
        enablePassport: true,
      });

      const expectedData = [
        { id: 1, amount: 1000n, rawScore: "0.0", coefficient: 0 },
        { id: 2, amount: 1000n, rawScore: "10.0", coefficient: 0 },
        { id: 3, amount: 1000n, rawScore: "15.0", coefficient: 0.5 },
        { id: 4, amount: 1000n, rawScore: "20.0", coefficient: 0.75 },
        { id: 5, amount: 1000n, rawScore: "25.0", coefficient: 1 },
        { id: 6, amount: 1000n, rawScore: "30.0", coefficient: 1 },
      ];

      expect(res.length).toEqual(6);

      for (let i = 0; i < expectedData.length; i++) {
        const vote = res[i];
        const expected = expectedData[i];

        expect(vote.id).toEqual(`vote-${expected.id}`);
        expect(vote.amount).toEqual(expected.amount.toString());
        expect(vote.passportScore!.evidence!.rawScore).toEqual(
          expected.rawScore
        );
        expect(vote.coefficient).toEqual(expected.coefficient);
      }
    });
  });
});
