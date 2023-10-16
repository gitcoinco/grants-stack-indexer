import type { Vote, Round, Application } from "../../indexer/types.js";
import type { PassportProvider } from "../../passport/index.js";
import { describe, test, expect } from "vitest";
import { getVotesWithCoefficients } from "../../calculator/votes.js";
import { defaultProportionalMatchOptions } from "../../calculator/options.js";
import { Chain } from "../../config.js";

const noOpPassportProvider: PassportProvider = {
  start: (_opts?: { watch: boolean } | undefined) => Promise.resolve(undefined),
  stop: () => {},
  getScoreByAddress: (_address: string) => Promise.resolve(undefined),
};

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

const votes: Vote[] = [
  // expected to be capped to 10 tokens
  {
    id: "vote-1",
    projectId: "project-id-1",
    applicationId: "application-id-1",
    roundId: "round-id-1",
    token: "0x83791638da5EB2fAa432aff1c65fbA47c5D29510",
    voter: "voter-1",
    grantAddress: "grant-address-1",
    // higher than the cap (10e18)
    amount: BigInt(20e18).toString(),
    amountUSD: 20,
    amountRoundToken: BigInt(50e18).toString(),
  },

  // not expected to be capped to 10 tokens
  // because token is not in the token settings
  {
    id: "vote-2",
    projectId: "project-id-1",
    applicationId: "application-id-1",
    roundId: "round-id-1",
    token: "0x1234",
    voter: "voter-1",
    grantAddress: "grant-address-1",
    // higher than the cap (10e18)
    amount: BigInt(20e18).toString(),
    amountUSD: 20,
    amountRoundToken: BigInt(50e18).toString(),
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

describe("getVotesWithCoefficients", () => {
  describe("should take voteAmountCap into conisderation", () => {
    test("returns capped vote if capping is defined for token", async () => {
      const testVoteIndex = 0;

      const res = await getVotesWithCoefficients(
        defaultProportionalMatchOptions,
        MOCK_CHAIN,
        round,
        applications,
        votes,
        noOpPassportProvider,
        {}
      );

      expect(res[testVoteIndex]).toEqual({
        ...votes[testVoteIndex],
        coefficient: 1,
        amountRoundToken: BigInt(25e18).toString(),
      });
    });

    test("doesn't cap votes if capping isn't defined for token", async () => {
      const testVoteIndex = 1;

      const res = await getVotesWithCoefficients(
        defaultProportionalMatchOptions,
        MOCK_CHAIN,
        round,
        applications,
        votes,
        noOpPassportProvider,
        {}
      );

      expect(res[testVoteIndex]).toEqual({
        ...votes[testVoteIndex],
        coefficient: 1,
      });
    });
  });
});
