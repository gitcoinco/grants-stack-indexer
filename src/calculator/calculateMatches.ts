import { Logger } from "pino";
import { Application, Round, Vote } from "../indexer/types.js";
import { PassportProvider } from "../passport/index.js";
import Calculator, {
  AugmentedResult,
  CalculatorOptions,
  DataProvider,
  ResourceNotFoundError,
} from "./index.js";
import { PriceProvider } from "../prices/provider.js";

export const calculateMatches = async (
  params: CalculatorOptions & {
    deps: {
      passportProvider: PassportProvider;
      dataProvider: DataProvider;
      priceProvider: PriceProvider;
      logger: Logger;
    };
  }
): Promise<AugmentedResult[]> => {
  const { passportProvider, dataProvider, priceProvider } = params.deps;

  const applications = await dataProvider.loadFile<Application>(
    "applications",
    `${params.chainId}/rounds/${params.roundId}/applications.json`
  );

  // TODO to lower memory usage here at the expense of speed, use
  // https://www.npmjs.com/package/stream-json or
  // https://www.npmjs.com/package/@streamparser/json
  const votes = await dataProvider.loadFile<Vote>(
    "votes",
    `${params.chainId}/rounds/${params.roundId}/votes.json`
  );

  const rounds = await dataProvider.loadFile<Round>(
    "rounds",
    `${params.chainId}/rounds.json`
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

  const matches = await new Calculator(params)._calculate({
    votes,
    applications,
    round,
    roundTokenPriceInUsd,
    passportScoresByAddress,
  });

  return matches;
};
