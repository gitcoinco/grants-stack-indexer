import { Chain } from "../config.js";
import type { Round, Application, Vote } from "../indexer/types.js";
import type { PassportScore, PassportProvider } from "../passport/index.js";
import { ProportionalMatchOptions } from "./options.js";

export type VoteWithCoefficient = Vote & {
  coefficient: number;
  passportScore?: PassportScore;
};

/* TODO: ripe for a functional rewrite, also: https://massimilianomirra.com/notes/the-dangers-of-greedy-functions */
export async function getVotesWithCoefficients(
  chain: Chain,
  round: Round,
  applications: Array<Application>,
  votes: Array<Vote>,
  passportProvider: PassportProvider,
  options: {
    minimumAmountUSD?: number;
    enablePassport?: boolean;
  },
  pmOptions: ProportionalMatchOptions
): Promise<Array<VoteWithCoefficient>> {
  const applicationMap = applications.reduce(
    (map, application) => {
      map[application.id] = application;
      return map;
    },
    {} as Record<string, Application>
  );

  const enablePassport =
    options.enablePassport ??
    round?.metadata?.quadraticFundingConfig?.sybilDefense ??
    false;

  const minimumAmountUSD = Number(
    options.minimumAmountUSD ??
      round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount ??
      0
  );

  const votePromises = votes.map(async (originalVote) => {
    const vote = applyVoteCap(chain, originalVote);
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

    // Passport check
    const passportScore = await passportProvider.getScoreByAddress(voter);
    if (minAmountCheckPassed && enablePassport) {
      // Set to 0 if the donor doesn't have a passport
      const rawScore = Number(passportScore?.evidence?.rawScore ?? "0");
      coefficient = scoreToCoefficient(pmOptions, rawScore);
    }

    return [
      {
        ...vote,
        voter,
        coefficient,
        passportScore: passportScore,
      },
    ];
  });

  return (await Promise.all(votePromises)).flat();
}

export function scoreToCoefficient(
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

export function applyVoteCap(chain: Chain, vote: Vote): Vote {
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
