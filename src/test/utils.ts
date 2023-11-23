import fs from "fs/promises";
import path from "path";
import { DataProvider, FileNotFoundError } from "../calculator/index.js";
import { PassportScore } from "../passport/index.js";
import { Price } from "../database/schema.js";
import { Address } from "../types.js";
import { PriceProvider } from "../prices/provider.js";

type Fixtures = { [path: string]: string | undefined | unknown[] };

export const loadFixture = async (
  name: string,
  extension = "json"
): Promise<string> => {
  const p = path.resolve(__dirname, "./fixtures", `${name}.${extension}`);
  const data = await fs.readFile(p, "utf8");
  return data;
};

export class TestPassportProvider {
  _fixture: PassportScore[] | null = null;

  async start() {}

  async stop() {}

  async getScoreByAddress(address: string): Promise<PassportScore | undefined> {
    if (this._fixture === null) {
      this._fixture = JSON.parse(
        await loadFixture("passport_scores")
      ) as PassportScore[];
    }
    return this._fixture.find((score) => score.address === address);
  }
}

export class TestDataProvider implements DataProvider {
  fixtures: Fixtures;

  constructor(fixtures: Fixtures) {
    this.fixtures = fixtures;
  }

  async loadFile<T>(description: string, path: string): Promise<Array<T>> {
    const fixture = this.fixtures[path];
    if (fixture === undefined) {
      throw new FileNotFoundError(description);
    }

    if (typeof fixture !== "string") {
      return fixture as Array<T>;
    }

    return JSON.parse(await loadFixture(fixture)) as Array<T>;
  }
}

export class TestPriceProvider implements PriceProvider {
  async convertToUSD() {
    return Promise.resolve({ amount: 0 });
  }

  async convertFromUSD() {
    return Promise.resolve({ amount: 0 });
  }

  async getAllPricesForChain(_chainId: number): Promise<Price[]> {
    return Promise.resolve([]);
  }

  async getUSDConversionRate(
    chainId: number,
    tokenAddress: Address,
    blockNumber: bigint
  ): Promise<Price & { tokenDecimals: number }> {
    return Promise.resolve({
      id: 0,
      tokenDecimals: 18,
      chainId: chainId,
      priceInUsd: 1_000_000_000,
      tokenAddress: tokenAddress,
      blockNumber: blockNumber,
      timestamp: new Date(),
    });
  }
}
