import type {
  CalculatorArgs as CalculatorArgs,
  CalculatorResult as CalculatorResult,
} from "./worker.js";
import { Chain } from "../config.js";
import { Application, Round, Vote } from "../indexer/types.js";
import {
  DataProvider,
  extractCalculationConfigFromRound,
  RoundCalculationConfig,
} from "./index.js";
import { PriceProvider } from "../prices/provider.js";
import { PassportProvider } from "../passport/index.js";
import { RoundContributionsCache } from "./roundContributionsCache.js";
import { ProportionalMatchOptions } from "./options.js";
import { z } from "zod";
import { AggregatedContributions, Calculation } from "pluralistic";
import {
  aggregateContributions,
  mergeAggregatedContributions,
} from "./votes.js";
import { PriceWithDecimals } from "../prices/common.js";
import { convertFiatToToken, convertTokenToFiat } from "../tokenMath.js";

export type CalculateFunction = (
  msg: CalculatorArgs
) => Promise<CalculatorResult>;

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

export async function estimateMatches({
  chain,
  round,
  dataProvider,
  priceProvider,
  passportProvider,
  roundCalculationConfig,
  roundContributionsCache,
  potentialVotes,
  proportionalMatchOptions,
  calculate,
}: {
  chain: Chain;
  round: Round;
  dataProvider: DataProvider;
  priceProvider: PriceProvider;
  passportProvider: PassportProvider;
  roundContributionsCache?: RoundContributionsCache;
  proportionalMatchOptions?: ProportionalMatchOptions;
  potentialVotes: PotentialVote[];
  roundCalculationConfig: Partial<RoundCalculationConfig>;
  calculate: CalculateFunction;
}): Promise<EstimatedMatch[]> {
  // const reqId = Math.random().toString(36).substring(7);

  // console.time(`${reqId} - total`);

  // console.time(`${reqId} - getRound`);
  const roundConfig = extractCalculationConfigFromRound(round);

  const finalRoundConfig: RoundCalculationConfig = {
    ...roundConfig,
    ...roundCalculationConfig,
  };

  const applications = await dataProvider.loadFile<Application>(
    `${chain.id}/rounds/${round.id}/applications.json`,
    `${chain.id}/rounds/${round.id}/applications.json`
  );

  // console.timeEnd(`${reqId} - getRound`);

  // console.time(`${reqId} - get`);
  const cachedAggregatedContributions =
    await roundContributionsCache?.getCalculationForRound({
      roundId: round.id,
      chainId: chain.id,
    });
  // console.timeEnd(`${reqId} - get`);

  let aggregatedContributions: AggregatedContributions;

  if (cachedAggregatedContributions === undefined) {
    // console.log(`--------------- LOADING`);
    const votes = await dataProvider.loadFile<Vote>(
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
      passportScoresByAddress: passportScoresByAddress,
      minimumAmountUSD: roundConfig.minimumAmountUSD,
      enablePassport: finalRoundConfig.enablePassport,
      overrides: {},
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
        vote.token
      );
    }
  }

  // console.time(`${reqId} - augment`);
  const conversionRateRoundToken = await priceProvider.getUSDConversionRate(
    chain.id,
    round.token
  );

  const potentialVotesAugmented: Vote[] = potentialVotes.map((vote) => {
    const tokenPrice = usdPriceByAddress[vote.token];

    const voteAmountInUsd = convertTokenToFiat({
      tokenAmount: vote.amount,
      tokenDecimals: tokenPrice.decimals,
      tokenPrice: tokenPrice.price,
      tokenPriceDecimals: 8,
    });

    const voteAmountInRoundToken = convertFiatToToken({
      fiatAmount: voteAmountInUsd,
      tokenDecimals: conversionRateRoundToken.decimals,
      tokenPrice: conversionRateRoundToken.price,
      tokenPriceDecimals: 8,
    });

    return {
      ...vote,
      amount: vote.amount.toString(),
      amountRoundToken: voteAmountInRoundToken.toString(),
      amountUSD: voteAmountInUsd,
      applicationId: vote.applicationId,
      id: "",
    };
  });
  // console.timeEnd(`${reqId} - augment`);

  // console.time(`${reqId} - linear1`);
  const originalResults = await calculate({
    aggregatedContributions,
    matchAmount: finalRoundConfig.matchAmount,
    options: {
      minimumAmount: 0n,
      matchingCapAmount: finalRoundConfig.matchingCapAmount,
      ignoreSaturation: false,
    },
  });
  // console.timeEnd(`${reqId} - linear1`);

  // console.time(`${reqId} - aggregate`);
  const passportScoresByAddress = await passportProvider.getScoresByAddresses(
    potentialVotesAugmented.map((v) => v.voter.toLowerCase())
  );

  const potentialContributions = aggregateContributions({
    chain: chain,
    round: round,
    votes: potentialVotesAugmented,
    applications: applications,
    passportScoresByAddress: passportScoresByAddress,
    minimumAmountUSD: roundConfig.minimumAmountUSD,
    enablePassport: false,
    overrides: {},
    proportionalMatchOptions: proportionalMatchOptions,
  });

  const totalAggregations = mergeAggregatedContributions(
    aggregatedContributions,
    potentialContributions
  );

  // console.timeEnd(`${reqId} - aggregate`);

  // console.time(`${reqId} - linear2`);
  const potentialResults = await calculate({
    aggregatedContributions: totalAggregations,
    matchAmount: finalRoundConfig.matchAmount,
    options: {
      minimumAmount: 0n,
      matchingCapAmount: finalRoundConfig.matchingCapAmount,
      ignoreSaturation: false,
    },
  });
  // console.timeEnd(`${reqId} - linear2`);

  // console.time(`${reqId} - diff`);
  const finalResults: EstimatedMatch[] = [];

  const applicationRecipientAddresses = Object.fromEntries(
    applications.map((a) => [a.id, a.metadata?.application.recipient])
  );

  for (const applicationId in potentialResults) {
    const estimatedResult = potentialResults[applicationId];
    const originalResult = originalResults[applicationId];

    const difference =
      estimatedResult.matched - (originalResult?.matched ?? 0n);

    const differenceInUSD = await priceProvider.convertToUSD(
      chain.id,
      round.token,
      difference
    );

    finalResults.push({
      original: originalResult,
      estimated: estimatedResult,
      difference: difference,
      differenceInUSD: differenceInUSD.amount,
      applicationId: applicationId,
      recipient: applicationRecipientAddresses[applicationId],
    });
  }
  // console.timeEnd(`${reqId} - diff`);

  // console.timeEnd(`${reqId} - total`);

  return finalResults;
}
