import type { Round, Application, Vote } from "../indexer/types.js";
import type { PassportScore } from "../passport/index.js";

type VoteWithCoefficient = Vote & {
  coefficient: number;
};

export async function getVotesWithCoefficients(
  round: Round,
  applications: Array<Application>,
  votes: Array<Vote>,
  passportScores: Array<PassportScore>,
  options: {
    minimumAmountUSD?: number;
    enablePassport?: boolean;
    passportThreshold?: number;
  }
): Promise<Array<VoteWithCoefficient>> {
  const passportScoresMap = passportScores.reduce((map, score) => {
    map[score.address.toLowerCase()] = score;
    return map;
  }, {} as Record<string, PassportScore>);

  const applicationMap = applications.reduce((map, application) => {
    map[application.id] = application;
    return map;
  }, {} as Record<string, Application>);

  const enablePassport =
    options.enablePassport ??
    round?.metadata?.quadraticFundingConfig?.sybilDefense ??
    false;

  const minimumAmountUSD = Number(
    options.minimumAmountUSD ??
      round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount ??
      0
  );

  return votes.flatMap((vote) => {
    const voter = vote.voter.toLowerCase();
    const score = passportScoresMap[voter];
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

    let passportCheckPassed = false;

    if (enablePassport) {
      if (
        options.passportThreshold &&
        Number(score?.evidence?.rawScore ?? "0") > options.passportThreshold
      ) {
        passportCheckPassed = true;
      } else if (score.evidence?.success) {
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
        coefficient,
        minimumAmountUSD: minimumAmountUSD,
        passportLastScoreTimestamp: score?.last_score_timestamp,
        passportRawScore: score?.evidence?.rawScore,
        passportCheckType: score?.evidence?.type,
        passportCheckSuccess: score?.evidence?.success,
        passpportThreshold: score?.evidence?.threshold,
      },
    ];
  });
}
