import {
  AggregatedContributions,
  LinearQFOptions,
  linearQFWithAggregates,
} from "pluralistic";

export type LinearQfCalculatorArgs = {
  aggregatedContributions: AggregatedContributions;
  matchAmount: bigint;
  options: LinearQFOptions;
};

export type LinearQfCalculatorResult = ReturnType<
  typeof linearQFWithAggregates
>;

export type LinearQf = (
  msg: LinearQfCalculatorArgs
) => Promise<LinearQfCalculatorResult>;
