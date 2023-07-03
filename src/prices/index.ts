import fs from "node:fs/promises";
import path from "node:path";
import { Cache, RetryProvider } from "chainsauce";
import { ethers } from "ethers";

import { getBlockFromTimestamp } from "../utils/getBlockFromTimestamp.js";
import { getPricesByHour } from "./coinGecko.js";
import { existsSync } from "fs";
import { Chain, tokenDecimals, getPricesConfig } from "../config.js";

// XXX needs to be a function parameter, not a module variable
const config = getPricesConfig();

export type Price = {
  token: string;
  code: string;
  price: number;
  timestamp: number;
  block: number;
};

const cache = new Cache(".cache");

const getPricesFrom = new Date(Date.UTC(2022, 11, 1, 0, 0, 0)).getTime();

const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => minutes(60) * n;
const days = (n: number) => hours(24) * n;

function chunkTimeBy(millis: number, chunkBy: number): [number, number][] {
  const chunks: [number, number][] = [];

  for (let i = 0; i < millis; i += chunkBy) {
    const chunkEndTime = Math.min(i + chunkBy, millis);
    chunks.push([i, chunkEndTime]);
  }

  return chunks;
}

export async function updatePricesAndWrite(
  provider: ethers.providers.JsonRpcProvider,
  cache: Cache,
  chain: Chain
) {
  const currentPrices = await getPrices(chain.id);

  // get last updated price
  const lastPriceAt = currentPrices.reduce(
    (acc, price) => Math.max(price.timestamp + hours(1), acc),
    getPricesFrom
  );

  const now = new Date();

  // time elapsed from the last update, rounded to hours
  const timeElapsed =
    Math.floor((now.getTime() - lastPriceAt) / hours(1)) * hours(1);

  // only fetch new prices every new hour
  if (timeElapsed < hours(1)) {
    return;
  }

  const getBlockTimestamp = async (blockNumber: number) => {
    const block = await cache.lazy(
      `block-${chain.id}-${blockNumber}`,
      async () => {
        return await provider.getBlock(blockNumber);
      }
    );

    return block.timestamp;
  };

  const lastBlockNumber = await provider.getBlockNumber();

  // get prices in 90 day chunks to get the most of Coingecko's granularity
  const timeChunks = chunkTimeBy(timeElapsed, days(90));

  for (const chunk of timeChunks) {
    for (const token of chain.tokens) {
      const cacheKey = `${chain.id}-${token.address}-${
        lastPriceAt + chunk[0]
      }-${lastPriceAt + chunk[1]}`;

      console.log(
        "Fetching prices for",
        token.code,
        ":",
        new Date(lastPriceAt + chunk[0]),
        "-",
        new Date(lastPriceAt + chunk[1])
      );

      const prices = await cache.lazy(cacheKey, () =>
        getPricesByHour(
          token.address,
          chain.id,
          (lastPriceAt + chunk[0]) / 1000,
          (lastPriceAt + chunk[1]) / 1000
        )
      );

      const newPrices: Price[] = [];

      for (const [timestamp, price] of prices) {
        const blockNumber = await getBlockFromTimestamp(
          timestamp,
          0,
          lastBlockNumber,
          getBlockTimestamp
        );

        if (blockNumber === undefined) {
          throw new Error(
            `Could not find block number for timestamp: ${timestamp}`
          );
        }

        newPrices.push({
          token: token.address.toLowerCase(),
          code: token.code,
          price,
          timestamp,
          block: blockNumber,
        });
      }

      console.log("Fetched", newPrices.length, "new prices");

      await appendPrices(chain.id, newPrices);
    }
  }
}

export async function updatePricesAndWriteLoop(
  provider: ethers.providers.JsonRpcProvider,
  cache: Cache,
  chain: Chain
) {
  await updatePricesAndWrite(provider, cache, chain);

  setTimeout(() => {
    void updatePricesAndWriteLoop(provider, cache, chain);
  }, minutes(1));
}

export async function getPrices(chainId: number): Promise<Price[]> {
  return readPricesFile(chainId);
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

  function updatePrices(chainId: number) {
    const chainPrices = getPrices(chainId);

    prices[chainId] = {
      prices: chainPrices,
      lastUpdatedAt: new Date(),
    };

    return chainPrices;
  }

  return {
    async getPrices(chainId: number): Promise<Price[]> {
      if (!prices[chainId] || shouldRefreshPrices(prices[chainId])) {
        await updatePrices(chainId);
      }

      return prices[chainId].prices;
    },
    updatePrices,
  };
}

export async function getUSDConversionRate(
  chainId: number,
  token: string,
  blockNumber?: number
): Promise<Price & { decimals: number }> {
  let closestPrice: Price | null = null;

  // goerli
  if (chainId === 5) {
    return {
      token,
      code: "ETH",
      price: 1,
      timestamp: 0,
      block: 0,
      decimals: 18,
    };
  }

  if (!tokenDecimals[chainId][token]) {
    console.error(`Unsupported token ${token} for chain ${chainId}`);
    return {
      token,
      code: "Unknown",
      price: 0,
      timestamp: 0,
      block: 0,
      decimals: 18,
    };
  }

  const prices = await priceProvider.getPrices(chainId);

  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    if (price.token === token && (!blockNumber || price.block < blockNumber)) {
      closestPrice = price;
      break;
    }
  }

  if (!closestPrice) {
    throw Error(`Price not found, token ${token} for chain ${chainId}`);
  }

  return { ...closestPrice, decimals: tokenDecimals[chainId][token] };
}

export async function convertToUSD(
  chainId: number,
  token: string,
  amount: bigint,
  blockNumber?: number
): Promise<{ amount: number; price: number }> {
  const closestPrice = await getUSDConversionRate(chainId, token, blockNumber);
  const usdDecimalFactor = Math.pow(10, 8);
  const decimalFactor = 10n ** BigInt(closestPrice.decimals);

  const priceInDecimals = BigInt(
    Math.trunc(closestPrice.price * usdDecimalFactor)
  );

  return {
    amount:
      Number((amount * priceInDecimals) / decimalFactor) / usdDecimalFactor,
    price: closestPrice.price,
  };
}

export async function convertFromUSD(
  chainId: number,
  token: string,
  amount: number,
  blockNumber: number
): Promise<{ amount: bigint; price: number }> {
  const closestPrice = await getUSDConversionRate(chainId, token, blockNumber);
  const usdDecimalFactor = Math.pow(10, 8);
  const decimalFactor =
    10n ** BigInt(closestPrice.decimals) / BigInt(usdDecimalFactor);

  const convertedAmountInDecimals =
    BigInt(Math.trunc((amount / closestPrice.price) * usdDecimalFactor)) *
    decimalFactor;

  return {
    amount: convertedAmountInDecimals,
    price: 1 / closestPrice.price,
  };
}

export const priceProvider = createPriceProvider();

function pricesFilename(chainId: number): string {
  return path.join(config.storageDir, `${chainId}/prices.json`);
}

async function readPricesFile(chainId: number): Promise<Price[]> {
  const filename = pricesFilename(chainId);

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
