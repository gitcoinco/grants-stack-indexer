/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import csv from "csv-parser";
import { linearQF, Contribution, Calculation } from "pluralistic";

export class FileNotFoundError extends Error {
  constructor(fileDescription: string) {
    super(`cannot find ${fileDescription} file`);
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

export class OverridesColumnNotFoundError extends Error {
  constructor(column: string) {
    super(`cannot find column ${column} in the overrides file`);
  }
}

export interface DataProvider {
  loadFile(description: string, path: string): Array<any>;
}

export type Overrides = {
  [contributionId: string]: string;
};

export class FileSystemDataProvider {
  basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  loadFile(description: string, path: string) {
    const fullPath = `${this.basePath}/${path}`;
    if (!fs.existsSync(fullPath)) {
      throw new FileNotFoundError(description);
    }

    const data = fs.readFileSync(fullPath, {
      encoding: "utf8",
      flag: "r",
    });

    return JSON.parse(data);
  }
}

export function parseOverrides(buf: Buffer): Promise<any> {
  return new Promise((resolve, _reject) => {
    const results: Overrides = {};
    const stream = csv()
      .on("headers", (headers) => {
        if (headers.indexOf("contributionId") < 0) {
          throw new OverridesColumnNotFoundError("contributionId");
        }

        if (headers.indexOf("coefficient") < 0) {
          throw new OverridesColumnNotFoundError("coefficient");
        }
      })
      .on("data", (data) => {
        results[data["contributionId"]] = data["coefficient"];
      })
      .on("end", () => {
        resolve(results);
      });

    stream.write(buf);
    stream.end();
  });
}

export type CalculatorOptions = {
  dataProvider: DataProvider;
  chainId: string;
  roundId: string;
  minimumAmount?: number;
  passportThreshold?: number;
  enablePassport?: boolean;
  ignoreSaturation?: boolean;
  overrides: Overrides;
};

export type AugmentedResult = Calculation & {
  projectId: string;
  applicationId: string;
  projectName: string;
  payoutAddress: string;
  contributionsCount: number;
};

type RawContribution = {
  id: string;
  voter: string;
  projectId: string;
  applicationId: string;
  amountUSD: number;
};

type RawRound = {
  matchAmount: string;
  matchAmountUSD: number;
  id: string;
};

export default class Calculator {
  private dataProvider: DataProvider;
  private chainId: string;
  private roundId: string;
  private minimumAmount: number | undefined;
  private enablePassport: boolean | undefined;
  private passportThreshold: number | undefined;
  private ignoreSaturation: boolean | undefined;
  private overrides: Overrides;

  constructor(options: CalculatorOptions) {
    const {
      dataProvider,
      chainId,
      roundId,
      minimumAmount,
      enablePassport,
      passportThreshold,
      ignoreSaturation,
      overrides,
    } = options;
    this.dataProvider = dataProvider;
    this.chainId = chainId;
    this.roundId = roundId;
    this.minimumAmount = minimumAmount;
    this.enablePassport = enablePassport;
    this.passportThreshold = passportThreshold;
    this.ignoreSaturation = ignoreSaturation;
    this.overrides = overrides;
  }

  calculate() {
    const rawContributions: Array<RawContribution> = this.parseJSONFile(
      "votes",
      `${this.chainId}/rounds/${this.roundId}/votes.json`
    );
    const applications = this.parseJSONFile(
      "applications",
      `${this.chainId}/rounds/${this.roundId}/applications.json`
    );
    const rounds = this.parseJSONFile("rounds", `${this.chainId}/rounds.json`);
    const passportScores = this.parseJSONFile(
      "passport scores",
      "passport_scores.json"
    );

    const round = rounds.find((r: RawRound) => r.id === this.roundId);
    if (round === undefined) {
      throw new ResourceNotFoundError("round");
    }

    if (round.matchAmountUSD === undefined) {
      throw new ResourceNotFoundError("round match amount");
    }

    const isEligible = (addressData: any): boolean => {
      const hasValidEvidence = addressData?.evidence?.success;

      if (this.enablePassport) {
        if (typeof this.passportThreshold !== "undefined") {
          return (
            parseFloat(addressData?.evidence.rawScore ?? "0") >
            this.passportThreshold
          );
        } else {
          return hasValidEvidence;
        }
      }
      return true;
    };

    const passportIndex = passportScores.reduce((ps: any, acc: any) => {
      acc[ps.address] = ps;
      return acc;
    }, {});

    const contributions: Array<Contribution> = [];

    for (let i = 0; i < rawContributions.length; i++) {
      const raw = rawContributions[i];
      const addressData = passportIndex[raw.voter];
      const override = this.overrides[raw.id];

      if (override !== undefined && override !== "1") {
        continue;
      }

      if (!isEligible(addressData)) {
        continue;
      }

      contributions.push({
        contributor: raw.voter,
        recipient: raw.applicationId,
        amount: raw.amountUSD,
      });
    }

    const results = linearQF(contributions, round.matchAmountUSD, {
      minimumAmount: this.minimumAmount ?? round.minimumAmount ?? 0,
      ignoreSaturation: this.ignoreSaturation ?? false, 
    });

    const augmented: Array<AugmentedResult> = [];
    for (const id in results) {
      const calc = results[id];
      const application = applications.find((a: any) => a.id === id);

      augmented.push({
        totalReceived: calc.totalReceived,
        sumOfSqrt: calc.sumOfSqrt,
        matched: calc.matched,
        projectId: application.projectId,
        applicationId: application.id,
        contributionsCount: application.votes,
        projectName: application.metadata?.application?.project?.title,
        payoutAddress: application.metadata?.application?.recipient,
      });
    }

    return augmented;
  }

  parseJSONFile(fileDescription: string, path: string) {
    return this.dataProvider.loadFile(fileDescription, path);
  }
}
