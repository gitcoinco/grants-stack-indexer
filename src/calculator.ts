import fs from "fs";
import { linearQF, Contribution } from "pluralistic";

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
    const votesPath = `${this.baseDataPath}/${this.chainID}/rounds/${this.roundID}/votes.json`;
    const votesData = fs.readFileSync(votesPath, {
      encoding: "utf8",
      flag: "r",
    });

    const rawContributions = JSON.parse(votesData);

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

    return results;
  }
}
