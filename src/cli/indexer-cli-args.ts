import { RetryProvider, Log } from "chainsauce";
import path from "node:path";
import { parseArgs } from "node:util";
import config from "../config.js";
import { IndexingServiceConfig } from "../indexer/service.js";

export function readServiceConfigFromArgs(): IndexingServiceConfig {
  const { values: args } = parseArgs({
    options: {
      chain: {
        type: "string",
        short: "s",
      },
      "log-level": {
        type: "string",
      },
      follow: {
        type: "boolean",
        short: "f",
      },
      "to-block": {
        type: "string",
      },
      "from-block": {
        type: "string",
      },
      clear: {
        type: "boolean",
      },
      "no-cache": {
        type: "boolean",
      },
    },
  });

  const chainName = args.chain;

  if (!chainName) {
    throw new Error("Chain not provided");
  }

  const chain = config.chains.find((chain) => chain.name === chainName);
  if (!chain) {
    throw new Error("Chain " + chainName + " is not configured");
  }

  const toBlock = "to-block" in args ? Number(args["to-block"]) : "latest";
  const fromBlock = "from-block" in args ? Number(args["from-block"]) : 0;

  const provider = new RetryProvider({
    url: chain.rpc,
    timeout: 5 * 60 * 1000,
  });

  let logLevel = Log.Info;
  if (args["log-level"]) {
    switch (args["log-level"]) {
      case "debug":
        logLevel = Log.Debug;
        break;
      case "info":
        logLevel = Log.Info;
        break;
      case "warning":
        logLevel = Log.Warning;
        break;
      case "error":
        logLevel = Log.Error;
        break;
      default:
        throw new Error("Invalid log level.");
    }
  }

  const storageDir = path.join(config.storageDir, chain.id.toString());

  const cacheDir = config.cacheDir;

  const clear = args.clear;

  const oneShot = !args.follow;

  return {
    chain,
    provider,
    toBlock,
    fromBlock,
    storageDir,
    cacheDir,
    logLevel,
    oneShot,
    clear,
  };
}
