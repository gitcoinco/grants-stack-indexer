import type { Vote, Round, Application } from "../../indexer/types.js";
import type { PassportProvider } from "../../passport/index.js";
import { describe, test, expect, beforeAll } from "vitest";
import { getVotesWithCoefficients } from "../../calculator/votes.js";
import { defaultProportionalMatchOptions } from "../../calculator/options.js";
import { Chain } from "../../config.js";
import type { PassportScore } from "../../passport/index.js";

class FakePassportProvider implements PassportProvider {
  scores: {
    [address: string]: PassportScore;
  };

  constructor(scores: PassportScore[]) {
    this.scores = {};
    for (const s of scores) {
      this.scores[s.address] = s;
    }
  }

  start(_opts?: { watch: boolean } | undefined) {
    return Promise.resolve(undefined);
  }

  stop(): void {}

  async getScoreByAddress(address: string) {
    return this.scores[address];
  }
}

const round: Round = {
  id: "0x1234",
  amountUSD: 0,
  votes: 0,
  token: "0x1234",
  matchAmount: "0x0",
  matchAmountUSD: 0,
  uniqueContributors: 0,
  applicationMetaPtr: "",
  applicationMetadata: null,
  metaPtr: "",
  metadata: null,
  applicationsStartTime: "",
  applicationsEndTime: "",
  roundStartTime: "",
  roundEndTime: "",
  createdAtBlock: 0,
  updatedAtBlock: 0,
};

const applications: Application[] = [
  {
    id: "application-id-1",
    projectId: "project-id-1",
    roundId: "0x1234",
    status: "APPROVED",
    amountUSD: 0,
    votes: 0,
    uniqueContributors: 0,
    metadata: {
      application: {
        project: {
          title: "",
          website: "",
          projectTwitter: "",
          projectGithub: "",
          userGithub: "",
        },
        answers: [],
        recipient: "grant-address-1",
      },
    },
    createdAtBlock: 0,
    statusUpdatedAtBlock: 0,
    statusSnapshots: [
      {
        status: "APPROVED",
        statusUpdatedAtBlock: 0,
      },
    ],
  },
];

const MOCK_CHAIN = {
  id: 250,
  tokens: [
    {
      code: "GcV",
      address: "0x83791638da5EB2fAa432aff1c65fbA47c5D29510",
      voteAmountCap: BigInt(10e18),
    },
    {
      code: "Dummy",
      address: "0x1234",
    },
  ],
} as unknown as Chain;

let voteId = 0;

function generateVoteAndScore(id: number, amount: bigint, rawScore: string) {
  const vote = {
    id: `vote-${id}`,
    projectId: "project-id-1",
    applicationId: "application-id-1",
    roundId: "round-id-1",
    token: "0x83791638da5EB2fAa432aff1c65fbA47c5D29510",
    voter: `voter-${id}`,
    grantAddress: "grant-address-1",
    amount: amount.toString(),
    amountUSD: Number(amount),
    amountRoundToken: amount.toString(),
  };

  const score = {
    address: `voter-${id}`,
    score: "xyz",
    status: "XYZ",
    last_score_timestamp: "2023-05-08T10:17:52.872812+00:00",
    evidence: {
      type: "ThresholdScoreCheck",
      // success is not used anymore
      success: false,
      // rawScore is the only attribute used
      rawScore,
      // threshold is not used
      threshold: "15.00000",
    },
    error: null,
  };

  return { vote, score };
}

describe("getVotesWithCoefficients", () => {
  let votes: Vote[] = [];
  let scores: PassportScore[] = [];
  let fakePassportProvider: FakePassportProvider;

  beforeAll(() => {
    const testData = [
      { id: 1, amount: 1000n, rawScore: "10.0" },
      { id: 2, amount: 1000n, rawScore: "15.0" },
      { id: 3, amount: 1000n, rawScore: "20.0" },
      { id: 4, amount: 1000n, rawScore: "25.0" },
      { id: 5, amount: 1000n, rawScore: "30.0" },
    ];

    testData.forEach(({ id, amount, rawScore }) => {
      const { vote, score } = generateVoteAndScore(id, amount, rawScore);
      votes.push(vote);
      scores.push(score);
    });

    fakePassportProvider = new FakePassportProvider(scores);
  });

  describe("should update the amount proportionally based on the passport score", () => {
    test("returns votes with amounts updated proportionally based on passport score", async () => {
      const res = await getVotesWithCoefficients(
        defaultProportionalMatchOptions,
        MOCK_CHAIN,
        round,
        applications,
        votes,
        fakePassportProvider,
        {}
      );

      const expectedData = [
        { id: 1, amount: 1000n, rawScore: "10.0", coefficient: 0 },
        { id: 2, amount: 1000n, rawScore: "15.0", coefficient: 0.5 },
        { id: 3, amount: 1000n, rawScore: "20.0", coefficient: 0.75 },
        { id: 4, amount: 1000n, rawScore: "25.0", coefficient: 1 },
        { id: 5, amount: 1000n, rawScore: "30.0", coefficient: 1 },
      ];

      expect(res.length).toEqual(5);

      for (let i = 0; i < expectedData.length; i++) {
        const vote = res[i];
        const expected = expectedData[i];

        expect(vote.id).toEqual(`vote-${expected.id}`);
        expect(vote.amount).toEqual(expected.amount.toString());
        expect(vote.passportScore!.evidence!.rawScore).toEqual(
          expected.rawScore
        );
        // expect(vote.coefficient).toEqual(expected.coefficient);
      }

      console.log(res[0]);

      // expect(res[testVoteIndex]).toEqual({
      //   ...votes[testVoteIndex],
      //   coefficient: 1,
      //   amountRoundToken: BigInt(25e18).toString(),
      // });
    });
  });
});
