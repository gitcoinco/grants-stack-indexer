import { Logger } from "pino";
import { Token, getChainConfigById } from "../config.js";
import { UnknownTokenError } from "./common.js";
import { convertTokenToFiat, convertFiatToToken } from "../tokenMath.js";
import { Database } from "../database/index.js";
import { Price } from "../database/schema.js";
import { Address, ChainId, FetchInterface } from "../types.js";
import { LRUCache } from "lru-cache";
import { fetchPricesForRange } from "./coinGecko.js";
import { parseAddress } from "../address.js";

export type PriceWithDecimals = Omit<Price, "id"> & { tokenDecimals: number };

const FETCH_NEW_PRICE_EVERY_NTH_BLOCK_PER_CHAIN: Record<number, bigint> = {
  10: 7200n,
  42161: 7200n,
  424: 7200n,
};

const DEFAULT_FETCH_NEW_PRICE_EVERY_NTH_BLOCK = 2000n;

export async function convertFromUSD(
  priceProvider: PriceProvider,
  chainId: number,
  token: Address,
  amountInUSD: number,
  blockNumber: bigint | "latest"
): Promise<{ amount: bigint; price: number; timestamp: Date }> {
  const closestPrice = await priceProvider.getUSDConversionRate(
    chainId,
    token,
    blockNumber
  );

  return {
    amount: convertFiatToToken({
      fiatAmount: amountInUSD,
      tokenPrice: closestPrice.priceInUsd,
      tokenPriceDecimals: 8,
      tokenDecimals: closestPrice.tokenDecimals,
    }),
    timestamp: closestPrice.timestamp,
    price: 1 / closestPrice.priceInUsd, // price is the token price in USD, we return the inverse
  };
}

export async function convertToUSD(
  priceProvider: PriceProvider,
  chainId: number,
  token: Address,
  amount: bigint,
  blockNumber: bigint | "latest"
): Promise<{ amount: number; price: number; timestamp: Date }> {
  const closestPrice = await priceProvider.getUSDConversionRate(
    chainId,
    token,
    blockNumber
  );

  return {
    amount: convertTokenToFiat({
      tokenAmount: amount,
      tokenDecimals: closestPrice.tokenDecimals,
      tokenPrice: closestPrice.priceInUsd,
      tokenPriceDecimals: 8,
    }),
    timestamp: closestPrice.timestamp,
    price: closestPrice.priceInUsd,
  };
}

interface PriceProviderConfig {
  db: Database;
  logger: Logger;
  coingeckoApiKey: string | null;
  coingeckoApiUrl: string;
  getBlockTimestampInMs: (
    chainId: ChainId,
    blockNumber: bigint
  ) => Promise<number>;
  fetch: FetchInterface;
}

export interface PriceProvider {
  getUSDConversionRate: (
    chainId: ChainId,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ) => Promise<PriceWithDecimals>;
}

export function createPriceProvider(
  config: PriceProviderConfig
): PriceProvider {
  const { db, logger } = config;
  const cache = new LRUCache<string, Promise<PriceWithDecimals>>({
    max: 100,
  });

  // PUBLIC

  async function getUSDConversionRate(
    chainId: number,
    tokenAddress: Address,
    blockNumber: bigint | "latest"
  ): Promise<PriceWithDecimals> {
    const chain = getChainConfigById(chainId);

    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (token === undefined) {
      throw new UnknownTokenError(tokenAddress, chainId);
    }

    if (blockNumber === "latest") {
      const priceWithoutDecimals = await db.getTokenPriceByBlockNumber(
        chainId,
        tokenAddress,
        blockNumber
      );

      if (priceWithoutDecimals !== null) {
        return {
          ...priceWithoutDecimals,
          tokenDecimals: token.decimals,
        };
      }

      throw new Error(
        `Price not found for token ${tokenAddress} on chain ${chainId} and block ${blockNumber}`
      );
    }

    const fetchNewPriceEveryNthBlock =
      FETCH_NEW_PRICE_EVERY_NTH_BLOCK_PER_CHAIN[chainId] ??
      DEFAULT_FETCH_NEW_PRICE_EVERY_NTH_BLOCK;

    const roundedBlockNumber =
      blockNumber - (blockNumber % fetchNewPriceEveryNthBlock);

    const cacheKey = `${chainId}-${tokenAddress}-${roundedBlockNumber}`;
    const cachedPrice = cache.get(cacheKey);

    if (cachedPrice !== undefined) {
      return cachedPrice;
    }

    const pricePromise = fetchPriceForToken(
      chainId,
      token,
      roundedBlockNumber
    ).then((price) => {
      if (price === null) {
        throw new Error(
          `Price not found for token ${tokenAddress} on chain ${chainId} and block ${blockNumber}`
        );
      } else {
        return price;
      }
    });

    cache.set(cacheKey, pricePromise);

    return pricePromise;
  }

  // INTERNALS

  async function fetchPriceForToken(
    chainId: ChainId,
    token: Token,
    blockNumber: bigint
  ): Promise<PriceWithDecimals | null> {
    const blockTimestampInMs = await config.getBlockTimestampInMs(
      chainId,
      blockNumber
    );

    // sometimes coingecko returns no prices for 1 hour range, 2 hours works better
    const twoHoursInMs = 2 * 60 * 60 * 1000;

    const prices = await fetchPricesForRange({
      chainId: token.priceSource.chainId,
      tokenAddress: parseAddress(token.priceSource.address),
      startTimestampInMs: blockTimestampInMs - twoHoursInMs,
      endTimestampInMs: blockTimestampInMs,
      coingeckoApiUrl: config.coingeckoApiUrl,
      coingeckoApiKey: config.coingeckoApiKey,
      fetch: (url, opts) => config.fetch(url, opts),
    });

    if (prices.length > 0) {
      const [priceTimestamp, priceInUsd] = prices[0];
      const newPrice = {
        chainId,
        tokenAddress: parseAddress(token.address),
        blockNumber: blockNumber,
        priceInUsd: priceInUsd,
        timestamp: new Date(blockTimestampInMs),
      };

      const timestampDiff = Math.abs(blockTimestampInMs - priceTimestamp);

      if (timestampDiff > twoHoursInMs) {
        logger.warn({
          msg: "Timestamp diff between block and Coingecko timestamps is larger than 2 hours",
          blockTimestamp: blockTimestampInMs,
          priceTimestamp: priceTimestamp,
          timestampDiff,
        });
      }

      await db.applyChange({
        type: "InsertManyPrices",
        prices: [newPrice],
      });

      return { ...newPrice, tokenDecimals: token.decimals };
    }

    return null;
  }

  return {
    getUSDConversionRate,
  };
}
