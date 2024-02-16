import {
  AggregatedContributions,
  Contribution,
  aggregateContributions as aggregateContributionsPluralistic,
} from "pluralistic";
import { Chain } from "../config.js";
import type {
  DeprecatedRound,
  DeprecatedApplication,
  DeprecatedVote,
} from "../deprecatedJsonDatabase.js";
import type {
  PassportScore,
  AddressToPassportScoreMap,
} from "../passport/index.js";
import { ProportionalMatchOptions } from "./options.js";
import { defaultProportionalMatchOptions } from "./options.js";
import { CoefficientOverrides } from "./coefficientOverrides.js";

export type VoteWithCoefficient = DeprecatedVote & {
  coefficient: number;
  passportScore?: PassportScore;
};

interface GetVotesWithCoefficientsArgs {
  chain: Chain;
  round: DeprecatedRound;
  applications: Array<DeprecatedApplication>;
  votes: Array<DeprecatedVote>;
  enablePassport?: boolean;
  minimumAmountUSD?: number;
  proportionalMatchOptions?: ProportionalMatchOptions;
  passportScoreByAddress: AddressToPassportScoreMap;
}

export function getVotesWithCoefficients(
  args: GetVotesWithCoefficientsArgs
): Array<VoteWithCoefficient> {
  const applicationMap = args.applications.reduce(
    (map, application) => {
      map[application.id] = application;
      return map;
    },
    {} as Record<string, DeprecatedApplication>
  );

  const enablePassport = args.enablePassport ?? false;

  const minimumAmountUSD = Number(args.minimumAmountUSD ?? 0);

  const { passportScoreByAddress: passportScoresByAddress } = args;

  return args.votes.flatMap((originalVote) => {
    const vote = applyVoteCap(args.chain, originalVote);
    const voter = vote.voter.toLowerCase();
    const application = applicationMap[vote.applicationId];

    // skip votes to applications that are not approved
    if (application?.status !== "APPROVED") {
      return [];
    }

    const payoutAddress = application?.metadata?.application?.recipient;

    // only count contributions to the right payout address specified in the application metadata
    //
    if (
      payoutAddress === undefined ||
      payoutAddress.toLowerCase() != vote.grantAddress.toLowerCase()
    ) {
      return [];
    }

    // We start setting the coefficient to 1, keeping 100% of the donation matching power
    let coefficient = 1;

    // Minimum donation amount check
    const minAmountCheckPassed = vote.amountUSD >= minimumAmountUSD;
    // We don't consider the donation if it's lower than the minimum amount
    if (!minAmountCheckPassed) {
      coefficient = 0;
    }

    const passportScore = passportScoresByAddress.get(voter);

    // Passport check
    if (minAmountCheckPassed && enablePassport) {
      // Set to 0 if the donor doesn't have a passport
      const rawScore = Number(passportScore?.evidence?.rawScore ?? "0");
      coefficient = passportScoreToCoefficient(
        args.proportionalMatchOptions ?? defaultProportionalMatchOptions,
        rawScore
      );
    }

    return [
      {
        ...vote,
        voter,
        coefficient,
        passportScore,
      },
    ];
  });
}

function passportScoreToCoefficient(
  options: ProportionalMatchOptions,
  score: number
) {
  if (score < options.score.min) {
    return 0;
  }

  if (score > options.score.max) {
    return 1;
  }

  const shiftedMax = options.score.max - options.score.min;
  const shiftedScore = score - options.score.min;

  const perc =
    options.matchProportionPercentage.min +
    ((options.matchProportionPercentage.max -
      options.matchProportionPercentage.min) *
      shiftedScore) /
      shiftedMax;

  return perc / 100;
}

export function applyVoteCap(
  chain: Chain,
  vote: DeprecatedVote
): DeprecatedVote {
  const tokenConfig = chain.tokens.find(
    (t) => t.address.toLowerCase() === vote.token.toLowerCase()
  );

  if (tokenConfig === undefined) {
    throw new Error(`Unknown token: ${vote.token}`);
  }

  const { voteAmountCap } = tokenConfig;
  if (voteAmountCap === undefined) {
    return vote;
  } else {
    // amount : amountRoundToken = voteAmountCap : newAmountRoundToken
    const newAmountRoundToken =
      (BigInt(vote.amountRoundToken) * voteAmountCap) / BigInt(vote.amount);

    return {
      ...vote,
      amountRoundToken: newAmountRoundToken.toString(),
    };
  }
}

export function applyCoefficients(config: {
  votes: VoteWithCoefficient[];
  overrides: CoefficientOverrides;
}): (Contribution & { recipientAddress: string })[] {
  return config.votes.map((vote) => {
    const scaleFactor = 10_000;
    const coefficient = BigInt(
      Math.trunc((config.overrides[vote.id] ?? vote.coefficient) * scaleFactor)
    );

    const amount = BigInt(vote.amountRoundToken);
    const multipliedAmount = (amount * coefficient) / BigInt(scaleFactor);

    return {
      contributor: vote.voter,
      recipient: vote.applicationId,
      recipientAddress: vote.grantAddress,
      amount: multipliedAmount,
    };
  });
}

export function mergeAggregatedContributions(
  contributions1: AggregatedContributions,
  contributions2: AggregatedContributions
): AggregatedContributions {
  const merged: AggregatedContributions = {
    totalReceived: contributions1.totalReceived + contributions2.totalReceived,
    list: {},
  };

  for (const recipient in contributions1.list) {
    merged.list[recipient] = {
      totalReceived: contributions1.list[recipient].totalReceived,
      contributions: { ...contributions1.list[recipient].contributions },
    };
  }

  for (const recipient in contributions2.list) {
    if (!merged.list[recipient]) {
      merged.list[recipient] = {
        totalReceived: 0n,
        contributions: {},
      };
    }

    merged.list[recipient].totalReceived +=
      contributions2.list[recipient].totalReceived;

    for (const contributor in contributions2.list[recipient].contributions) {
      if (!merged.list[recipient].contributions[contributor]) {
        merged.list[recipient].contributions[contributor] = 0n;
      }

      merged.list[recipient].contributions[contributor] +=
        contributions2.list[recipient].contributions[contributor];
    }
  }

  return merged;
}

interface AggregatedContributionsConfig {
  chain: Chain;
  round: DeprecatedRound;
  applications: DeprecatedApplication[];
  votes: DeprecatedVote[];
  passportScoreByAddress: AddressToPassportScoreMap;
  enablePassport?: boolean;
  minimumAmountUSD?: number;
  coefficientOverrides: Record<string, number>;
  proportionalMatchOptions?: ProportionalMatchOptions;
}

export function aggregateContributions({
  chain,
  round,
  applications,
  votes,
  passportScoreByAddress,
  enablePassport,
  minimumAmountUSD,
  coefficientOverrides: overrides,
  proportionalMatchOptions,
}: AggregatedContributionsConfig): AggregatedContributions {
  const votesWithCoefficients = getVotesWithCoefficients({
    chain: chain,
    round,
    applications,
    votes,
    minimumAmountUSD,
    enablePassport,
    passportScoreByAddress,
    proportionalMatchOptions: proportionalMatchOptions,
  });

  const contributions = applyCoefficients({
    votes: votesWithCoefficients,
    overrides,
  });

  return aggregateContributionsPluralistic(contributions);
}
