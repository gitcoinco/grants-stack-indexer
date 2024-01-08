import { linearQFWithAggregates } from "pluralistic";
import { parentPort } from "worker_threads";
import { LinearQfCalculatorArgs } from "./index.js";

if (parentPort === null) {
  throw new Error("needs to run as worker thread");
}

parentPort.on("message", (msg: LinearQfCalculatorArgs) => {
  const result = linearQFWithAggregates(
    msg.aggregatedContributions,
    msg.matchAmount,
    0n,
    msg.options
  );

  parentPort!.postMessage(result);
});
