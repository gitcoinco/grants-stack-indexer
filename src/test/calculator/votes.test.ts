import type {
  DeprecatedVote,
  DeprecatedRound,
  DeprecatedApplication,
} from "../../deprecatedJsonDatabase.js";
import { describe, test, expect } from "vitest";
import { getVotesWithCoefficients } from "../../calculator/votes.js";
import { Chain } from "../../config.js";

const round: DeprecatedRound = {
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

const applications: DeprecatedApplication[] = [
  {
    id: "application-id-1",
    projectId: "project-id-1",
    anchorAddress: "0x1234",
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

const votes: DeprecatedVote[] = [
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
    transaction: "0x1234",
    blockNumber: 0,
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
    transaction: "0x1234",
    blockNumber: 0,
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
    test("returns capped vote if capping is defined for token", () => {
      const testVoteIndex = 0;

      const res = getVotesWithCoefficients({
        chain: MOCK_CHAIN,
        round,
        applications,
        votes,
        passportScoreByAddress: new Map(),
      });

      expect(res[testVoteIndex]).toEqual({
        ...votes[testVoteIndex],
        coefficient: 1,
        amountRoundToken: BigInt(25e18).toString(),
      });
    });

    test("doesn't cap votes if capping isn't defined for token", () => {
      const testVoteIndex = 1;

      const res = getVotesWithCoefficients({
        chain: MOCK_CHAIN,
        round,
        applications,
        votes,
        passportScoreByAddress: new Map(),
      });

      expect(res[testVoteIndex]).toEqual({
        ...votes[testVoteIndex],
        coefficient: 1,
      });
    });
  });
});
