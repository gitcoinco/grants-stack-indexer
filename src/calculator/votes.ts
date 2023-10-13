import { Chain } from "../config.js";
import type { Round, Application, Vote } from "../indexer/types.js";
import type { PassportScore, PassportProvider } from "../passport/index.js";

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
    passportThreshold?: number;
    /** Used for matching estimates.
     * Bypasses the passport check for these addresses, so that we can display
     * the matching even if they don't have a passport */
    bypassPassportAddresses?: string[];
  }
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

    // Passport check

    const passportScore = await passportProvider.getScoreByAddress(voter);
    let passportCheckPassed = false;

    if (
      options.bypassPassportAddresses
        ?.map((address) => address.toLowerCase())
        .includes(voter.toLowerCase())
    ) {
      passportCheckPassed = true;
    }

    if (enablePassport) {
      if (
        options.passportThreshold &&
        Number(passportScore?.evidence?.rawScore ?? "0") >
          options.passportThreshold
      ) {
        passportCheckPassed = true;
      } else if (passportScore?.evidence?.success) {
        passportCheckPassed = true;
      }
    } else {
      passportCheckPassed = true;
    }

    // Minimum amount check

    let minAmountCheckPassed = false;

    if (vote.amountUSD >= minimumAmountUSD) {
      minAmountCheckPassed = true;
    }

    const coefficient = passportCheckPassed && minAmountCheckPassed ? 1 : 0;

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
