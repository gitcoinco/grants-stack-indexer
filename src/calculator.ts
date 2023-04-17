import fs from "fs";
import { linearQF, Contribution, Calculation } from "pluralistic";

export interface CalculatorOptions {
  baseDataPath: string;
  chainId: string;
  roundId: string;
  matchAmount: number;
  minimumAmount?: number;
  passportThreshold?: number;
  enablePassport?: boolean;
}

export type AugmentedResult = Calculation & {
  projectName: string;
  payoutAddress: string;
};

export interface RawContribution {
  voter: string;
  projectId: string;
  amountUSD: number;
}

export default class Calculator {
  private baseDataPath: string;
  private chainId: string;
  private roundId: string;
  private matchAmount: number;
  private minimumAmount: number | undefined;
  private enablePassport: boolean | undefined;
  private passportThreshold: number | undefined;

  constructor(options: CalculatorOptions) {
    const {
        baseDataPath,
        chainId,
        roundId,
        matchAmount,
        minimumAmount,
        enablePassport,
        passportThreshold,
    } = options;
    this.baseDataPath = baseDataPath;
    this.chainId = chainId;
    this.roundId = roundId;
    this.matchAmount = matchAmount;
    this.minimumAmount = minimumAmount;
    this.enablePassport = enablePassport;
    this.passportThreshold = passportThreshold;
  }

  calculate() {
    const rawContributions = this.parseJSONFile(
        `${this.chainId}/rounds/${this.roundId}/votes.json`
    );
    const projects = this.parseJSONFile(`${this.chainId}/projects.json`);
    const applications = this.parseJSONFile(
        `${this.chainId}/rounds/${this.roundId}/projects.json`
    );
    const rounds = this.parseJSONFile(`${this.chainId}/rounds.json`);
    const passportScores = this.parseJSONFile("passport_scores.json");

    const currentRound = rounds.find((r: any) => r.id === this.roundId);
    const minAmount = this.minimumAmount ?? currentRound.minimumAmount ?? 0;

    const isEligible = (c: Contribution, addressData: any): boolean => {
      const hasValidEvidence = addressData?.evidence?.success;

      if (this.enablePassport) {
        if (typeof this.passportThreshold !== 'undefined') {
          return (
              parseFloat(addressData?.evidence.rawScore ?? '0') > this.passportThreshold
          );
        } else {
          return hasValidEvidence;
        }
      }
      return true;
    };

    let contributions: Array<Contribution> = rawContributions.map(
        (raw: RawContribution) => ({
          contributor: raw.voter,
          recipient: raw.projectId,
          amount: raw.amountUSD,
        })
    );

    contributions = contributions.filter((c: Contribution) => {
      const addressData = passportScores.find((ps: any) => ps.address === c.contributor);

      return c.amount >= minAmount && isEligible(c, addressData);
    });

    const results = linearQF(contributions, this.matchAmount, {
      minimumAmount: this.minimumAmount ?? currentRound.minimumAmount,
      ignoreSaturation: true,
    });

    const augmented: Array<AugmentedResult> = [];
    for (const id in results) {
      const calc = results[id];
      const project = projects.find((p: any) => p.id === id);
      const application = applications.find((a: any) => a.id === id);

      augmented.push({
        totalReceived: calc.totalReceived,
        sumOfSqrt: calc.sumOfSqrt,
        matched: calc.matched,
        projectName: project?.metadata?.title,
        payoutAddress: application?.payoutAddress,
      });
    }

    return augmented;
  }

  parseJSONFile(path: string) {
    const fullPath = `${this.baseDataPath}/${path}`;
    const data = fs.readFileSync(fullPath, {
      encoding: "utf8",
      flag: "r",
    });

    return JSON.parse(data);
  }
}
