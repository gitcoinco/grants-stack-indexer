import fs from "node:fs/promises";
import path from "node:path";
import { Cache, ToBlock } from "chainsauce";
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
  cache: Cache | null,
  chain: Chain,
  toBlock: number | "latest" = "latest"
) {
  const currentPrices = await getPrices(chain.id);

  // get last updated price
  const lastPriceAt = currentPrices.reduce(
    (acc, price) => Math.max(price.timestamp + hours(1), acc),
    getPricesFrom
  );

  let toDate = undefined;

  if (toBlock === "latest") {
    toDate = new Date();
  } else {
    const block = await provider.getBlock(toBlock);
    toDate = new Date(block.timestamp * 1000);
  }

  // time elapsed from the last update, rounded to hours
  const timeElapsed =
    Math.floor((toDate.getTime() - lastPriceAt) / hours(1)) * hours(1);

  // only fetch new prices every new hour
  if (timeElapsed < hours(1)) {
    return;
  }

  const getCacheLazy = async <T>(cacheKey: string, fn: () => Promise<T>) => {
    if (cache) {
      return await cache.lazy(cacheKey, fn);
    } else {
      return await fn();
    }
  };

  const getBlockTimestamp = async (blockNumber: number) => {
    const block = await getCacheLazy(
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

      const prices = await getCacheLazy(cacheKey, () =>
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
  cache: Cache | null,
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

export interface PriceUpdaterService {
  catchupAndWatch: () => Promise<void>;
  fetchPricesUntilBlock: (toBlock: ToBlock) => Promise<void>;
}

interface PriceUpdaterConfig {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  cache: Cache | null;
  chain: Chain;
}

export function createPriceUpdater(
  config: PriceUpdaterConfig
): PriceUpdaterService {
  async function catchupAndWatch() {
    await fetchPricesUntilBlock("latest");

    watchLoop();
  }

  async function fetchPricesUntilBlock(toBlock: ToBlock) {
    await updatePricesAndWrite(
      config.rpcProvider,
      config.cache,
      config.chain,
      toBlock
    );
  }

  function watchLoop() {
    updatePricesAndWrite(config.rpcProvider, config.cache, config.chain)
      .then(() => {
        setTimeout(watchLoop, minutes(1));
      })
      .catch((err) => console.error(err));
  }

  return {
    catchupAndWatch,
    fetchPricesUntilBlock,
  };
}

interface PriceProviderConfig {
  updateEvery?: number; // XXX hint at time type: secs? msecs?
}

export interface PriceProvider {
  convertToUSD: (
    chainId: number,
    token: string,
    amount: bigint,
    blockNumber?: number
  ) => Promise<{ amount: number; price: number }>;
  convertFromUSD: (
    chainId: number,
    token: string,
    amount: number,
    blockNumber: number
  ) => Promise<{ amount: bigint; price: number }>;
}

export function createPriceProvider(
  config: PriceProviderConfig
): PriceProvider {
  type Prices = { lastUpdatedAt: Date; prices: Promise<Price[]> };

  const prices: { [key: number]: Prices } = {};

  function shouldRefreshPrices(prices: Prices) {
    return (
      new Date().getTime() - prices.lastUpdatedAt.getTime() >
      (config.updateEvery ?? 2000)
    );
  }

  function updatePrices(chainId: number) {
    const chainPrices = readPricesFile(chainId);

    prices[chainId] = {
      prices: chainPrices,
      lastUpdatedAt: new Date(),
    };

    return chainPrices;
  }

  async function getPrices(chainId: number): Promise<Price[]> {
    if (!prices[chainId] || shouldRefreshPrices(prices[chainId])) {
      await updatePrices(chainId);
    }

    return prices[chainId].prices;
  }

  async function convertToUSD(
    chainId: number,
    token: string,
    amount: bigint,
    blockNumber?: number
  ): Promise<{ amount: number; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );
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

  async function convertFromUSD(
    chainId: number,
    token: string,
    amount: number,
    blockNumber: number
  ): Promise<{ amount: bigint; price: number }> {
    const closestPrice = await getUSDConversionRate(
      chainId,
      token,
      blockNumber
    );
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

  async function getUSDConversionRate(
    chainId: number,
    token: string,
    blockNumber?: number
  ): Promise<Price & { decimals: number }> {
    let closestPrice: Price | null = null;

    if (
      // goerli
      chainId === 5 ||
      // pgn-testnet
      chainId === 58008
    ) {
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

    const prices = await getPrices(chainId);

    for (let i = prices.length - 1; i >= 0; i--) {
      const price = prices[i];
      if (
        price.token === token &&
        (!blockNumber || price.block < blockNumber)
      ) {
        closestPrice = price;
        break;
      }
    }

    if (!closestPrice) {
      throw Error(`Price not found, token ${token} for chain ${chainId}`);
    }

    return { ...closestPrice, decimals: tokenDecimals[chainId][token] };
  }

  return {
    convertToUSD,
    convertFromUSD,
  };
}
