import fs from "node:fs/promises";
import { existsSync } from "fs";
import path from "node:path";
import config from "./config.js";
import { tokenDecimals } from "./config.js";

export type Price = {
  token: string;
  code: string;
  price: number;
  timestamp: number;
  block: number;
};

export async function getPrices(chainId: number): Promise<Price[]> {
  return readPricesFile(pricesFilename(chainId));
}

export async function appendPrices(chainId: number, newPrices: Price[]) {
  const currentPrices = await getPrices(chainId);
  await writePrices(chainId, currentPrices.concat(newPrices));
}

function createPriceProvider(updateEvery = 2000) {
  type Prices = { lastUpdatedAt: Date; prices: Promise<Price[]> };

  const prices: { [key: number]: Prices } = {};

  function shouldRefreshPrices(prices: Prices) {
    return new Date().getTime() - prices.lastUpdatedAt.getTime() > updateEvery;
  }

  return {
    getPrices(chainId: number): Promise<Price[]> {
      if (!prices[chainId] || shouldRefreshPrices(prices[chainId])) {
        const chainPrices = getPrices(chainId);

        prices[chainId] = {
          prices: chainPrices,
          lastUpdatedAt: new Date(),
        };

        return chainPrices;
      }

      return prices[chainId].prices;
    },
  };
}

export async function convertToUSD(
  chainId: number,
  token: string,
  amount: bigint,
  blockNumber: number
): Promise<number> {
  let closestPrice: Price | null = null;

  if (chainId === 5) {
    return 1;
  }

  if (!tokenDecimals[chainId][token]) {
    throw Error(`Unsupported token ${token} for chain ${chainId}`);
  }

  const decimals = tokenDecimals[chainId][token];
  const prices = await priceProvider.getPrices(chainId);

  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    if (price.token === token && price.block < blockNumber) {
      closestPrice = price;
      break;
    }
  }

  if (!closestPrice) {
    throw Error(`Price not found, token ${token} for chain ${chainId}`);
  }

  const decimalFactor = 10n ** BigInt(decimals);
  const priceCents = BigInt(Math.trunc(closestPrice.price * 100));

  return Number((amount * priceCents) / decimalFactor) / 100;
}

export const priceProvider = createPriceProvider();

function pricesFilename(chainId: number): string {
  return path.join(config.storageDir, `${chainId}/prices.json`);
}

async function readPricesFile(filename: string): Promise<Price[]> {
  if (existsSync(filename)) {
    return JSON.parse((await fs.readFile(filename)).toString()) as Price[];
  }

  return [];
}

async function writePrices(chainId: number, prices: Price[]) {
  return writePricesFile(pricesFilename(chainId), prices);
}

async function writePricesFile(filename: string, prices: Price[]) {
  const tempFile = `${filename}.write`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(prices));
  await fs.rename(tempFile, filename);
}
