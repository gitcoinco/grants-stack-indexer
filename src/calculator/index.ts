import fs from "fs/promises";
import csv from "csv-parser";
import {
  AggregatedContributions,
  Calculation,
  Contribution,
  aggregateContributions as aggregateContributionsPluralistic,
  linearQF,
} from "pluralistic";
import type {
  AddressToPassportScoreMap,
  PassportProvider,
} from "../passport/index.js";
import { PriceProvider } from "../prices/provider.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { Chain, getDecimalsForToken } from "../config.js";
import type { Round, Application, Vote } from "../indexer/types.js";
import {
  CalculatorError,
  ResourceNotFoundError,
  FileNotFoundError,
  OverridesColumnNotFoundError,
  OverridesInvalidRowError,
} from "./errors.js";
import { PotentialVote } from "../http/api/v1/matches.js";
import { PriceWithDecimals } from "../prices/common.js";
import { zeroAddress } from "viem";
import { ProportionalMatchOptions } from "./options.js";
import TTLCache from "@isaacs/ttlcache";
import { VoteWithCoefficient, getVotesWithCoefficients } from "./votes.js";
import { StaticPool } from "node-worker-threads-pool";
import type { CalculatorWorkerArgs, CalculatorWorkerResult } from "./worker.js";

const linearQfWorkerPool = new StaticPool<
  (msg: CalculatorWorkerArgs) => CalculatorWorkerResult
>({
  size: 10,
  task: "./dist/src/calculator/worker.js",
});

export type Overrides = Record<string, number>;

interface RoundSettings {
  minimumAmountUSD?: number;
  enablePassport?: boolean;
  matchAmount: bigint;
  matchingCapAmount?: bigint;
  matchTokenDecimals: bigint;
  token: string;
}

export interface RoundContributionsCacheKey {
  chainId: number;
  roundId: string;
}

class RoundContributionsCache {
  private cache: TTLCache<string, AggregatedContributions>;

  constructor() {
    this.cache = new TTLCache<string, AggregatedContributions>({
      ttl: 5 * 60 * 1000, // 5 minutes
      max: 10, // keep a maximum of 10 rounds in memory
    });
  }

  async getCalculationForRound(
    key: RoundContributionsCacheKey
  ): Promise<AggregatedContributions | undefined> {
    return await this.cache.get(`${key.roundId}-${key.chainId}`);
  }

  setCalculationForRound({
    roundId,
    chainId,
    contributions,
  }: RoundContributionsCacheKey & {
    contributions: AggregatedContributions;
  }): void {
    this.cache.set(`${roundId}-${chainId}`, contributions);
  }
}

const roundCalculationCache = new RoundContributionsCache();

function votesWithCoefficientToContribution(config: {
  votes: VoteWithCoefficient[];
  overrides: Overrides;
}): (Contribution & { recipientAddress: string })[] {
  return config.votes.map((vote) => {
    const scaleFactor = 10_000;
    const coefficient = BigInt(
      Math.trunc((config.overrides[vote.id] ?? vote.coefficient) * scaleFactor)
    );

    const amount = BigInt(vote.amountRoundToken);
    const multipliedAmount = (amount * coefficient) / BigInt(scaleFactor);

    return {
      contributor: vote.voter,
      recipient: vote.applicationId,
      recipientAddress: vote.grantAddress,
      amount: multipliedAmount,
    };
  });
}

function mergeAggregatedContributions(
  contributions1: AggregatedContributions,
  contributions2: AggregatedContributions
): AggregatedContributions {
  const merged: AggregatedContributions = {
    totalReceived: contributions1.totalReceived + contributions2.totalReceived,
    list: {},
  };

  for (const recipient in contributions1.list) {
    merged.list[recipient] = {
      totalReceived: contributions1.list[recipient].totalReceived,
      contributions: { ...contributions1.list[recipient].contributions },
    };
  }

  for (const recipient in contributions2.list) {
    if (!merged.list[recipient]) {
      merged.list[recipient] = {
        totalReceived: 0n,
        contributions: {},
      };
    }

    merged.list[recipient].totalReceived +=
      contributions2.list[recipient].totalReceived;

    for (const contributor in contributions2.list[recipient].contributions) {
      if (!merged.list[recipient].contributions[contributor]) {
        merged.list[recipient].contributions[contributor] = 0n;
      }

      merged.list[recipient].contributions[contributor] +=
        contributions2.list[recipient].contributions[contributor];
    }
  }

  return merged;
}

interface AggregatedContributionsConfig {
  chain: Chain;
  round: Round;
  applications: Application[];
  votes: Vote[];
  passportScoresByAddress: AddressToPassportScoreMap;
  minimumAmountUSD?: number;
  enablePassport?: boolean;
  overrides: Record<string, number>;
  proportionalMatchOptions?: ProportionalMatchOptions;
}

function aggregateContributions({
  chain,
  round,
  applications,
  votes,
  passportScoresByAddress,
  minimumAmountUSD,
  enablePassport,
  overrides,
  proportionalMatchOptions,
}: AggregatedContributionsConfig): AggregatedContributions {
  const votesWithCoefficients = getVotesWithCoefficients({
    chain: chain,
    round,
    applications,
    votes,
    passportScoresByAddress,
    options: {
      minimumAmountUSD: minimumAmountUSD,
      enablePassport: enablePassport,
    },
    proportionalMatchOptions: proportionalMatchOptions,
  });

  const contributions = votesWithCoefficientToContribution({
    votes: votesWithCoefficients,
    overrides,
  });

  return aggregateContributionsPluralistic(contributions);
}

export {
  CalculatorError,
  ResourceNotFoundError,
  FileNotFoundError,
  OverridesColumnNotFoundError,
  OverridesInvalidRowError,
};

export interface DataProvider {
  loadFile<T>(description: string, path: string): Promise<Array<T>>;
}

export class FileSystemDataProvider implements DataProvider {
  basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async loadFile<T>(description: string, path: string): Promise<Array<T>> {
    const fullPath = `${this.basePath}/${path}`;

    try {
      const data = await fs.readFile(fullPath, "utf8");
      return JSON.parse(data) as Array<T>;
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        throw new FileNotFoundError(description);
      } else {
        throw err;
      }
    }
  }
}

export function parseOverrides(buf: Buffer): Promise<Overrides> {
  return new Promise((resolve, _reject) => {
    const results: Overrides = {};
    let rowIndex = 1;

    const stream = csv()
      .on("headers", (headers: string[]) => {
        if (headers.indexOf("id") < 0) {
          throw new OverridesColumnNotFoundError("id");
        }

        if (headers.indexOf("coefficient") < 0) {
          throw new OverridesColumnNotFoundError("coefficient");
        }
      })
      .on("data", (data: Record<string, string>) => {
        const coefficient = Number(data["coefficient"]);
        if (!Number.isFinite(coefficient)) {
          throw new OverridesInvalidRowError(
            rowIndex,
            `Coefficient must be a number, found: ${data["coefficient"]}`
          );
        }

        results[data["id"]] = coefficient;
        rowIndex += 1;
      })
      .on("end", () => {
        resolve(results);
      });

    stream.write(buf);
    stream.end();
  });
}

export type CalculatorOptions = {
  priceProvider: PriceProvider;
  dataProvider: DataProvider;
  passportProvider: PassportProvider;
  chainId: number;
  roundId: string;
  minimumAmountUSD?: number;
  matchingCapAmount?: bigint;
  enablePassport?: boolean;
  ignoreSaturation?: boolean;
  overrides: Overrides;
  chain: Chain;
  proportionalMatch?: ProportionalMatchOptions;
};

export type AugmentedResult = Calculation & {
  projectId: string;
  applicationId: string;
  matchedUSD: number;
  projectName?: string;
  payoutAddress?: string;
};

export default class Calculator {
  private passportProvider: PassportProvider;
  private priceProvider: PriceProvider;
  private dataProvider: DataProvider;
  private chainId: number; // XXX remove
  private chain: Chain;
  private roundId: string;
  private minimumAmountUSD: number | undefined;
  private matchingCapAmount: bigint | undefined;
  private enablePassport: boolean | undefined;
  private ignoreSaturation: boolean | undefined;
  private overrides: Overrides;
  private proportionalMatch?: ProportionalMatchOptions;

  constructor(options: CalculatorOptions) {
    this.passportProvider = options.passportProvider;
    this.priceProvider = options.priceProvider;
    this.dataProvider = options.dataProvider;
    this.chainId = options.chainId; // XXX remove
    this.roundId = options.roundId;
    this.minimumAmountUSD = options.minimumAmountUSD;
    this.enablePassport = options.enablePassport;
    this.matchingCapAmount = options.matchingCapAmount;
    this.overrides = options.overrides;
    this.ignoreSaturation = options.ignoreSaturation;
    this.chain = options.chain;
    this.proportionalMatch = options.proportionalMatch;
  }

  async calculate(): Promise<Array<AugmentedResult>> {
    const votes = await this.parseJSONFile<Vote>(
      "votes",
      `${this.chainId}/rounds/${this.roundId}/votes.json`
    );

    return this._calculate(votes);
  }

  private async _getVotes(): Promise<Array<Vote>> {
    return this.parseJSONFile<Vote>(
      "votes",
      `${this.chainId}/rounds/${this.roundId}/votes.json`
    );
  }

  private async _getApplications(): Promise<Array<Application>> {
    return this.parseJSONFile<Application>(
      "applications",
      `${this.chainId}/rounds/${this.roundId}/applications.json`
    );
  }

  private async _getRound(): Promise<Round> {
    const rounds = await this.parseJSONFile<Round>(
      "round",
      `${this.chainId}/rounds.json`
    );

    const round = rounds.find((round) => round.id === this.roundId);

    if (round === undefined) {
      throw new ResourceNotFoundError("round");
    }

    return round;
  }

  private _getRoundSettings(round: Round): RoundSettings {
    const matchAmount = BigInt(round.matchAmount);
    const matchTokenDecimals = BigInt(
      getDecimalsForToken(this.chainId, round.token)
    );

    let matchingCapAmount = this.matchingCapAmount;

    if (
      matchingCapAmount === undefined &&
      (round.metadata?.quadraticFundingConfig?.matchingCap ?? false)
    ) {
      // round.metadata.quadraticFundingConfig.matchingCapAmount is a percentage, 0 to 100, could contain decimals
      matchingCapAmount =
        (matchAmount *
          BigInt(
            Math.trunc(
              Number(
                round.metadata?.quadraticFundingConfig?.matchingCapAmount ?? 0
              ) * 100
            )
          )) /
        10000n;
    }

    return {
      minimumAmountUSD: this.minimumAmountUSD,
      enablePassport: this.enablePassport,
      token: round.token,
      matchAmount,
      matchTokenDecimals,
      matchingCapAmount,
    };
  }

  private async _linearQF({
    priceProvider,
    chainId,
    roundSettings,
    aggregatedContributions,
    applications,
    ignoreSaturation,
  }: {
    priceProvider: PriceProvider;
    chainId: number;
    roundSettings: RoundSettings;
    applications: Application[];
    aggregatedContributions: AggregatedContributions;
    ignoreSaturation?: boolean;
  }): Promise<Array<AugmentedResult>> {
    const results = await linearQfWorkerPool.exec({
      aggregatedContributions,
      matchAmount: roundSettings.matchAmount,
      options: {
        minimumAmount: 0n,
        matchingCapAmount: roundSettings.matchingCapAmount,
        ignoreSaturation: ignoreSaturation ?? false,
      },
    });

    const augmented: Array<AugmentedResult> = [];

    const applicationsMap = applications.reduce(
      (all, current) => {
        all[current.id] = current;
        return all;
      },
      {} as Record<string, Application>
    );

    for (const id in results) {
      const calc = results[id];
      const application = applicationsMap[id];

      const conversionUSD = await priceProvider.convertToUSD(
        chainId,
        roundSettings.token,
        calc.matched
      );

      augmented.push({
        ...calc,
        matchedUSD: conversionUSD.amount,
        projectId: application.projectId,
        applicationId: application.id,
        projectName: application.metadata?.application?.project?.title,
        payoutAddress: application.metadata?.application?.recipient,
      });
    }

    return augmented;
  }

  private async _calculate(votes: Vote[]): Promise<Array<AugmentedResult>> {
    const applications = await this.parseJSONFile<Application>(
      "applications",
      `${this.chainId}/rounds/${this.roundId}/applications.json`
    );

    const rounds = await this.parseJSONFile<Round>(
      "rounds",
      `${this.chainId}/rounds.json`
    );

    const round = rounds.find((r: Round) => r.id === this.roundId);

    if (round === undefined) {
      throw new ResourceNotFoundError("round");
    }

    if (round.matchAmount === undefined) {
      throw new ResourceNotFoundError("round match amount");
    }

    if (round.token === undefined) {
      throw new ResourceNotFoundError("round token");
    }

    const matchAmount = BigInt(round.matchAmount);
    const matchTokenDecimals = BigInt(
      getDecimalsForToken(this.chainId, round.token)
    );

    let matchingCapAmount = this.matchingCapAmount;

    if (
      matchingCapAmount === undefined &&
      (round.metadata?.quadraticFundingConfig?.matchingCap ?? false)
    ) {
      // round.metadata.quadraticFundingConfig.matchingCapAmount is a percentage, 0 to 100, could contain decimals
      matchingCapAmount =
        (matchAmount *
          BigInt(
            Math.trunc(
              Number(
                round.metadata?.quadraticFundingConfig?.matchingCapAmount ?? 0
              ) * 100
            )
          )) /
        10000n;
    }

    const passportScoresByAddress =
      await this.passportProvider.getScoresByAddresses(
        votes.map((vote) => vote.voter.toLowerCase())
      );

    const votesWithCoefficients = getVotesWithCoefficients({
      chain: this.chain,
      round,
      applications,
      votes,
      passportScoresByAddress,
      options: {
        minimumAmountUSD: this.minimumAmountUSD,
        enablePassport: this.enablePassport,
      },
      proportionalMatchOptions: this.proportionalMatch,
    });

    const contributions: Contribution[] = votesWithCoefficientToContribution({
      votes: votesWithCoefficients,
      overrides: this.overrides,
    });

    const results = linearQF(contributions, matchAmount, matchTokenDecimals, {
      minimumAmount: 0n,
      matchingCapAmount,
      ignoreSaturation: this.ignoreSaturation ?? false,
    });

    const augmented: Array<AugmentedResult> = [];

    const applicationsMap = applications.reduce(
      (all, current) => {
        all[current.id] = current;
        return all;
      },
      {} as Record<string, Application>
    );

    for (const id in results) {
      const calc = results[id];
      const application = applicationsMap[id];

      const conversionUSD = await this.priceProvider.convertToUSD(
        this.chainId,
        round.token,
        calc.matched
      );

      augmented.push({
        ...calc,
        matchedUSD: conversionUSD.amount,
        projectId: application.projectId,
        applicationId: application.id,
        projectName: application.metadata?.application?.project?.title,
        payoutAddress: application.metadata?.application?.recipient,
      });
    }

    return augmented;
  }

  /**
   * Estimates matching for a given project and potential additional votes
   * @param potentialVotes
   */
  async estimateMatching(
    potentialVotes: PotentialVote[]
  ): Promise<MatchingEstimateResult[]> {
    const reqId = Math.random().toString(36).substring(7);

    // console.time(`${reqId} - total`);
    // console.time(`${reqId} - get`);
    const cachedContributions =
      await roundCalculationCache.getCalculationForRound({
        roundId: this.roundId,
        chainId: this.chainId,
      });
    // console.timeEnd(`${reqId} - get`);

    // console.time(`${reqId} - getRound`);
    const round = await this._getRound();
    const settings = this._getRoundSettings(round);
    const applications = await this._getApplications();
    // console.timeEnd(`${reqId} - getRound`);

    let aggregatedContributions: AggregatedContributions;

    if (cachedContributions === undefined) {
      // console.log(`--------------- LOADING`);
      const votes = await this._getVotes();
      const applications = await this._getApplications();

      const passportScoresByAddress =
        await this.passportProvider.getScoresByAddresses(
          votes.map((v) => v.voter.toLowerCase())
        );

      aggregatedContributions = aggregateContributions({
        chain: this.chain,
        round: round,
        votes: votes,
        applications: applications,
        passportScoresByAddress: passportScoresByAddress,
        minimumAmountUSD: settings.minimumAmountUSD,
        enablePassport: this.enablePassport,
        overrides: this.overrides,
        proportionalMatchOptions: this.proportionalMatch,
      });

      roundCalculationCache.setCalculationForRound({
        roundId: this.roundId,
        chainId: this.chainId,
        contributions: aggregatedContributions,
      });
    } else {
      aggregatedContributions = cachedContributions;
    }

    const usdPriceByAddress: Record<string, PriceWithDecimals> = {};

    // fetch each token price only once
    for (const vote of potentialVotes) {
      if (usdPriceByAddress[vote.token] === undefined) {
        usdPriceByAddress[vote.token] =
          await this.priceProvider.getUSDConversionRate(
            this.chainId,
            vote.token
          );
      }
    }

    // console.time(`${reqId} - augment`);
    const conversionRateRoundToken =
      await this.priceProvider.getUSDConversionRate(this.chainId, round.token);

    const potentialVotesAugmented: Vote[] = potentialVotes.map((vote) => {
      const tokenPrice = usdPriceByAddress[vote.token];

      const voteAmountInUsd = convertTokenToFiat({
        tokenAmount: vote.amount,
        tokenDecimals: tokenPrice.decimals,
        tokenPrice: tokenPrice.price,
        tokenPriceDecimals: 8,
      });

      const voteAmountInRoundToken = convertFiatToToken({
        fiatAmount: voteAmountInUsd,
        tokenDecimals: conversionRateRoundToken.decimals,
        tokenPrice: conversionRateRoundToken.price,
        tokenPriceDecimals: 8,
      });

      return {
        ...vote,
        amount: vote.amount.toString(),
        amountRoundToken: voteAmountInRoundToken.toString(),
        amountUSD: voteAmountInUsd,
        applicationId: vote.applicationId,
        id: "",
      };
    });
    // console.timeEnd(`${reqId} - augment`);

    // console.time(`${reqId} - linear1`);
    const currentResults = await this._linearQF({
      chainId: this.chainId,
      roundSettings: settings,
      aggregatedContributions: aggregatedContributions,
      priceProvider: this.priceProvider,
      applications,
      ignoreSaturation: this.ignoreSaturation,
    });
    // console.timeEnd(`${reqId} - linear1`);

    // console.time(`${reqId} - aggregate`);
    // const passportScoresByAddress =
    //   await this.passportProvider.getScoresByAddresses(
    //     potentialVotesAugmented.map((v) => v.voter.toLowerCase())
    //   );

    const potentialContributions = aggregateContributions({
      chain: this.chain,
      round: round,
      votes: potentialVotesAugmented,
      applications: applications,
      passportScoresByAddress: new Map(),
      minimumAmountUSD: settings.minimumAmountUSD,
      enablePassport: false,
      overrides: this.overrides,
      proportionalMatchOptions: this.proportionalMatch,
    });

    const totalAggregations = mergeAggregatedContributions(
      aggregatedContributions,
      potentialContributions
    );

    // console.timeEnd(`${reqId} - aggregate`);

    // console.time(`${reqId} - linear2`);
    const potentialResults = await this._linearQF({
      chainId: this.chainId,
      roundSettings: settings,
      aggregatedContributions: totalAggregations,
      priceProvider: this.priceProvider,
      applications,
      ignoreSaturation: this.ignoreSaturation,
    });
    // console.timeEnd(`${reqId} - linear2`);

    // console.time(`${reqId} - diff`);
    const finalResults: MatchingEstimateResult[] = [];

    for (const potentialResult of potentialResults) {
      const currentResult = currentResults.find(
        (res) =>
          res.projectId === potentialResult.projectId &&
          res.applicationId === potentialResult.applicationId
      );

      /* Subtracting undefined from a bigint would fail,
       * so we explicitly subtract 0 if it's undefined */
      const difference =
        potentialResult.matched - (currentResult?.matched ?? 0n);

      const differenceInUSD = await this.priceProvider.convertToUSD(
        this.chainId,
        round.token,
        difference
      );

      /** Can be undefined, but spreading an undefined is a no-op, so it's okay here */
      finalResults.push({
        ...currentResult,
        ...potentialResult,
        difference,
        roundId: this.roundId,
        chainId: this.chainId,
        recipient: currentResult?.payoutAddress ?? zeroAddress,
        differenceInUSD: differenceInUSD.amount,
      });
    }
    // console.timeEnd(`${reqId} - diff`);

    // console.timeEnd(`${reqId} - total`);

    return finalResults;
  }

  async parseJSONFile<T>(
    fileDescription: string,
    path: string
  ): Promise<Array<T>> {
    return this.dataProvider.loadFile<T>(fileDescription, path);
  }
}

type MatchingEstimateResult = Calculation & {
  difference: bigint;
  differenceInUSD: number;
  roundId: string;
  chainId: number;
  recipient: string;
};
