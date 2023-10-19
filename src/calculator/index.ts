import fs from "fs/promises";
import csv from "csv-parser";
import { linearQF, Contribution, Calculation } from "pluralistic";
import type { PassportProvider } from "../passport/index.js";
import { PriceProvider } from "../prices/provider.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { Chain, getDecimalsForToken } from "../config.js";
import type { Round, Application, Vote } from "../indexer/types.js";
import { getVotesWithCoefficients, VoteWithCoefficient } from "./votes.js";
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

export type Overrides = Record<string, number>;

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
  passportThreshold?: number;
  enablePassport?: boolean;
  ignoreSaturation?: boolean;
  overrides: Overrides;
  chain: Chain;
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
  private passportThreshold: number | undefined;
  private ignoreSaturation: boolean | undefined;
  private overrides: Overrides;

  constructor(options: CalculatorOptions) {
    this.passportProvider = options.passportProvider;
    this.priceProvider = options.priceProvider;
    this.dataProvider = options.dataProvider;
    this.chainId = options.chainId; // XXX remove
    this.roundId = options.roundId;
    this.minimumAmountUSD = options.minimumAmountUSD;
    this.enablePassport = options.enablePassport;
    this.passportThreshold = options.passportThreshold;
    this.matchingCapAmount = options.matchingCapAmount;
    this.overrides = options.overrides;
    this.ignoreSaturation = options.ignoreSaturation;
    this.chain = options.chain;
  }

  private votesWithCoefficientToContribution(
    votes: VoteWithCoefficient[]
  ): (Contribution & { recipientAddress: string })[] {
    return votes.flatMap((vote) => {
      const scaleFactor = 10_000;
      const coefficient = BigInt(
        Math.trunc((this.overrides[vote.id] ?? vote.coefficient) * scaleFactor)
      );

      const amount = BigInt(vote.amountRoundToken);
      const multipliedAmount = (amount * coefficient) / BigInt(scaleFactor);

      return [
        {
          contributor: vote.voter,
          recipient: vote.applicationId,
          recipientAddress: vote.grantAddress,
          amount: multipliedAmount,
        },
      ];
    });
  }

  async calculate(): Promise<Array<AugmentedResult>> {
    const votes = await this.parseJSONFile<Vote>(
      "votes",
      `${this.chainId}/rounds/${this.roundId}/votes.json`
    );

    return this._calculate(votes);
  }

  private async _calculate(
    votes: Vote[],
    options?: { bypassPassportCheckForAddresses: string[] }
  ): Promise<Array<AugmentedResult>> {
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

    const votesWithCoefficients = await getVotesWithCoefficients(
      this.chain,
      round,
      applications,
      votes,
      this.passportProvider,
      {
        minimumAmountUSD: this.minimumAmountUSD,
        enablePassport: this.enablePassport,
        passportThreshold: this.passportThreshold,
        bypassPassportCheckForAddresses:
          options?.bypassPassportCheckForAddresses ?? [],
      }
    );

    const contributions: Contribution[] =
      this.votesWithCoefficientToContribution(votesWithCoefficients);

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
    const votes = await this.parseJSONFile<Vote>(
      "votes",
      `${this.chainId}/rounds/${this.roundId}/votes.json`
    );

    const rounds = await this.parseJSONFile<Round>(
      "rounds",
      `${this.chainId}/rounds.json`
    );

    const round = rounds.find((round) => round.id === this.roundId);

    if (round === undefined) {
      throw new ResourceNotFoundError("round");
    }

    const currentResults = await this._calculate(votes);
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
        tokenDecimals: 18,
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

    const potentialResults = await this._calculate(
      [...votes, ...potentialVotesAugmented],
      {
        bypassPassportCheckForAddresses: potentialVotes.map(
          (potentialVote) => potentialVote.voter
        ),
      }
    );

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
