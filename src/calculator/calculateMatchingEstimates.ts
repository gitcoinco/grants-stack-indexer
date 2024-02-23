import type { LinearQf } from "./linearQf/index.js";
import { Chain } from "../config.js";
import { DataProvider } from "./dataProvider/index.js";
import { PriceProvider, PriceWithDecimals } from "../prices/provider.js";
import { PassportProvider } from "../passport/index.js";
import { RoundContributionsCache } from "./roundContributionsCache.js";
import { ProportionalMatchOptions } from "./options.js";
import { z } from "zod";
import { AggregatedContributions, Calculation } from "pluralistic";
import {
  aggregateContributions,
  mergeAggregatedContributions,
} from "./votes.js";
import { convertFiatToToken, convertTokenToFiat } from "../tokenMath.js";
import {
  CalculationConfig,
  extractCalculationConfigFromRound,
  overrideCalculationConfig,
} from "./calculationConfig.js";
import {
  DeprecatedApplication,
  DeprecatedRound,
  DeprecatedVote,
} from "../deprecatedJsonDatabase.js";
import { parseAddress } from "../address.js";

export const potentialVoteSchema = z.object({
  projectId: z.string(),
  roundId: z.string(),
  applicationId: z.string(),
  token: z.string(),
  voter: z.string(),
  grantAddress: z.string(),
  amount: z.coerce.bigint(),
});

export type PotentialVote = z.infer<typeof potentialVoteSchema>;

export interface EstimatedMatch {
  original: Calculation;
  estimated: Calculation;
  applicationId: string;
  recipient?: string;
  difference: bigint;
  differenceInUSD: number;
}

export async function calculateMatchingEstimates({
  chain,
  round,
  dataProvider,
  priceProvider,
  passportProvider,
  calculationConfigOverride,
  roundContributionsCache,
  potentialVotes,
  proportionalMatchOptions,
  linearQfImpl,
}: {
  chain: Chain;
  round: DeprecatedRound;
  dataProvider: DataProvider;
  priceProvider: PriceProvider;
  passportProvider: PassportProvider;
  roundContributionsCache?: RoundContributionsCache;
  proportionalMatchOptions?: ProportionalMatchOptions;
  potentialVotes: PotentialVote[];
  calculationConfigOverride: Partial<CalculationConfig>;
  linearQfImpl: LinearQf;
}): Promise<EstimatedMatch[]> {
  const roundCalculationConfig = extractCalculationConfigFromRound(round);

  const calculationConfig: CalculationConfig = overrideCalculationConfig(
    roundCalculationConfig,
    calculationConfigOverride ?? {}
  );

  const applications = await dataProvider.loadFile<DeprecatedApplication>(
    `${chain.id}/rounds/${round.id}/applications.json`,
    `${chain.id}/rounds/${round.id}/applications.json`
  );

  const cachedAggregatedContributions =
    await roundContributionsCache?.getCalculationForRound({
      roundId: round.id,
      chainId: chain.id,
    });

  let aggregatedContributions: AggregatedContributions;

  if (cachedAggregatedContributions === undefined) {
    const votes = await dataProvider.loadFile<DeprecatedVote>(
      `${chain.id}/rounds/${round.id}/votes.json`,
      `${chain.id}/rounds/${round.id}/votes.json`
    );

    const passportScoresByAddress = await passportProvider.getScoresByAddresses(
      votes.map((v) => v.voter.toLowerCase())
    );

    aggregatedContributions = aggregateContributions({
      chain,
      round,
      votes: votes,
      applications: applications,
      passportScoreByAddress: passportScoresByAddress,
      minimumAmountUSD: calculationConfig.minimumAmountUSD,
      enablePassport: calculationConfig.enablePassport,
      coefficientOverrides: {},
      proportionalMatchOptions: proportionalMatchOptions,
    });

    roundContributionsCache?.setCalculationForRound({
      roundId: round.id,
      chainId: chain.id,
      contributions: aggregatedContributions,
    });
  } else {
    aggregatedContributions = cachedAggregatedContributions;
  }

  const usdPriceByAddress: Record<string, PriceWithDecimals> = {};

  // fetch each token price only once
  for (const vote of potentialVotes) {
    if (usdPriceByAddress[vote.token] === undefined) {
      usdPriceByAddress[vote.token] = await priceProvider.getUSDConversionRate(
        chain.id,
        parseAddress(vote.token),
        "latest"
      );
    }
  }

  const conversionRateRoundToken = await priceProvider.getUSDConversionRate(
    chain.id,
    parseAddress(round.token),
    "latest"
  );

  const potentialVotesAugmented: DeprecatedVote[] = potentialVotes.map(
    (vote) => {
      const tokenPrice = usdPriceByAddress[vote.token];

      const voteAmountInUsd = convertTokenToFiat({
        tokenAmount: vote.amount,
        tokenDecimals: tokenPrice.tokenDecimals,
        tokenPrice: tokenPrice.priceInUsd,
        tokenPriceDecimals: 8,
      });

      const voteAmountInRoundToken = convertFiatToToken({
        fiatAmount: voteAmountInUsd,
        tokenDecimals: conversionRateRoundToken.tokenDecimals,
        tokenPrice: conversionRateRoundToken.priceInUsd,
        tokenPriceDecimals: 8,
      });

      return {
        ...vote,
        amount: vote.amount.toString(),
        amountRoundToken: voteAmountInRoundToken.toString(),
        amountUSD: voteAmountInUsd,
        applicationId: vote.applicationId,
        blockNumber: 0,
        id: "",
        transaction: "0x",
      };
    }
  );

  const originalResults = await linearQfImpl({
    aggregatedContributions,
    matchAmount: calculationConfig.matchAmount,
    options: {
      minimumAmount: 0n,
      matchingCapAmount: calculationConfig.matchingCapAmount,
      ignoreSaturation: false,
    },
  });

  const passportScoreByAddress = await passportProvider.getScoresByAddresses(
    potentialVotesAugmented.map((v) => v.voter.toLowerCase())
  );

  const potentialContributions = aggregateContributions({
    chain: chain,
    round: round,
    votes: potentialVotesAugmented,
    applications: applications,
    passportScoreByAddress,
    minimumAmountUSD: calculationConfig.minimumAmountUSD,
    enablePassport: calculationConfig.enablePassport,
    coefficientOverrides: {},
    proportionalMatchOptions: proportionalMatchOptions,
  });

  const totalAggregations = mergeAggregatedContributions(
    aggregatedContributions,
    potentialContributions
  );

  const potentialResults = await linearQfImpl({
    matchAmount: calculationConfig.matchAmount,
    aggregatedContributions: totalAggregations,
    options: {
      minimumAmount: 0n,
      matchingCapAmount: calculationConfig.matchingCapAmount,
      ignoreSaturation: false,
    },
  });

  const finalResults: EstimatedMatch[] = [];

  const applicationRecipientAddresses = Object.fromEntries(
    applications.map((a) => [a.id, a.metadata?.application.recipient])
  );

  for (const applicationId in potentialResults) {
    const estimatedResult = potentialResults[applicationId];
    const originalResult = originalResults[applicationId];

    const difference =
      estimatedResult.matched - (originalResult?.matched ?? 0n);

    const differenceInUSD = convertTokenToFiat({
      tokenAmount: difference,
      tokenDecimals: conversionRateRoundToken.tokenDecimals,
      tokenPrice: conversionRateRoundToken.priceInUsd,
      tokenPriceDecimals: 8,
    });

    finalResults.push({
      original: originalResult,
      estimated: estimatedResult,
      difference: difference,
      differenceInUSD: differenceInUSD,
      applicationId: applicationId,
      recipient: applicationRecipientAddresses[applicationId],
    });
  }

  return finalResults;
}
