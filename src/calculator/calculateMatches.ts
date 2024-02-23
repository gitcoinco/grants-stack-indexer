import { Logger } from "pino";
import { PassportProvider } from "../passport/index.js";
import { DataProvider } from "./dataProvider/index.js";
import { ResourceNotFoundError } from "./errors.js";
import { PriceProvider } from "../prices/provider.js";
import { aggregateContributions } from "./votes.js";
import { Calculation, linearQFWithAggregates } from "pluralistic";
import { ProportionalMatchOptions } from "./options.js";
import { CoefficientOverrides } from "./coefficientOverrides.js";
import { Chain } from "../config.js";
import {
  CalculationConfig,
  extractCalculationConfigFromRound,
  overrideCalculationConfig,
} from "./calculationConfig.js";
import { convertTokenToFiat } from "../tokenMath.js";
import { parseAddress } from "../address.js";
import {
  DeprecatedApplication,
  DeprecatedRound,
  DeprecatedVote,
} from "../deprecatedJsonDatabase.js";

export type CalculateMatchesConfig = {
  roundId: string;
  calculationConfigOverride?: Partial<CalculationConfig>;
  coefficientOverrides: CoefficientOverrides;
  chain: Chain;
  proportionalMatch?: ProportionalMatchOptions;
  deps: {
    passportProvider: PassportProvider;
    dataProvider: DataProvider;
    priceProvider: PriceProvider;
    logger: Logger;
  };
};

export type AugmentedResult = Calculation & {
  projectId: string;
  applicationId: string;
  matchedUSD: number;
  projectName?: string;
  payoutAddress?: string;
};

export const calculateMatches = async (
  params: CalculateMatchesConfig
): Promise<AugmentedResult[]> => {
  const {
    calculationConfigOverride,
    coefficientOverrides,
    chain,
    roundId,
    proportionalMatch,
    deps: { passportProvider, dataProvider, priceProvider },
  } = params;

  const applications = await dataProvider.loadFile<DeprecatedApplication>(
    "applications",
    `${chain.id}/rounds/${roundId}/applications.json`
  );

  const votes = await dataProvider.loadFile<DeprecatedVote>(
    "votes",
    `${chain.id}/rounds/${roundId}/votes.json`
  );

  const rounds = await dataProvider.loadFile<DeprecatedRound>(
    "rounds",
    `${chain.id}/rounds.json`
  );

  const round = rounds.find((round) => round.id === params.roundId);

  if (round === undefined) {
    throw new ResourceNotFoundError("round");
  }

  const roundCalculationConfig = extractCalculationConfigFromRound(round);

  const calculationConfig: CalculationConfig = overrideCalculationConfig(
    roundCalculationConfig,
    calculationConfigOverride ?? {}
  );

  const passportScoreByAddress = await passportProvider.getScoresByAddresses(
    votes.map((vote) => vote.voter.toLowerCase())
  );

  const roundTokenPriceInUsd = await priceProvider.getUSDConversionRate(
    chain.id,
    parseAddress(round.token),
    "latest"
  );

  const aggregatedContributions = aggregateContributions({
    chain,
    round,
    votes,
    applications,
    passportScoreByAddress,
    enablePassport: calculationConfig.enablePassport,
    minimumAmountUSD: calculationConfig.minimumAmountUSD,
    coefficientOverrides,
    proportionalMatchOptions: proportionalMatch,
  });

  const results = linearQFWithAggregates(
    aggregatedContributions,
    calculationConfig.matchAmount,
    0n, // not used, should be deleted in Pluralistic
    {
      minimumAmount: 0n, // we're filtering by minimum amount in aggregateContributions
      matchingCapAmount: calculationConfig.matchingCapAmount,
      ignoreSaturation: calculationConfig.ignoreSaturation ?? false,
    }
  );

  const augmented: Array<AugmentedResult> = [];

  const applicationsMap = applications.reduce(
    (all, current) => {
      all[current.id] = current;
      return all;
    },
    {} as Record<string, DeprecatedApplication>
  );

  for (const id in results) {
    const calc = results[id];
    const application = applicationsMap[id];

    const conversionUSD = {
      amount: convertTokenToFiat({
        tokenAmount: calc.matched,
        tokenDecimals: roundTokenPriceInUsd.tokenDecimals,
        tokenPrice: roundTokenPriceInUsd.priceInUsd,
        tokenPriceDecimals: 8,
      }),
      price: roundTokenPriceInUsd.priceInUsd,
    };

    augmented.push({
      ...calc,
      matchedUSD: conversionUSD.amount,
      projectId: application.projectId,
      applicationId: application.id,
      projectName: application.metadata?.application?.project?.title,
      payoutAddress: application.metadata?.application?.recipient,
    });
  }

  return augmented;
};
