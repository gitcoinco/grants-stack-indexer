import type {
  DeprecatedVote,
  DeprecatedRound,
  DeprecatedApplication,
} from "../../deprecatedJsonDatabase.js";
import { test as baseTest } from "vitest";
import { Chain } from "../../config.js";
import type { PassportScore } from "../../passport/index.js";
import type { PassportProvider } from "../../passport/index.js";
import { AddressToPassportScoreMap } from "../../passport/index.js";
import { isPresent } from "ts-is-present";

export class FakePassportProvider implements PassportProvider {
  scores: {
    [address: string]: PassportScore | undefined;
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

  getScoreByAddress(address: string) {
    return Promise.resolve(this.scores[address]);
  }

  getScoresByAddresses(
    addresses: string[]
  ): Promise<AddressToPassportScoreMap> {
    return Promise.resolve(
      new Map(
        addresses
          .map((address) => this.scores[address])
          .filter(isPresent)
          .map((score) => [score.address, score])
      )
    );
  }
}

const SAMPLE_VOTES_AND_SCORES = [
  { id: 1, amount: 1000n, rawScore: "0.0" },
  { id: 2, amount: 1000n, rawScore: "10.0" },
  { id: 3, amount: 1000n, rawScore: "15.0" },
  { id: 4, amount: 1000n, rawScore: "20.0" },
  { id: 5, amount: 1000n, rawScore: "25.0" },
  { id: 6, amount: 1000n, rawScore: "30.0" },
];

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

const chain = {
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

function generateVoteAndScore(id: number, amount: bigint, rawScore: string) {
  const vote: DeprecatedVote = {
    id: `vote-${id}`,
    projectId: "project-id-1",
    applicationId: "application-id-1",
    roundId: "round-id-1",
    token: "0x83791638da5EB2fAa432aff1c65fbA47c5D29510",
    voter: `voter-${id}`,
    grantAddress: "grant-address-1",
    transaction: "0x1234",
    blockNumber: 0,
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

function generateData() {
  const votes: DeprecatedVote[] = [];
  const scores: PassportScore[] = [];

  const passportScoresByAddress: AddressToPassportScoreMap = new Map();

  SAMPLE_VOTES_AND_SCORES.forEach(({ id, amount, rawScore }) => {
    const { vote, score } = generateVoteAndScore(id, amount, rawScore);
    votes.push(vote);
    scores.push(score);
    passportScoresByAddress.set(score.address, score);
  });

  return { votes, scores, passportScoresByAddress };
}

export const test = baseTest.extend<{
  round: DeprecatedRound;
  applications: DeprecatedApplication[];
  chain: Chain;
  data: {
    votes: DeprecatedVote[];
    scores: PassportScore[];
    passportScoresByAddress: AddressToPassportScoreMap;
  };
}>({
  round,
  applications,
  chain,
  data: async ({ task: _task }, use) => {
    await use(generateData());
  },
});
