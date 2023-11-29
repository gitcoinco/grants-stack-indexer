import {
  AggregatedContributions,
  LinearQFOptions,
  linearQFWithAggregates,
} from "pluralistic";
import { parentPort } from "worker_threads";

if (parentPort === null) {
  throw new Error("needs to run as worker thread");
}

export type CalculatorArgs = {
  aggregatedContributions: AggregatedContributions;
  matchAmount: bigint;
  options: LinearQFOptions;
};

export type CalculatorResult = ReturnType<typeof linearQFWithAggregates>;

parentPort.on("message", (msg: CalculatorArgs) => {
  const result = linearQFWithAggregates(
    msg.aggregatedContributions,
    msg.matchAmount,
    0n,
    msg.options
  );

  parentPort!.postMessage(result);
});
