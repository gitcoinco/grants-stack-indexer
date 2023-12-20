import fs from "fs/promises";
import path from "path";
import { DataProvider } from "../calculator/dataProvider/index.js";
import { FileNotFoundError } from "../calculator/errors.js";
import {
  AddressToPassportScoreMap,
  PassportProvider,
  PassportScore,
} from "../passport/index.js";
import { Price } from "../prices/common.js";
import { isPresent } from "ts-is-present";
import { PriceProvider } from "../prices/provider.js";
import { zeroAddress } from "viem";

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
    _chainId: number,
    tokenAddress: string,
    _blockNumber?: number
  ): Promise<Price & { decimals: number }> {
    return Promise.resolve({
      price: 1,
      token: tokenAddress,
      block: 0,
      code: "",
      decimals: 18,
      timestamp: 0,
    });
  }

  async getAllPricesForChain(_chainId: number): Promise<Price[]> {
    return Promise.resolve([
      {
        price: 1,
        token: zeroAddress,
        block: 0,
        code: "",
        decimals: 18,
        timestamp: 0,
      },
    ]);
  }
}
