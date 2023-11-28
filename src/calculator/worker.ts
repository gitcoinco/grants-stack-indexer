import {
  AggregatedContributions,
  LinearQFOptions,
  linearQFWithAggregates,
} from "pluralistic";
import { parentPort } from "worker_threads";

if (parentPort === null) {
  throw new Error("No parent port");
}

export type CalculatorWorkerArgs = {
  aggregatedContributions: AggregatedContributions;
  matchAmount: bigint;
  options: LinearQFOptions;
};

export type CalculatorWorkerResult = ReturnType<typeof linearQFWithAggregates>;

parentPort.on("message", (msg: CalculatorWorkerArgs) => {
  const result = linearQFWithAggregates(
    msg.aggregatedContributions,
    msg.matchAmount,
    0n,
    msg.options
  );

  parentPort!.postMessage(result);
});
