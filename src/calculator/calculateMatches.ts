import { Logger } from "pino";
import { fork } from "node:child_process";
import { UnreachableCaseError } from "ts-essentials";
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
  params: CalculatorOptions &
    (
      | {
          implementationType:
            | "load-inprocess-calc-inprocess"
            | "load-inprocess-calc-outofprocess";
          deps: {
            passportProvider: PassportProvider;
            dataProvider: DataProvider;
            priceProvider: PriceProvider;
            logger: Logger;
          };
        }
      | {
          implementationType: "load-outofprocess-calc-outofprocess";
        }
    )
): Promise<AugmentedResult[]> => {
  switch (params.implementationType) {
    case "load-inprocess-calc-inprocess":
      return await loadInProcessCalculateInProcess(params);
    case "load-inprocess-calc-outofprocess":
      return await __nonFunctional_loadInProcessCalculateMatchesOutOfProcess(
        params
      );
    case "load-outofprocess-calc-outofprocess":
      return await __stub_loadOutOfProcessCalculateOutOfProcess(params);
    default:
      throw new UnreachableCaseError(params);
  }
};

const loadInProcessCalculateInProcess = async (
  params: CalculatorOptions & {
    deps: {
      passportProvider: PassportProvider;
      dataProvider: DataProvider;
      priceProvider: PriceProvider;
      logger: Logger;
    };
  }
): Promise<AugmentedResult[]> => {
  const { passportProvider, dataProvider, priceProvider, logger } = params.deps;

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

const __nonFunctional_loadInProcessCalculateMatchesOutOfProcess = async (
  params: CalculatorOptions & {
    deps: {
      passportProvider: PassportProvider;
      dataProvider: DataProvider;
      priceProvider: PriceProvider;
      logger: Logger;
    };
  }
): Promise<AugmentedResult[]> => {
  const { deps, ...calculatorConfig } = params;
  const { passportProvider, dataProvider, priceProvider, logger } = deps;

  logger.warn(
    `called non-functional loadDatInProcessAndCalculateMatchesOutOfProcess`
  );

  const applications = await dataProvider.loadFile<Application>(
    "applications",
    `${params.chainId}/rounds/${params.roundId}/applications.json`
  );

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

  return await new Promise<AugmentedResult[]>((resolve, reject) => {
    const child = fork("dist/src/calculator/calculateMatches.subprocess.js", {
      serialization: "advanced", // to support BigInt
    });

    logger.debug(`started calculator subprocess (pid: ${child.pid})`);

    child.on("error", (err) => {
      logger.error({ msg: "calculator subprocess ran into an error", err });
      reject(err);
    });

    child.on("exit", (code) => {
      logger.debug(`calculator subprocess exited with code ${code}`);
    });

    child.send({
      calculatorConfig,
      calculatorValues: {
        votes,
        applications,
        round,
        roundTokenPriceInUsd,
        passportScoresByAddress,
      },
    });

    // TODO reject if a message isn't received within a certain time
    child.on("message", (message) => {
      // TODO remove cast
      const { matches } = message as { matches: AugmentedResult[] };

      if (matches === undefined) {
        logger.warn("anomaly detected: subprocess sent empty message");
      } else {
        logger.debug("received result from subprocess");
        resolve(matches);
      }
    });
  });
};

const __stub_loadOutOfProcessCalculateOutOfProcess = async (
  _params: CalculatorOptions
): Promise<AugmentedResult[]> => {
  throw new Error("Not implemented.");

  // Example of what a stand-alone script might contain:

  // const config = getConfig();

  // const baseLogger = pino({
  //   level: config.logLevel,
  //   formatters: {
  //     level(level) {
  //       // represent severity as strings so that DataDog can recognize it
  //       return { level };
  //     },
  //   },
  // }).child({
  //   service: `indexer-${config.deploymentEnvironment}`,
  //   subsystem: "Calculator",
  // });

  // const passportProvider = createPassportProvider({
  //   // TODO further qualify as 'Calculator/PassportProvider'?
  //   logger: baseLogger.child({ subsystem: "PassportProvider" }),
  //   scorerId: config.passportScorerId,
  //   dbPath: path.join(config.storageDir, "passport_scores.leveldb"),
  //   deprecatedJSONPassportDumpPath: path.join(
  //     config.chainDataDir,
  //     "passport_scores.json"
  //   ),
  // });

  // const dataProvider = new FileSystemDataProvider(config.chainDataDir);

  // const priceProvider = createPriceProvider({
  //   chainDataDir: config.chainDataDir,
  //   // TODO further qualify as 'Calculator/PriceProvider'?
  //   logger: baseLogger.child({ subsystem: "PriceProvider" }),
  // });

  // // invoke process instead
  // // await passportProvider.start({ watch: !config.runOnce });

  // const applications = await dataProvider.loadFile<Application>(
  //   "applications",
  //   `${params.chainId}/rounds/${params.roundId}/applications.json`
  // );

  // const votes = await dataProvider.loadFile<Vote>(
  //   "votes",
  //   `${params.chainId}/rounds/${params.roundId}/votes.json`
  // );

  // const rounds = await dataProvider.loadFile<Round>(
  //   "rounds",
  //   `${params.chainId}/rounds.json`
  // );

  // const round = rounds.find((round) => round.id === params.roundId);

  // if (round === undefined) {
  //   throw new ResourceNotFoundError("round");
  // }

  // const passportScoresByAddress = await passportProvider.getScoresByAddresses(
  //   votes.map((vote) => vote.voter)
  // );

  // const roundTokenPriceInUsd = await priceProvider.getUSDConversionRate(
  //   params.chainId,
  //   round.token
  // );

  // const matches = await new Calculator(params)._calculate({
  //   votes,
  //   applications,
  //   round,
  //   roundTokenPriceInUsd,
  //   passportScoresByAddress,
  // });
};
