import { UnreachableCaseError } from "ts-essentials";
import { Application, Round, Vote } from "../indexer/types.js";
import { PassportProvider } from "../passport/index.js";
import Calculator, {
  AugmentedResult,
  CalculatorOptions,
  DataProvider,
  ResourceNotFoundError,
} from "./index.js";

export const calculateMatches = async (
  params: CalculatorOptions &
    (
      | {
          implementationType: "in-process";
          deps: {
            passportProvider: PassportProvider;
            dataProvider: DataProvider;
          };
        }
      | {
          implementationType: "subprocess";
        }
    )
): Promise<AugmentedResult[]> => {
  switch (params.implementationType) {
    case "in-process":
      return await calculateMatchesInProcess(params);
    case "subprocess":
      return await STUB_calculateMatchesInSubprocess(params);
    default:
      throw new UnreachableCaseError(params);
  }
};

const calculateMatchesInProcess = async (
  params: CalculatorOptions & {
    deps: {
      passportProvider: PassportProvider;
      dataProvider: DataProvider;
    };
  }
): Promise<AugmentedResult[]> => {
  const { passportProvider, dataProvider } = params.deps;
  const { priceProvider } = params;

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

  const matches = await new Calculator(params)._calculate({
    votes,
    applications,
    round,
    roundTokenPriceInUsd,
    passportScoresByAddress,
  });

  return matches;
};

const STUB_calculateMatchesInSubprocess = (
  _params: CalculatorOptions
): Promise<AugmentedResult[]> => {
  // TODO
  //
  // write a separate module that carries out the same operations as
  // `calculateMatchesInProcess` without relying on instance of DataProvider,
  // PriceProvider, and PassportProvider to be passed in. Invoke it via
  // `fork()`, providing input and receiving results via IPC.
  //
  // To replace calls to the DataProvider, a DataProvider can be instantiated in
  // the script.
  //
  // To replace calls to the PriceProvider, the existing PriceProvider could be
  // expected and queried in this function, and only the necessary data
  // (conversion rates) be passed to the subprocess.
  //
  // To replace calls to the PassportProvider, the existing PassportProvider
  // could be expected and queried in this function, and only the necessary data
  // (passport scores for given voters) be passed to the subprocess. However, to
  // get the passport scores, the votes file would have to be read in this
  // function as well.

  // Example:
  //
  // const votes = await dataProvider.loadFile<Vote>(
  //   "votes",
  //   `${params.chainId}/rounds/${params.roundId}/votes.json`
  // );
  //
  // return await invokeSubprocessCalculator({
  //   ...params,
  //   chainDataDir: (dataProvider as FilesystemDataProvider).basePath as string,
  //   votesFilepath: `${params.chainId}/rounds/${params.roundId}/votes.json`,
  //   roundsFilepath: `${params.chainId}/rounds.json`,
  //   applicationsFilepath: `${params.chainId}/rounds/${params.roundId}/applications.json`,
  //   passportScoresByAddress: await passportProvider.getScoresByAddresses(
  //     votes.map((vote) => vote.voter)
  //   ),
  // });

  throw new Error("Not yet implemented");
};
