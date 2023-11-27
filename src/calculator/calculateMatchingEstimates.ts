import { UnreachableCaseError } from "ts-essentials";
import { PotentialVote } from "../http/api/v1/matches.js";
import { Application, Round, Vote } from "../indexer/types.js";
import { PassportProvider } from "../passport/index.js";
import Calculator, {
  CalculatorOptions,
  DataProvider,
  MatchingEstimateResult,
  ResourceNotFoundError,
} from "./index.js";
import { PriceWithDecimals } from "../prices/common.js";
import { PriceProvider } from "../prices/provider.js";
import { Logger } from "pino";

export const calculateMatchingEstimates = async (
  params: CalculatorOptions & {
    potentialVotes: PotentialVote[];
  } & (
      | {
          implementationType: "load-inprocess-calc-inprocess";
          deps: {
            logger: Logger;
            passportProvider: PassportProvider;
            dataProvider: DataProvider;
            priceProvider: PriceProvider;
          };
        }
      | {
          implementationType: "load-outofprocess-calc-outofprocess";
          deps: { logger: Logger };
        }
    )
): Promise<MatchingEstimateResult[]> => {
  switch (params.implementationType) {
    case "load-inprocess-calc-inprocess":
      return await loadInProcessCalculateInProcess(params);
    case "load-outofprocess-calc-outofprocess":
      return await __stub_loadOutOfProcessCalculateOutOfProcess(params);
    default:
      throw new UnreachableCaseError(params);
  }
};

export const loadInProcessCalculateInProcess = async ({
  potentialVotes,
  ...params
}: CalculatorOptions & {
  potentialVotes: PotentialVote[];
} & {
  deps: {
    passportProvider: PassportProvider;
    dataProvider: DataProvider;
    priceProvider: PriceProvider;
    logger: Logger;
  };
}): Promise<MatchingEstimateResult[]> => {
  const { passportProvider, dataProvider, priceProvider } = params.deps;

  const applications = await dataProvider.loadFile<Application>(
    "applications",
    `${params.chainId}/rounds/${params.roundId}/applications.json`
  );

  const rounds = await dataProvider.loadFile<Round>(
    "rounds",
    `${params.chainId}/rounds.json`
  );

  const votes = await dataProvider.loadFile<Vote>(
    "votes",
    `${params.chainId}/rounds/${params.roundId}/votes.json`
  );

  const round = rounds.find((round) => round.id === params.roundId);

  if (round === undefined) {
    throw new ResourceNotFoundError("round");
  }

  const passportScoresByAddress = await passportProvider.getScoresByAddresses(
    votes.map((vote) => vote.voter)
  );

  const roundTokenPriceInUsd = await priceProvider.getUSDConversionRate(
    params.chainId,
    round.token
  );

  const currentMatches = await new Calculator(params)._calculate({
    round,
    votes,
    applications,
    roundTokenPriceInUsd,
    passportScoresByAddress,
  });

  const tokenAddressToPriceInUsd: Record<string, PriceWithDecimals> = {};

  // fetch each token price only once
  for (const vote of potentialVotes) {
    if (tokenAddressToPriceInUsd[vote.token] === undefined) {
      tokenAddressToPriceInUsd[vote.token] =
        await priceProvider.getUSDConversionRate(params.chainId, vote.token);
    }
  }

  // TODO alternative faster implementation, can be enabled after manual checking
  //
  // const uniqueTokenAddresses = Array.from(
  //   new Set(potentialVotes.map(({ token }) => token))
  // );
  // const tokenAddressToPriceInUsdArray = await Promise.all(
  //   uniqueTokenAddresses.map(async (tokenAddress) => [
  //     tokenAddress,
  //     await params.priceProvider.getUSDConversionRate(
  //       params.chainId,
  //       tokenAddress
  //     ),
  //   ])
  // );
  // const tokenAddressToPriceInUsd: Record<string, PriceWithDecimals> = ({} =
  //   Object.fromEntries(tokenAddressToPriceInUsdArray));

  const matchingEstimates = await new Calculator(params).estimateMatching({
    round,
    currentMatches,
    potentialVotes,
    votes,
    applications,
    passportScoresByAddress,
    roundTokenPriceInUsd,
    tokenAddressToPriceInUsd,
  });

  return matchingEstimates;
};

const __stub_loadOutOfProcessCalculateOutOfProcess = (
  _params: CalculatorOptions
): Promise<MatchingEstimateResult[]> => {
  throw new Error("Not implemented.");
};
