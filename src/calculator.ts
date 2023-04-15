import fs from "fs";
import { linearQF, Contribution, Calculation } from "pluralistic";
import {AugmentedResult, CalculatorOptions, RawContribution} from "./types.js";


export default class Calculator {
  private baseDataPath: string;
  private chainId: string;
  private roundId: string;
  private matchAmount: number;
  private minimumAmount: number | undefined;
  private passport: boolean | undefined;
  private passportThreshold: number | undefined;

  constructor(options: CalculatorOptions) {
    const {
        baseDataPath,
        chainId,
        roundId,
        matchAmount,
        minimumAmount,
        passport,
        passportThreshold,
    } = options;
    this.baseDataPath = baseDataPath;
    this.chainId = chainId;
    this.roundId = roundId;
    this.matchAmount = matchAmount;
    this.minimumAmount = minimumAmount;
    this.passport = passport;
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
    const rounds = this.parseJSONFile(
        `${this.chainId}/rounds.json`
    );
    const passportScores = this.parseJSONFile("passport_scores.json");
    const validAddresses = this.parseJSONFile("passport_valid_addresses.json");

    const currentRound = rounds.find((r: any) => r.id === this.roundId);
    let contributions: Array<Contribution> = rawContributions.map(
        (raw: RawContribution) => ({
          contributor: raw.voter,
          recipient: raw.projectId,
          amount: raw.amountUSD,
        })
    );

    contributions = contributions.filter((c: Contribution) => {
      const addressData = passportScores.find((ps: any) => ps.address === c.contributor);
      const hasValidEvidence = addressData?.evidence?.success;
      const isValidAddress = validAddresses.includes(c.contributor);

      if (this.passport) {
        if (typeof this.passportThreshold !== 'undefined') {
          return (
              c.amount >= (this.minimumAmount ?? currentRound.minimumAmount ?? 0) &&
              parseFloat(addressData?.score ?? '0') > this.passportThreshold
          );
        } else {
          return (
              c.amount >= (this.minimumAmount ?? currentRound.minimumAmount ?? 0) &&
              hasValidEvidence &&
              isValidAddress
          );
        }
      } else {
        return (
            c.amount >= (this.minimumAmount ?? currentRound.minimumAmount ?? 0)
        );
      }
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
