import fs from "fs/promises";
import csv from "csv-parser";
import {
  Calculation,
  Contribution,
  linearQF as pluralisticLinearQF,
} from "pluralistic";
import type { PassportProvider } from "../passport/index.js";
import { PriceProvider } from "../prices/provider.js";
import { Chain, getDecimalsForToken } from "../config.js";
import type { Round, Application, Vote } from "../indexer/types.js";
import {
  CalculatorError,
  ResourceNotFoundError,
  FileNotFoundError,
  OverridesColumnNotFoundError,
  OverridesInvalidRowError,
} from "./errors.js";
import { ProportionalMatchOptions } from "./options.js";
import { applyCoefficients, getVotesWithCoefficients } from "./votes.js";

export type Overrides = Record<string, number>;

export interface RoundCalculationConfig {
  minimumAmountUSD?: number;
  enablePassport?: boolean;
  matchingCapAmount?: bigint;
  matchAmount: bigint;
  token: string;
}

export function extractCalculationConfigFromRound(
  round: Round
): RoundCalculationConfig {
  const matchAmount = BigInt(round.matchAmount);

  let matchingCapAmount: bigint | undefined = undefined;

  if (round.metadata?.quadraticFundingConfig?.matchingCap !== undefined) {
    // round.metadata.quadraticFundingConfig.matchingCapAmount is a percentage,
    // from 0 to 100, and can have decimals
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

  const enablePassport =
    round?.metadata?.quadraticFundingConfig?.sybilDefense === undefined
      ? undefined
      : Boolean(round?.metadata?.quadraticFundingConfig?.sybilDefense);

  const minimumAmountUSD =
    round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount ===
    undefined
      ? undefined
      : Number(
          round.metadata?.quadraticFundingConfig?.minDonationThresholdAmount
        );

  return {
    minimumAmountUSD,
    enablePassport,
    token: round.token,
    matchAmount,
    matchingCapAmount,
  };
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

    const contributions: Contribution[] = applyCoefficients({
      votes: votesWithCoefficients,
      overrides: this.overrides,
    });

    const results = pluralisticLinearQF(
      contributions,
      matchAmount,
      matchTokenDecimals,
      {
        minimumAmount: 0n,
        matchingCapAmount,
        ignoreSaturation: this.ignoreSaturation ?? false,
      }
    );

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

  async parseJSONFile<T>(
    fileDescription: string,
    path: string
  ): Promise<Array<T>> {
    return this.dataProvider.loadFile<T>(fileDescription, path);
  }
}
