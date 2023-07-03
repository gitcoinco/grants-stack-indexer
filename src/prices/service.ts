import { ethers } from "ethers";
import { Cache } from "chainsauce";

import { hours, days, minutes } from "../utils/time.js";
import type { Price } from "./index.js";

import { findBlockByTimestamp } from "../utils/findBlockFromTimestamp.js";
import { getPricesByHour } from "./coinGecko.js";
import { Chain } from "../config.js";

type JsonRpcProvider = ethers.providers.JsonRpcProvider;

function chunkTimestampBy(
  timestampMs: number,
  chunkByMs: number
): [number, number][] {
  const chunks: [number, number][] = [];

  for (let i = 0; i < timestampMs; i += chunkByMs) {
    const chunkEndTime = Math.min(i + chunkByMs, timestampMs);
    chunks.push([i, chunkEndTime]);
  }

  return chunks;
}

export async function fetchNewPrices(
  chain: Chain,
  fromTimestampMs: number,
  toTimestampMs: number,
  provider: JsonRpcProvider,
  cache?: Cache
) {
  const getCacheLazy = async <T>(cacheKey: string, fn: () => Promise<T>) => {
    if (cache) {
      return await cache.lazy(cacheKey, fn);
    } else {
      return await fn();
    }
  };

  const getBlockTimestamp = async (blockNumber: number) => {
    const cacheKey = `block-${chain.id}-${blockNumber}`;
    console.log(
      `Fetching block ${blockNumber} for timestamp`,
      !!(await cache?.get(cacheKey))
    );
    const block = await getCacheLazy(
      `block-${chain.id}-${blockNumber}`,
      async () => {
        return await provider.getBlock(blockNumber);
      }
    );

    return block.timestamp;
  };

  const lastBlockNumber = await provider.getBlockNumber();

  const timeElapsed = toTimestampMs - fromTimestampMs;

  // get prices in 90 day chunks to get the most of Coingecko's granularity
  const timeChunks = chunkTimestampBy(timeElapsed, days(90));

  const newPrices: Price[] = [];

  for (const chunk of timeChunks) {
    for (const token of chain.tokens) {
      const cacheKey = `${chain.id}-${token.address}-${
        fromTimestampMs + chunk[0]
      }-${fromTimestampMs + chunk[1]}`;

      console.log(
        "Fetching prices for",
        token.code,
        ":",
        new Date(fromTimestampMs + chunk[0]),
        "-",
        new Date(fromTimestampMs + chunk[1])
      );

      const prices = await getCacheLazy(cacheKey, () =>
        getPricesByHour(
          token.address,
          chain.id,
          (fromTimestampMs + chunk[0]) / 1000,
          (fromTimestampMs + chunk[1]) / 1000
        )
      );

      for (const [timestamp, price] of prices) {
        const blockNumber = await findBlockByTimestamp(
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

        // previousBlock = blockNumber;
      }
    }
  }

  return newPrices;
}

interface PricesService {
  start: () => Promise<void>;
  stop: () => void;
  getPrices: () => Promise<Price[]>;
}

export interface PriceStorage {
  write: (prices: Price[]) => Promise<void>;
  read: () => Promise<Price[]>;
}

export interface PricesServiceConfig {
  mode: "realtime" | "historical";
  chain: Chain;
  provider: JsonRpcProvider;
  storage: PriceStorage;
  cache?: Cache;
  fromTimestamp: number;
  toTimestamp?: number | "now";
}

export function createPricesService(
  config: PricesServiceConfig
): PricesService {
  let currentPrices: Price[] | undefined;

  const start = async () => {
    if (config.mode === "realtime") {
      await fetchPricesAndWrite();
      await loop();
    } else {
      await fetchPricesAndWrite();
    }
  };

  const fetchPricesAndWrite = async () => {
    currentPrices = await config.storage.read();

    // get the most recent price, if there's one
    const mostRecentPrice =
      currentPrices.length > 0
        ? currentPrices.reduce(
            (max, price) => (price.timestamp > max.timestamp ? price : max),
            currentPrices[0]
          )
        : null;

    // get the last price timestamp + 1 hour,
    // or the start timestamp if there's none
    const lastPriceAt = mostRecentPrice
      ? mostRecentPrice.timestamp + hours(1)
      : config.fromTimestamp;

    const now = new Date();

    // time elapsed from the last update, rounded to hours
    const timeElapsed =
      Math.floor((now.getTime() - lastPriceAt) / hours(1)) * hours(1);

    // only fetch new prices every new hour
    if (timeElapsed < hours(1)) {
      return;
    }

    // fetch from the last price timestamp to now
    const newPrices = await fetchNewPrices(
      config.chain,
      lastPriceAt,
      now.getTime(),
      config.provider,
      config.cache
    );

    currentPrices = currentPrices.concat(newPrices);
    config.storage.write(currentPrices);
  };

  const getPrices = async () => {
    if (!currentPrices) {
      currentPrices = await config.storage.read();
    }

    return currentPrices;
  };

  let timeout: NodeJS.Timeout;

  const loop = async () => {
    await fetchPricesAndWrite();
    timeout = setTimeout(loop, minutes(1));
  };

  const stop = () => {
    clearTimeout(timeout);
  };

  return { start, stop, getPrices };
}
