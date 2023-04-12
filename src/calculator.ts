import fs from "fs";
import { linearQF, Contribution } from "pluralistic";

type AugmentedResult = {
  totalReceived: number;
  sumOfSqrt: number;
  matched: number;
  projectName: string;
  payoutAddress: string;
};

export default class Calculator {
  private baseDataPath: string;
  private chainID: string;
  private roundID: string;

  constructor(baseDataPath: string, chainID: string, roundID: string) {
    this.baseDataPath = baseDataPath;
    this.chainID = chainID;
    this.roundID = roundID;
  }

  calculate() {
    const rawContributions = this.parseJSONFile(
      `${this.chainID}/rounds/${this.roundID}/votes.json`
    );
    const projects = this.parseJSONFile(`${this.chainID}/projects.json`);
    const applications = this.parseJSONFile(
      `${this.chainID}/rounds/${this.roundID}/projects.json`
    );

    const contributions: Array<Contribution> = rawContributions.map(
      (raw: any) => ({
        contributor: raw.voter,
        recipient: raw.projectId,
        amount: raw.amountUSD,
      })
    );

    const results = linearQF(contributions, 333000, {
      minimumAmount: 1,
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
