import { PotentialVote } from "../http/api/v1/matches.js";
import { Application, Round, Vote } from "../indexer/types.js";
import Calculator, {
  AugmentedResult,
  CalculatorOptions,
  MatchingEstimateResult,
} from "./index.js";

export const calculateMatches = async (
  calculatorOptions: CalculatorOptions
): Promise<AugmentedResult[]> => {
  const calculator = new Calculator(calculatorOptions);

  const votes = await calculator.parseJSONFile<Vote>(
    "votes",
    `${calculatorOptions.chainId}/rounds/${calculatorOptions.roundId}/votes.json`
  );

  const applications = await calculator.parseJSONFile<Application>(
    "applications",
    `${calculatorOptions.chainId}/rounds/${calculatorOptions.roundId}/applications.json`
  );

  const matches = await calculator._calculate({ votes, applications });
  return matches;
};

export const calculateMatchingEstimates = async ({
  potentialVotes,
  ...calculatorOptions
}: CalculatorOptions & {
  potentialVotes: PotentialVote[];
}): Promise<MatchingEstimateResult[]> => {
  const calculator = new Calculator(calculatorOptions);

  const applications = await calculator.parseJSONFile<Application>(
    "applications",
    `${calculatorOptions.chainId}/rounds/${calculatorOptions.roundId}/applications.json`
  );

  const rounds = await calculator.parseJSONFile<Round>(
    "rounds",
    `${calculatorOptions.chainId}/rounds.json`
  );

  const votes = await calculator.parseJSONFile<Vote>(
    "votes",
    `${calculatorOptions.chainId}/rounds/${calculatorOptions.roundId}/votes.json`
  );

  const currentMatches = await calculator._calculate({ votes, applications });

  const matchingEstimates = await calculator.estimateMatching({
    currentMatches,
    votes,
    potentialVotes,
    applications,
    rounds,
  });

  return matchingEstimates;
};
