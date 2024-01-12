import fs from "fs/promises";
import path from "path";
import { Address } from "../types.js";
import { DataProvider } from "../calculator/dataProvider/index.js";
import { FileNotFoundError } from "../calculator/errors.js";
import {
  AddressToPassportScoreMap,
  PassportProvider,
  PassportScore,
} from "../passport/index.js";
import { isPresent } from "ts-is-present";
import { PriceProvider, PriceWithDecimals } from "../prices/provider.js";

type Fixtures = { [path: string]: string | undefined | unknown[] };

export const loadFixture = async (
  name: string,
  extension = "json"
): Promise<string> => {
  const p = path.resolve(__dirname, "./fixtures", `${name}.${extension}`);
  const data = await fs.readFile(p, "utf8");
  return data;
};

export class TestPassportProvider implements PassportProvider {
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

  async getScoresByAddresses(
    addresses: string[]
  ): Promise<AddressToPassportScoreMap> {
    if (this._fixture === null) {
      this._fixture = JSON.parse(
        await loadFixture("passport_scores")
      ) as PassportScore[];
    }
    const fixture = this._fixture;
    return new Map(
      addresses
        .map((address) => fixture.find((score) => score.address === address))
        .filter(isPresent)
        .map((score) => [score.address, score])
    );
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
  async getUSDConversionRate(
    chainId: number,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ): Promise<PriceWithDecimals> {
    return Promise.resolve({
      id: 0,
      tokenDecimals: 18,
      chainId: chainId,
      priceInUsd: 1,
      tokenAddress: tokenAddress,
      blockNumber: blockNumber === "latest" ? 0n : blockNumber,
      timestamp: new Date(),
    });
  }
}
