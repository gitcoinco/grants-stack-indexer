import fs from "fs";
import { linearQF, Contribution, Calculation } from "pluralistic";

type AugmentedResult = Calculation & {
  projectName: string;
  payoutAddress: string;
};

interface RawContribution {
  voter: string;
  projectId: string;
  amountUSD: number;
}

export default class Calculator {
  private baseDataPath: string;
  private chainId: string;
  private roundId: string;
  private matchAmount: number;
  private minDonationThreshold: number;

  constructor(
    baseDataPath: string,
    chainId: string,
    roundId: string,
    matchAmount: number, 
    minDonationThreshold: number,
  ) {
    this.baseDataPath = baseDataPath;
    this.chainId = chainId;
    this.roundId = roundId;
    this.matchAmount = matchAmount;
    this.minDonationThreshold = minDonationThreshold;
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
    const currentRound = rounds.find((r: any) => r.id === this.roundId);

    let contributions: Array<Contribution> = rawContributions.map(
      (raw: RawContribution) => ({
        contributor: raw.voter,
        recipient: raw.projectId,
        amount: raw.amountUSD,
      })
    );

   // if round min donation threshold is set, filter contributions
    if (currentRound.minDonationThreshold) {
      const minDonationThreshold = currentRound.minDonationThreshold;
      contributions = contributions.filter((c: Contribution) => {
          return c.amount >= minDonationThreshold;
      });
      // if min donation threshold is not set, filter contributions with the provided minDonationThreshold
    } else {
      contributions = contributions.filter((c: Contribution) => {
          return c.amount >= this.minDonationThreshold;
      });
    }

    const results = linearQF(contributions, this.matchAmount, {
      minimumAmount: this.minDonationThreshold,
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
